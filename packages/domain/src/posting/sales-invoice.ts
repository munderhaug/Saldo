/**
 * Sales-invoice posting (build-spec §8.4, feat-invoice-ledger-posting). Turns an ISSUED sales document
 * — its already-derived, frozen per-line revenue split — into the balanced AR voucher the ledger
 * stores: ONE receivable debit for the document gross, a revenue credit per line account, and an
 * output-VAT credit per VAT account. It REUSES the single-line `deriveSales` (the status-branching
 * hard invariant) once per line and merges the legs, so the VAT/registration fork is owned in exactly
 * one place — this module only adds the multi-line aggregation, never a second posting rule.
 *
 * A credit note posts the REVERSING motbilag (`reverseVoucher`) of its own derived voucher — debit
 * revenue + output VAT, credit receivable — never an UPDATE/DELETE of the original (append-only).
 * Pure: it runs identically in the browser preview and the server action; the SQL balance / posted-
 * completeness triggers verify the same invariant at COMMIT.
 */
import { addØre, mulRate, ZERO, type Øre, type Rate } from '../money/ore.js';
import { type MvaStatus } from '../vat/status.js';
import { deriveSales, type DeriveResult } from './derive.js';
import type { AccountNo, PostingLine, VatCode, Voucher } from './types.js';

/**
 * One revenue line of a sales document, as it posts. `net` and `vatRate` reproduce the line's frozen
 * VAT exactly (the same `mulRate(net, rate)` the document used), so the voucher ties out to the
 * document by construction. `outputVat` is the rate's output-VAT account — used only when the line
 * actually charges VAT (an unregistered org / zero-rated line emits no VAT leg, so it is ignored).
 */
export interface SalesInvoiceLine {
  readonly net: Øre;
  readonly vatRate: Rate;
  readonly revenue: AccountNo;
  readonly outputVat: AccountNo;
  readonly vatCode?: VatCode;
}

export interface SalesInvoiceInput {
  /** The customer-receivable account, debited the document gross. */
  readonly receivable: AccountNo;
  /** Drives the per-line VAT fork (the hard invariant) — passed straight through to `deriveSales`. */
  readonly status: MvaStatus;
  readonly lines: readonly SalesInvoiceLine[];
}

/** A merged credit leg, accumulated across lines that share an account + VAT code. */
interface CreditLeg {
  readonly account: AccountNo;
  readonly vatCode?: VatCode;
  readonly credit: Øre;
}

/** Build a posting line, preserving the exact-optional `vatCode` (present only when one applies). */
function creditLine(leg: CreditLeg): PostingLine {
  return leg.vatCode === undefined
    ? { account: leg.account, debit: ZERO, credit: leg.credit }
    : { account: leg.account, vatCode: leg.vatCode, debit: ZERO, credit: leg.credit };
}

/** An output-VAT leg being merged: the accumulated CHARGING BASE, rounded once at the end (ADR 0054). */
interface VatLegAccumulator {
  readonly account: AccountNo;
  readonly vatCode?: VatCode;
  readonly base: Øre;
  readonly vatRate: Rate;
}

/**
 * Derive the balanced AR voucher for a sales document. Each line is run through `deriveSales` (which
 * owns the registration hard block: an org that may not charge output VAT cannot post one), and the
 * resulting legs are merged — every line's revenue credit folds per account + code, and each
 * output-VAT leg accumulates its lines' NET BASES and is rounded ONCE per merged leg
 * (`mulRate(Σ base, rate)`, category-level — ADR 0054), so the voucher's VAT equals the document's
 * per-category VAT exactly. (The standard SAF-T list has one output code per rate category, so
 * account+code merging IS category merging.) The receivable debit is revenue + VAT — balanced by
 * construction. Returns the first line's block as the document's error (a blocked line never posts),
 * mirroring how issuing refuses the whole document.
 */
export function deriveSalesInvoice(input: SalesInvoiceInput): DeriveResult {
  // Insertion-ordered so the voucher reads top-down: receivable, then revenue legs, then VAT legs.
  const revenues = new Map<string, CreditLeg>();
  const vatLegs = new Map<string, VatLegAccumulator>();

  for (const l of input.lines) {
    const derived = deriveSales({
      net: l.net,
      vatRate: l.vatRate,
      status: input.status,
      accounts: { receivable: input.receivable, revenue: l.revenue, outputVat: l.outputVat },
      ...(l.vatCode === undefined ? {} : { vatCode: l.vatCode }),
    });
    if (!derived.ok) return derived;

    // `deriveSales` emits [receivable, revenue, vat?]; the fork (whether a VAT leg exists at all)
    // stays owned there — this module only merges amounts.
    const [, revenueLeg, vatLeg] = derived.voucher.lines;
    const rKey = `${revenueLeg!.account}␟${revenueLeg!.vatCode ?? ''}`;
    const rPrev = revenues.get(rKey);
    revenues.set(rKey, {
      account: revenueLeg!.account,
      ...(revenueLeg!.vatCode === undefined ? {} : { vatCode: revenueLeg!.vatCode }),
      credit: rPrev === undefined ? revenueLeg!.credit : addØre(rPrev.credit, revenueLeg!.credit),
    });
    if (vatLeg !== undefined) {
      const vKey = `${vatLeg.account}␟${vatLeg.vatCode ?? ''}`;
      const vPrev = vatLegs.get(vKey);
      vatLegs.set(vKey, {
        account: vatLeg.account,
        ...(vatLeg.vatCode === undefined ? {} : { vatCode: vatLeg.vatCode }),
        base: vPrev === undefined ? l.net : addØre(vPrev.base, l.net),
        vatRate: l.vatRate,
      });
    }
  }

  let receivable: Øre = ZERO;
  const credits: PostingLine[] = [];
  for (const leg of revenues.values()) {
    credits.push(creditLine(leg));
    receivable = addØre(receivable, leg.credit);
  }
  for (const v of vatLegs.values()) {
    const credit = mulRate(v.base, v.vatRate); // rounded once per merged leg (ADR 0054)
    credits.push(
      creditLine({
        account: v.account,
        ...(v.vatCode === undefined ? {} : { vatCode: v.vatCode }),
        credit,
      }),
    );
    receivable = addØre(receivable, credit);
  }

  const lines: PostingLine[] = [
    { account: input.receivable, debit: receivable, credit: ZERO },
    ...credits,
  ];
  return { ok: true, voucher: { type: 'sales', lines } };
}

/**
 * The reversing motbilag of a voucher: every leg's debit and credit swap sides, so a sales voucher
 * becomes the credit note's reversal (debit revenue + output VAT, credit receivable). `type` becomes
 * `reversal` and `reversesVoucherId` records what it corrects (omitted when the original predates the
 * ledger-posting feature and has no voucher). Pure and exactly balance-preserving — a correction is
 * always append-only, never an edit of the original (hard invariant).
 */
export function reverseVoucher(voucher: Voucher, reversesVoucherId?: string): Voucher {
  return {
    type: 'reversal',
    ...(reversesVoucherId === undefined ? {} : { reversesVoucherId }),
    lines: voucher.lines.map((l) =>
      l.vatCode === undefined
        ? { account: l.account, debit: l.credit, credit: l.debit }
        : { account: l.account, vatCode: l.vatCode, debit: l.credit, credit: l.debit },
    ),
  };
}
