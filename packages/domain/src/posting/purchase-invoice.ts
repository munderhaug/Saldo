/**
 * Supplier-invoice posting (build-spec §8.5, feat-supplier-invoices). Turns a recorded supplier
 * invoice — its per-line cost split — into the balanced AP voucher the ledger stores: a cost debit per
 * line (net when the org deducts input VAT, gross otherwise), the deductible input-VAT debit per rate,
 * and ONE supplier-payable credit for the document gross. It REUSES the single-line `derivePurchase`
 * (THE input-VAT fork — the hard invariant) and `deriveReverseChargePurchase` (the dual-leg snudd
 * avregning, ADR 0044) once per line and merges the legs, so the status/deductibility fork is owned in
 * exactly one place — this module only adds the multi-line aggregation, never a second posting rule.
 *
 * A line is either an ORDINARY purchase line (single-leg input-VAT fork) or a REVERSE-CHARGE line (the
 * buyer self-accounts both legs); the caller branches on the SAF-T code's `reverseCharge` flag and
 * supplies the matching line shape. Both credit the SAME supplier payable (a reverse-charge supplier
 * never invoices the VAT — only the net), so the legs merge into one payable credit by construction.
 *
 * Pure: it runs identically in the browser preview and the server action; the SQL balance / posted-
 * completeness triggers verify the same invariant at COMMIT. Always balanced (a sum of balanced
 * vouchers is balanced).
 */
import { addØre, type Øre, type Rate } from '../money/ore.js';
import { type MvaStatus } from '../vat/status.js';
import { derivePurchase, deriveReverseChargePurchase } from './derive.js';
import type { AccountNo, PostingLine, VatCode, Voucher } from './types.js';

/**
 * One ORDINARY purchase line. `net` + `vatRate` reproduce the line's VAT exactly (the same
 * `mulRate(net, rate)` the document stored). `deductible` is the non-deductible-even-when-registered
 * decision (representasjon / restricted vehicle / private-use, §4.3) — `false` books the gross to cost.
 * `inputVat` is the rate's deductible input-VAT account (used only when the org deducts AND the line is
 * deductible; otherwise no split is emitted).
 */
export interface PurchaseInvoiceOrdinaryLine {
  readonly reverseCharge?: false;
  readonly net: Øre;
  readonly vatRate: Rate;
  readonly cost: AccountNo;
  readonly inputVat: AccountNo;
  readonly deductible?: boolean;
  readonly vatCode?: VatCode;
}

/**
 * One REVERSE-CHARGE (snudd avregning) line — a foreign service, imported goods, or domestic
 * self-account purchase: the buyer self-accounts VAT, so both an output and (when deductible) an input
 * leg are posted. The accounts/codes are the rate-matched 2704–2718 pairs the kontoplan reserves;
 * `deductible` is decided from the committed SAF-T classification AND the non-deductible business rules.
 */
export interface PurchaseInvoiceReverseChargeLine {
  readonly reverseCharge: true;
  readonly net: Øre;
  readonly vatRate: Rate;
  readonly cost: AccountNo;
  readonly outputVat: AccountNo;
  readonly inputVat: AccountNo;
  readonly deductible: boolean;
  readonly outputVatCode?: VatCode;
  readonly inputVatCode?: VatCode;
}

export type PurchaseInvoiceLine = PurchaseInvoiceOrdinaryLine | PurchaseInvoiceReverseChargeLine;

export interface PurchaseInvoiceInput {
  /** The supplier-payable account, credited the document gross (net only on reverse-charge lines). */
  readonly payable: AccountNo;
  /** Drives the per-line input-VAT fork (the hard invariant) — passed straight through to the derivations. */
  readonly status: MvaStatus;
  readonly lines: readonly PurchaseInvoiceLine[];
}

/** Build a posting line, preserving the exact-optional `vatCode` (present only when one applies). */
function postingLine(account: AccountNo, debit: Øre, credit: Øre, vatCode?: VatCode): PostingLine {
  return vatCode === undefined ? { account, debit, credit } : { account, vatCode, debit, credit };
}

/**
 * Merge a flat list of legs by (account, VAT code), summing each side, preserving first-seen order —
 * so each cost/VAT account appears once and every line's payable credit folds into a single gross
 * credit. In a purchase voucher a given (account, code) key only ever accumulates one side, so the
 * merge never nets a debit against a credit; the sum is exact integer øre either way.
 */
function mergeLegs(legs: readonly PostingLine[]): PostingLine[] {
  interface Merged {
    readonly account: AccountNo;
    readonly vatCode?: VatCode;
    debit: Øre;
    credit: Øre;
  }
  const byKey = new Map<string, Merged>();
  for (const leg of legs) {
    const key = `${leg.account}␟${leg.vatCode ?? ''}`;
    const prev = byKey.get(key);
    if (prev === undefined) {
      byKey.set(key, {
        account: leg.account,
        ...(leg.vatCode === undefined ? {} : { vatCode: leg.vatCode }),
        debit: leg.debit,
        credit: leg.credit,
      });
    } else {
      prev.debit = addØre(prev.debit, leg.debit);
      prev.credit = addØre(prev.credit, leg.credit);
    }
  }
  return [...byKey.values()].map((m) => postingLine(m.account, m.debit, m.credit, m.vatCode));
}

/**
 * Derive the balanced AP voucher for a recorded supplier invoice. Each line is run through the
 * single-line fork it belongs to — `derivePurchase` (ordinary) or `deriveReverseChargePurchase`
 * (snudd avregning) — and the resulting legs are merged: cost debits per account, input-VAT debits per
 * rate, self-accounted output-VAT credits (reverse charge), and every line's supplier credit folded
 * into one payable credit. Balanced because a sum of balanced vouchers is balanced; the leg layout is
 * never hand-rolled here.
 */
export function derivePurchaseInvoice(input: PurchaseInvoiceInput): Voucher {
  const legs: PostingLine[] = [];
  for (const l of input.lines) {
    const derived = l.reverseCharge
      ? deriveReverseChargePurchase({
          net: l.net,
          vatRate: l.vatRate,
          status: input.status,
          deductible: l.deductible,
          accounts: {
            cost: l.cost,
            payable: input.payable,
            outputVat: l.outputVat,
            inputVat: l.inputVat,
          },
          ...(l.outputVatCode === undefined ? {} : { outputVatCode: l.outputVatCode }),
          ...(l.inputVatCode === undefined ? {} : { inputVatCode: l.inputVatCode }),
        })
      : derivePurchase({
          net: l.net,
          vatRate: l.vatRate,
          status: input.status,
          accounts: { cost: l.cost, inputVat: l.inputVat, payable: input.payable },
          ...(l.deductible === undefined ? {} : { deductible: l.deductible }),
          ...(l.vatCode === undefined ? {} : { vatCode: l.vatCode }),
        });
    legs.push(...derived.lines);
  }
  return { type: 'purchase', lines: mergeLegs(legs) };
}
