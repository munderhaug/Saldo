/**
 * "What's actually yours" — the honest-number reveal (experience-principles §6): of the cash taken in,
 * fence off what isn't the user's (VAT held for the state, estimated tax) so the headline is only the
 * safe-to-spend remainder. "Of the 200k you've taken in, ~40k is VAT you're holding and ~25k is
 * estimated tax. Your spendable: ~135k."
 *
 * PURE. It composes already-aggregated øre amounts (the ledger query layer sums them; the domain stays
 * I/O-free). It deliberately does NOT model income tax — the estimate is INJECTED, because no committed
 * tax-rate source exists yet and the discipline rule forbids inventing regulatory numbers from memory.
 * The one regulatory fork it owns is whether VAT is actually being held, read from {@link MvaStatus}.
 */
import { type Øre, ZERO, subØre } from '../money/ore.js';
import { type MvaStatus, chargesOutputVat } from '../vat/status.js';

/**
 * Pre-aggregated inputs (the ledger query layer sums them). Correctness of `vatHeld` lives in HOW these
 * are aggregated — caller preconditions (verified by the vat-reviewer):
 *  - **Reverse charge / import VAT** (snudd avregning, innførsels-MVA) post BOTH an output and an input
 *    leg (`.claude/rules/vat.md`). Aggregate them **symmetrically**: the output leg into
 *    `outputVatCollected`, the deductible input leg into `deductibleInputVat`. Drop one side and
 *    `vatHeld` is wrong in either direction.
 *  - `deductibleInputVat` is the **deductible portion only** — exclude `uten fradragsrett` codes and the
 *    non-deductible / private-use share (representasjon, restricted vehicle, etc.), which are booked
 *    gross to cost and are not money held.
 *  - `vatHeld` is the **running net position for the aggregated window**, not a settled termin cash
 *    liability — don't double-count a prior termin that's already been paid to the state.
 */
export interface HonestNumberInput {
  /** Gross cash taken in over the period (includes any VAT charged to customers). */
  readonly income: Øre;
  /** Output VAT charged on sales (plus reverse-charge/import output legs — see the interface note). */
  readonly outputVatCollected: Øre;
  /** The DEDUCTIBLE input VAT only (exclude non-deductible codes — see the interface note). */
  readonly deductibleInputVat: Øre;
  /** Estimated income tax to set aside — INJECTED from a committed tax source; `ZERO` when unknown. */
  readonly estimatedTax: Øre;
  /** Drives whether VAT is actually held for the state (the MVA-status fork). */
  readonly mvaStatus: MvaStatus;
}

export interface HonestNumber {
  readonly income: Øre;
  /** Net VAT held for the state: `max(0, output − deductible)`, or `ZERO` when not VAT-registered. */
  readonly vatHeld: Øre;
  readonly estimatedTax: Øre;
  /** The headline: safe to spend = `max(0, income − vatHeld − estimatedTax)`. Never negative. */
  readonly spendable: Øre;
  /** `income − vatHeld − estimatedTax` before flooring; a negative value flags an over-committed position. */
  readonly rawRemainder: Øre;
}

/** `max(ZERO, a)` — comparison only, no money arithmetic. */
function floorZero(a: Øre): Øre {
  return a > ZERO ? a : ZERO;
}

export function honestNumber(input: HonestNumberInput): HonestNumber {
  // VAT is only held when the org is VAT-registered; an unregistered org never charged output VAT, so
  // its gross income carries no VAT to fence off (ignore any stray amounts passed in).
  const vatHeld = chargesOutputVat(input.mvaStatus)
    ? floorZero(subØre(input.outputVatCollected, input.deductibleInputVat))
    : ZERO;

  const rawRemainder = subØre(subØre(input.income, vatHeld), input.estimatedTax);

  return {
    income: input.income,
    vatHeld,
    estimatedTax: input.estimatedTax,
    rawRemainder,
    spendable: floorZero(rawRemainder),
  };
}
