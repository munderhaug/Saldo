/**
 * MVA (VAT) status drives all posting. Every organization is in exactly one state.
 * See .claude/rules/vat.md and the domain-model.
 */

export const MVA_STATUSES = [
  'under_threshold',
  'unntatt',
  'registered_standard',
  'registered_zero_rated',
] as const;

export type MvaStatus = (typeof MVA_STATUSES)[number];

/** Output VAT is only charged when the org is VAT-registered. */
export function chargesOutputVat(status: MvaStatus): boolean {
  return status === 'registered_standard' || status === 'registered_zero_rated';
}

/** Input VAT is only deductible when the org is VAT-registered. */
export function deductsInputVat(status: MvaStatus): boolean {
  return status === 'registered_standard' || status === 'registered_zero_rated';
}
