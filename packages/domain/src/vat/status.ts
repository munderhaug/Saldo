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

/**
 * Propose an MVA status from Enhetsregisteret's public VAT-register flag (`registrertIMvaregisteret`).
 * A DETERMINISTIC register read, not AI: a unit in the VAT register is proposed as
 * `registered_standard`, otherwise `under_threshold`. The proposal is always a starting point the
 * human confirms — the status forks all posting (hard invariant). Shared by org onboarding (§8.1)
 * and the per-contact MVA status of the contacts register (§8.2).
 */
export function proposeMvaStatusFromVatRegister(
  registrertIMvaregisteret: boolean | undefined,
): MvaStatus {
  return registrertIMvaregisteret === true ? 'registered_standard' : 'under_threshold';
}
