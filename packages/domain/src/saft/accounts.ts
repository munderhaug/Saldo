/**
 * The SAF-T **General Ledger Standard Accounts** model, parsed from the committed list
 * (`db/reference/saf-t/accounts/General_Ledger_Standard_Accounts_*_character.csv`). These are the
 * standard kontoplan used for SAF-T mapping (© Regnskap Norge AS — SAF-T mapping use only).
 * Account numbers are loaded from this list, never hardcoded from memory.
 */
import type { AccountNo } from '../posting/types.js';

export interface SaftStandardAccount {
  /** Standard account id — `"10"` (2-digit grouping) or `"1500"` (4-digit). Branded. */
  readonly id: AccountNo;
  readonly descriptionNo: string;
  readonly descriptionEn: string;
}

/** Split one CSV line on `;`, honouring double-quoted fields (which may contain `;` or `,`). */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let field = '';
  let inQuotes = false;
  const chars = [...line];
  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i];
    if (ch === undefined) continue;
    if (inQuotes) {
      if (ch === '"') {
        if (chars[i + 1] === '"') {
          field += '"';
          i += 1; // escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ';') {
      out.push(field);
      field = '';
    } else {
      field += ch;
    }
  }
  out.push(field);
  return out;
}

/**
 * Parse a standard-accounts CSV (header: `AccountID;DescriptionNOB;DescriptionENG`). Pure: takes
 * the file contents and does no I/O.
 */
export function parseStandardAccounts(csv: string): readonly SaftStandardAccount[] {
  const lines = csv
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const [, ...rows] = lines; // drop the header
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
