/**
 * Per-line VAT treatment (ADR 0027). VAT treatment is a property of the invoice/voucher *line* —
 * carried by the line's SAF-T tax code — not solely of the organization's `mva_status`. The
 * org status is the *registration/default* state; this module decides whether a given code may
 * appear on a line for an org in a given status, and what posting treatment that code applies.
 *
 * This is the increment ADR 0027 puts in scope **now**: revenue-side per-line classification +
 * the registration gate. Delt-virksomhet input-VAT apportionment (forholdsmessig fradrag, § 8-2)
 * and reverse-charge dual-leg posting are sequenced to their own tasks (`vat-mixed-activity`,
 * `vat-reverse-charge`); a reverse-charge code is surfaced here as a non-blocking advisory — except
 * its input-deduction claim, which is decidable today and gated on registration like any input code.
 *
 * Pure: classification is *derived* from the committed SAF-T list (`SaftTaxCode`), never hardcoded
 * from a remembered code number (hard invariant). The gate is built on the two cited predicates in
 * `./status.ts` (`chargesOutputVat` / `deductsInputVat`) — the same fork `posting/derive.ts` uses.
 */
import type { SaftTaxCode } from '../saft/tax-codes.js';
import { TAX_CODE_KEYWORDS } from '../saft/tax-code-keywords.js';
import { chargesOutputVat, deductsInputVat, type MvaStatus } from './status.js';

/**
 * The posting-relevant VAT treatment a SAF-T code applies to a single line. Derived from the
 * code's committed classification (`direction` / `rateCategory` / `reverseCharge`), so it tracks
 * the official list rather than memory.
 */
export type VatTreatment =
  | 'output-vat' // positive output VAT — registered only (e.g. 3, 31, 32, 33)
  | 'zero-rated-output' // fritatt / export, 0 % output but a *registered* treatment (5, 52)
  | 'exempt' // unntatt — turnover outside the VAT Act; any status (6) — the § 3-7 revenue line
  | 'input-deductible' // deductible input VAT — registered only (1, 11, 12, 13, 14, 15)
  | 'reverse-charge' // buyer/seller self-accounts both legs — sequenced to `vat-reverse-charge`
  | 'no-treatment'; // technical no-VAT codes; any status (0, 7, 20)

/** Why a `checkVatLine` verdict is not a plain pass — a blocking error, or the RC advisory. */
export type VatLineReason =
  | 'output-vat-requires-registration'
  | 'zero-rated-requires-registration'
  | 'input-deduction-requires-registration'
  | 'reverse-charge-deferred';

export interface VatLineVerdict {
  /** False only for a blocking (error) combination. The reverse-charge advisory keeps `ok: true`. */
  readonly ok: boolean;
  readonly treatment: VatTreatment;
  /** Present when the combination is blocked, or for the reverse-charge advisory. */
  readonly reason?: VatLineReason;
}

/**
 * Classify a SAF-T code into its line-level VAT treatment. Order matters: a self-accounting
 * (reverse-charge) code is dual-leg regardless of its primary direction, so it is matched first;
 * `exempt` (outside the Act) is distinguished from technical `no-treatment` by the committed
 * description, not the code number.
 */
export function deriveVatTreatment(code: SaftTaxCode): VatTreatment {
  if (code.reverseCharge) return 'reverse-charge';
  if (code.direction === 'output') {
    return code.rateCategory === 'zero' ? 'zero-rated-output' : 'output-vat';
  }
  if (code.direction === 'input') return 'input-deductible';
  // direction === 'none' and not reverse-charge: unntatt turnover vs. a no-VAT technical code.
  if (code.descriptionNo.toLowerCase().includes(TAX_CODE_KEYWORDS.outsideVatAct)) return 'exempt';
  return 'no-treatment';
}

const pass = (treatment: VatTreatment): VatLineVerdict => ({ ok: true, treatment });
const block = (treatment: VatTreatment, reason: VatLineReason): VatLineVerdict => ({
  ok: false,
  treatment,
  reason,
});

/**
 * The registration gate: may a line carrying `code` be posted for an org in `status`?
 *
 * - **output-vat / zero-rated-output** require the org to charge output VAT — i.e. to be
 *   VAT-registered (`chargesOutputVat`). An unregistered org's non-taxed sales are *exempt* or
 *   *outside scope*, never fritatt/output-coded (`mva-registration-threshold.md`: fritatt turnover
 *   is taxable turnover; unntatt is excluded).
 * - **input-deductible** requires the org to deduct input VAT (`deductsInputVat`). Below the
 *   threshold / unntatt there is no deduction — the gross is booked to cost (`posting/derive.ts`).
 * - **exempt (unntatt) / no-treatment** are valid for **any** status. This is the per-line
 *   expressiveness ADR 0027 adds: a `registered_standard` musician may post a code-6 performance
 *   line (§ 3-7) next to a taxable teaching line, in the same period.
 * - **reverse-charge** is not asserted here — its dual-leg correctness belongs to
 *   `vat-reverse-charge`. Returned as a non-blocking advisory so the boundary is visible.
 */
export function checkVatLine(status: MvaStatus, code: SaftTaxCode): VatLineVerdict {
  const treatment = deriveVatTreatment(code);
  switch (treatment) {
    case 'output-vat':
      return chargesOutputVat(status)
        ? pass(treatment)
        : block(treatment, 'output-vat-requires-registration');
    case 'zero-rated-output':
      return chargesOutputVat(status)
        ? pass(treatment)
        : block(treatment, 'zero-rated-requires-registration');
    case 'input-deductible':
      return deductsInputVat(status)
        ? pass(treatment)
        : block(treatment, 'input-deduction-requires-registration');
    case 'reverse-charge':
      // The dual-leg posting (the output self-account leg + any input leg) is sequenced to
      // `vat-reverse-charge`. But one dimension is decidable today: a code that *claims an input
      // deduction* ("med fradragsrett" — `direction === 'input'`: 81/83/86/88/91) still requires
      // registration, exactly like an ordinary input code. An unregistered buyer of a foreign
      // service owes the output leg but has no deduction right (it must use the "uten fradragsrett"
      // code, e.g. 87), so block the deduction claim here; otherwise surface the deferral advisory.
      if (code.direction === 'input' && !deductsInputVat(status)) {
        return block(treatment, 'input-deduction-requires-registration');
      }
      return { ok: true, treatment, reason: 'reverse-charge-deferred' };
    case 'exempt':
    case 'no-treatment':
      return pass(treatment);
    default: {
      const _exhaustive: never = treatment;
      return _exhaustive;
    }
  }
}
