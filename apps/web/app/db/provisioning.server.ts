/**
 * Per-org provisioning data — the standard kontoplan + VAT codes a fresh org starts with (ADR 0032).
 *
 * The `vat_code` / `account` tables are tenant-scoped (per-org rows, FORCE-RLS), so a static migration
 * cannot seed them — the rows are written inside the org-creation transaction (`organizations.server`).
 * This module turns the committed SAF-T lists into those rows, using the PURE `@saldo/domain` parsers
 * (VAT codes & accounts are loaded from the committed lists, never hardcoded from memory — hard
 * invariant). The CSVs are inlined at build time via Vite `?raw` (no runtime fs / bundling surprise),
 * and parsed once at module load.
 */
import {
  classifyAccountType,
  indexTaxCodes,
  parseStandardAccounts,
  parseStandardTaxCodes,
  rateForCategory,
  type SaftTaxCode,
} from '@saldo/domain';
import accountsCsv from '../../../../db/reference/saf-t/accounts/General_Ledger_Standard_Accounts_4_character.csv?raw';
import taxCodesCsv from '../../../../db/reference/saf-t/tax-codes/Standard_Tax_Codes.csv?raw';

/** One `account` row to insert (organization_id is added per-org by the caller). */
export interface AccountSeed {
  readonly number: string;
  readonly name: string;
  readonly type: string;
}

/** One `vat_code` row to insert. `rate` is the numeric(5,4) string the column expects. */
export interface VatCodeSeed {
  readonly code: string;
  readonly rate: string;
  readonly direction: 'output' | 'input' | 'none';
}

/** The full committed standard kontoplan (4-character SAF-T accounts), classified by kontoklasse. */
export const STANDARD_ACCOUNTS: readonly AccountSeed[] = parseStandardAccounts(accountsCsv).map(
  (a) => ({
    number: a.id,
    name: a.descriptionNo,
    type: classifyAccountType(a.id),
  }),
);

/** The committed standard SAF-T tax codes, parsed once (the typed records, not yet seed rows). */
const STANDARD_TAX_CODES: readonly SaftTaxCode[] = parseStandardTaxCodes(taxCodesCsv);

/**
 * The committed SAF-T tax codes indexed by code — the single source the rules engine
 * (`vatLineRule`) needs to validate a proposed voucher's coded lines against the org's MVA status.
 */
export const STANDARD_TAX_CODE_INDEX = indexTaxCodes(STANDARD_TAX_CODES);

/** Every committed standard SAF-T tax code, with its numeric rate resolved from the cited rate table. */
export const STANDARD_VAT_CODES: readonly VatCodeSeed[] = STANDARD_TAX_CODES.map((c) => ({
  code: c.code,
  // numeric(5,4): 0.25 → "0.2500". toFixed is a presentation cast, not money arithmetic.
  rate: (rateForCategory(c.rateCategory) as number).toFixed(4),
  direction: c.direction,
}));
