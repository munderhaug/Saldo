/**
 * The ledger → honest-number bridge (experience-principles §6). PURE: it composes the already-summed
 * ledger totals (the query layer aggregates them; the domain stays I/O-free) with the source-grounded
 * ENK income-tax estimate ({@link estimateEnkIncomeTax}, ADR 0029) into the full "what's actually
 * yours" reveal.
 *
 * This is the user's OWN arithmetic over their OWN ledger — income they took in, VAT they're holding,
 * a conservative tax set-aside. It is NOT creditworthiness or profiling of a natural person (ADR 0022 /
 * AI Act Annex III §5(b)); it is NOT an AI feature (no LLM, no inference — a deterministic sum). Keep
 * it that way.
 */
import { type Øre, ZERO, addØre, subØre } from '../money/ore.js';
import { type MvaStatus } from '../vat/status.js';
import { type IncomeTaxEstimate, estimateEnkIncomeTax } from '../tax/income-estimate.js';
import { type HonestNumber, honestNumber } from './honest-number.js';

/**
 * Pre-aggregated ledger totals for one fiscal year, all in integer øre. HOW these are summed carries
 * the correctness (the query layer's job — see `honest-number.ts` and the aggregation test):
 *  - `revenueNet` / `expenseNet` are the **net** (ex-VAT) sums on the revenue (kontoklasse 3) and
 *    expense (4–7) accounts. For an unregistered org, VAT it can't reclaim is already booked gross
 *    into `expenseNet` (the input-VAT fork in `posting/derive.ts`), so profit stays correct.
 *  - `outputVatCollected` / `deductibleInputVat` are the VAT-account legs only (kontoklasse 2, split by
 *    SAF-T direction) — NOT the revenue/expense lines, which also carry the line's SAF-T code. Reverse
 *    charge contributes BOTH legs symmetrically (`.claude/rules/vat.md`).
 */
export interface LedgerTotals {
  /** Net sales revenue, ex-VAT (kontoklasse 3). */
  readonly revenueNet: Øre;
  /** Net operating expense, ex deductible VAT (kontoklasse 4–7). */
  readonly expenseNet: Øre;
  /** Output VAT charged on sales (+ any reverse-charge/import output leg). */
  readonly outputVatCollected: Øre;
  /** Deductible input VAT only (uten-fradragsrett / non-deductible never reach the input-VAT account). */
  readonly deductibleInputVat: Øre;
}

/** The honest number plus the figures behind it, for a transparent, explainable reveal. */
export interface HonestNumberReveal extends HonestNumber {
  /** Business profit driving the tax estimate: `revenueNet − expenseNet` (a loss is negative). */
  readonly profit: Øre;
  /** The income-tax estimate broken into its components (`tax.total` is what's fenced off). */
  readonly tax: IncomeTaxEstimate;
}

/**
 * Compose the year's ledger totals into the reveal. `income` is the GROSS cash taken in
 * (`revenueNet + outputVatCollected`) — the headline the §6 narrative speaks ("of the 200k you've
 * taken in…"); the VAT inside it is then fenced off by `honestNumber`. The tax set-aside is estimated
 * from profit for `year` (a loss yields zero tax — `estimateEnkIncomeTax` floors it).
 */
export function honestNumberFromLedger(
  totals: LedgerTotals,
  year: number,
  mvaStatus: MvaStatus,
): HonestNumberReveal {
  const income = addØre(totals.revenueNet, totals.outputVatCollected);
  const profit = subØre(totals.revenueNet, totals.expenseNet);
  const tax = estimateEnkIncomeTax(profit, year);

  const base = honestNumber({
    income,
    outputVatCollected: totals.outputVatCollected,
    deductibleInputVat: totals.deductibleInputVat,
    estimatedTax: tax.total,
    mvaStatus,
  });

  return { ...base, profit, tax };
}

/** A year with no posted activity — every figure is `ZERO` (the "you're caught up" / empty state). */
export const EMPTY_LEDGER_TOTALS: LedgerTotals = {
  revenueNet: ZERO,
  expenseNet: ZERO,
  outputVatCollected: ZERO,
  deductibleInputVat: ZERO,
};
