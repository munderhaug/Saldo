/**
 * The SAF-T **General Ledger Standard Accounts** model, parsed from the committed list
 * (`db/reference/saf-t/accounts/General_Ledger_Standard_Accounts_*_character.csv`). These are the
 * standard kontoplan used for SAF-T mapping (© Regnskap Norge AS — SAF-T mapping use only).
 * Account numbers are loaded from this list, never hardcoded from memory.
 */
import type { AccountNo } from '../posting/types.js';
import { csvDataRows, splitCsvLine } from './csv-lines.js';

export interface SaftStandardAccount {
  /** Standard account id — `"10"` (2-digit grouping) or `"1500"` (4-digit). Branded. */
  readonly id: AccountNo;
  readonly descriptionNo: string;
  readonly descriptionEn: string;
}

/**
 * Parse a standard-accounts CSV (header: `AccountID;DescriptionNOB;DescriptionENG`). Pure: takes
 * the file contents and does no I/O.
 */
export function parseStandardAccounts(csv: string): readonly SaftStandardAccount[] {
  const rows = csvDataRows(csv);
  return rows.map((row) => {
    const cols = splitCsvLine(row);
    const id = (cols[0] ?? '').trim();
    if (id === '') throw new Error(`SAF-T account row has no id: "${row}"`);
    return {
      id: id as AccountNo,
      descriptionNo: (cols[1] ?? '').trim(),
      descriptionEn: (cols[2] ?? '').trim(),
    };
  });
}

/** Index parsed accounts by id for O(1) lookup. */
export function indexAccounts(
  accounts: readonly SaftStandardAccount[],
): ReadonlyMap<AccountNo, SaftStandardAccount> {
  return new Map(accounts.map((a) => [a.id, a]));
}

/**
 * Coarse account class for a standard account — the Norwegian *kontoklasse*, which is the leading
 * digit of the account number (the SAF-T 2-character standard accounts ARE this class structure:
 * 1x eiendeler, 2x egenkapital og gjeld, 3x salgs-/driftsinntekt, 4x varekostnad, 5x lønnskostnad,
 * 6x–7x annen driftskostnad, 8x finansposter/skatt/resultat). Source-grounded in the committed list,
 * not memorised. `other` is a fail-open fallback for an unexpected leading digit (the committed lists
 * never produce it — asserted in the test).
 */
export type AccountType =
  | 'asset'
  | 'equity_liability'
  | 'revenue'
  | 'expense'
  | 'financial'
  | 'other';

export function classifyAccountType(id: AccountNo): AccountType {
  switch (id.charAt(0)) {
    case '1':
      return 'asset';
    case '2':
      return 'equity_liability';
    case '3':
      return 'revenue';
    case '4':
    case '5':
    case '6':
    case '7':
      return 'expense';
    case '8':
      return 'financial';
    default:
      return 'other';
  }
}
