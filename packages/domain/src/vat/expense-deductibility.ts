/**
 * Non-deductible input-VAT rules (build-spec §8.5 / §4.3, .claude/rules/vat.md). Some business costs
 * carry input VAT that is NON-deductible EVEN WHEN the org is VAT-registered:
 *  - **representasjon** — entertainment (mval § 8-3 first paragraph (e));
 *  - **restricted_vehicle** — acquisition/operation of passenger vehicles (personkjøretøy), § 8-4;
 *  - **private_use** — the privately-used portion of a mixed cost (§ 8-2 / § 8-3).
 *
 * This module ENCODES the rule's posting *consequence* — a line tagged with any such reason books its
 * gross to cost (no input-VAT split), which `derivePurchase`/`deriveReverseChargePurchase` already
 * implement via their `deductible = false` branch. The reason is RECORDED BY A HUMAN on the line (the
 * confirmation model: a person decides the line is non-deductible); this function never silently infers
 * deductibility from the account number — auto-suggesting a reason from the kontoplan is a separate,
 * source-grounded follow-on. Keeping the reasons an explicit, exhaustive set makes every non-deduction
 * auditable on the voucher.
 */

/** The statutory reasons a registered org's input VAT on a line is nonetheless non-deductible. */
export const NON_DEDUCTIBLE_REASONS = [
  'representasjon',
  'restricted_vehicle',
  'private_use',
] as const;

export type NonDeductibleReason = (typeof NON_DEDUCTIBLE_REASONS)[number];

/**
 * Whether a line's input VAT is deductible given an optional recorded non-deduction reason. Deductible
 * exactly when NO reason is recorded; any reason makes it non-deductible (the gross is booked to cost).
 * This is the posting fork's `deductible` input — the MVA-status fork in `derivePurchase` then decides
 * the rest (an unregistered org never deducts regardless).
 */
export function isLineInputVatDeductible(reason: NonDeductibleReason | null | undefined): boolean {
  return reason === null || reason === undefined;
}
