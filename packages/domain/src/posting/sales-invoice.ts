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
import { addØre, ZERO, type Øre, type Rate } from '../money/ore.js';
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

/**
 * Derive the balanced AR voucher for a sales document. Each line is run through `deriveSales` (which
 * owns the registration hard block: an org that may not charge output VAT cannot post one), and the
 * resulting legs are merged — every line's receivable debit folds into a single gross debit, and the
 * revenue / output-VAT credits are summed per account + code. Balanced because a sum of balanced
 * vouchers is balanced. Returns the first line's block as the document's error (a blocked line never
 * posts), mirroring how issuing refuses the whole document.
 */
export function deriveSalesInvoice(input: SalesInvoiceInput): DeriveResult {
  let receivable: Øre = ZERO;
  // Insertion-ordered so the voucher reads top-down: receivable, then revenue/VAT in line order.
  const credits = new Map<string, CreditLeg>();

  for (const l of input.lines) {
    const derived = deriveSales({
      net: l.net,
      vatRate: l.vatRate,
      status: input.status,
      accounts: { receivable: input.receivable, revenue: l.revenue, outputVat: l.outputVat },
      ...(l.vatCode === undefined ? {} : { vatCode: l.vatCode }),
    });
    if (!derived.ok) return derived;

    // `deriveSales` always emits the receivable as the first leg; the rest are this line's credits.
    const [recv, ...rest] = derived.voucher.lines;
    receivable = addØre(receivable, recv!.debit);
    for (const leg of rest) {
      const key = `${leg.account}␟${leg.vatCode ?? ''}`;
      const prev = credits.get(key);
      credits.set(key, {
        account: leg.account,
        ...(leg.vatCode === undefined ? {} : { vatCode: leg.vatCode }),
        credit: prev === undefined ? leg.credit : addØre(prev.credit, leg.credit),
      });
    }
  }

  const lines: PostingLine[] = [{ account: input.receivable, debit: receivable, credit: ZERO }];
  for (const leg of credits.values()) lines.push(creditLine(leg));
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
