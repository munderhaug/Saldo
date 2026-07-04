/**
 * SAF-T tax-code description keywords — the single source for the Norwegian substring phrases that
 * classify a committed Standard Tax Code by its description (its VAT direction, whether it is a
 * reverse-charge code, which kind of reverse charge, and whether it is outside the VAT Act).
 *
 * Classification is DERIVED from the official list's NOB text — never a remembered code number (hard
 * invariant, build-spec §4.3). Naming each phrase once keeps the classifiers from drifting: the same
 * `omvendt avgiftplikt` / `kjøpt fra utlandet` / `innførsel av varer` phrases had been duplicated
 * across `deriveDirection`, `deriveReverseCharge` and `reverseChargeKind`.
 *
 * Match against `descriptionNo.toLowerCase()`; every phrase here is already lower-cased. The CSV spells
 * it `omvendt avgiftplikt` (sic — the official term is "avgift*s*plikt"); we match the committed file.
 */
export const TAX_CODE_KEYWORDS = {
  // Output side.
  output: 'utgående',
  exemptOutput: 'fritatt for merverdiavgift',
  export: 'utførsel',
  // Input side ("uten fradragsrett" must be tested before the deductible-input phrases).
  input: 'inngående',
  importVat: 'innførselsmerverdiavgift',
  deductible: 'med fradragsrett',
  nonDeductible: 'uten fradragsrett',
  // Reverse charge (snudd avregning — buyer self-accounts both legs).
  reverseCharge: 'omvendt avgiftplikt',
  foreignServices: 'kjøpt fra utlandet',
  importGoods: 'innførsel av varer',
  emissionsOrGold: 'klimakvoter eller gull',
  // Outside the VAT Act (unntatt turnover vs a technical no-treatment code).
  outsideVatAct: 'utenfor merverdiavgiftsloven',
} as const;
