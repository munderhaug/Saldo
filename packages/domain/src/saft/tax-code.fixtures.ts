/**
 * TEST FIXTURE — the REAL committed SAF-T Standard Tax Codes, parsed once (never hardcoded from
 * memory, hard invariant §4.3). Extracted from seven test files that each re-read and re-parsed the
 * CSV with the same boilerplate (review 2026-07-03 §10). Imported by tests only; not part of the
 * package's public surface (not re-exported from index.ts).
 */
import { readFileSync } from 'node:fs';
import { indexTaxCodes, parseStandardTaxCodes, type SaftTaxCode } from './tax-codes.js';

const STANDARD_TAX_CODES_CSV = readFileSync(
  new URL('../../../../db/reference/saf-t/tax-codes/Standard_Tax_Codes.csv', import.meta.url),
  'utf8',
);

export const STANDARD_TAX_CODES = parseStandardTaxCodes(STANDARD_TAX_CODES_CSV);

export const TAX_CODE_INDEX = indexTaxCodes(STANDARD_TAX_CODES);

/** A committed code by its SAF-T number; throws when the fixture is asked for a code that isn't real. */
export function taxCode(c: string): SaftTaxCode {
  const found = TAX_CODE_INDEX.get(c as SaftTaxCode['code']);
  if (found === undefined) throw new Error(`fixture missing committed code ${c}`);
  return found;
}
