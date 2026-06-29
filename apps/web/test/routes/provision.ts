import type { Sql } from 'postgres';
import { STANDARD_ACCOUNTS, STANDARD_VAT_CODES } from '../../app/db/provisioning.server.js';

// `provisioning.server` is pure (parses the committed SAF-T CSVs via the domain parsers); it does NOT
// pull in `~/db/client`, so a static import here is safe under the route harness's connection seam.

let seq = 0;

/** A mod-11-valid 9-digit org-nr (the EHF/PEPPOL seller id runs through `orgNr()`, which rejects junk). */
function validOrgNr(n: number): string {
  const weights = [3, 2, 7, 6, 5, 4, 3, 2];
  for (let base = 81_000_000 + n * 11; ; base += 1) {
    const digits = String(base); // 8 base digits; the 9th is the mod-11 control digit
    const sum = weights.reduce((acc, w, i) => acc + w * Number(digits[i]), 0);
    const rem = sum % 11;
    const control = rem === 0 ? 0 : 11 - rem;
    if (control < 10) return digits + String(control); // control 10 is invalid — skip it
  }
}

/**
 * Provision a fully-set-up org on the OWNER connection (RLS-free), as real onboarding does: the full
 * committed kontoplan + VAT codes + an open 2026 period — everything the posting/issuing paths need
 * (`seedOrg` only makes accounts 6000/3000, which is not enough for a posted voucher or an issued
 * invoice). The org-nr is mod-11-valid so the EHF seller id passes. Returns the org id; pair with
 * `h.createMember(orgId)` for a session.
 */
export async function provisionOrg(sql: Sql, mvaStatus = 'registered_standard'): Promise<string> {
  seq += 1;
  const [org] = await sql<{ id: string }[]>`
    INSERT INTO organization (org_nr, name, mva_status)
    VALUES (${validOrgNr(seq)}, ${'Rute ENK ' + String(seq)}, ${mvaStatus})
    RETURNING id`;
  const orgId = org!.id;
  await sql`INSERT INTO account ${sql(STANDARD_ACCOUNTS.map((a) => ({ organization_id: orgId, ...a })))}`;
  await sql`INSERT INTO vat_code ${sql(STANDARD_VAT_CODES.map((c) => ({ organization_id: orgId, ...c })))}`;
  await sql`INSERT INTO fiscal_period (organization_id, year, starts_on, ends_on)
            VALUES (${orgId}, 2026, '2026-01-01', '2026-12-31')`;
  return orgId;
}

/** Resolve the id of an org's `account` (by number) or `vat_code` (by code) — for invoice-line input. */
export async function idBy(
  sql: Sql,
  table: 'account' | 'vat_code',
  orgId: string,
  col: 'number' | 'code',
  value: string,
): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    SELECT id FROM ${sql(table)} WHERE organization_id = ${orgId} AND ${sql(col)} = ${value}`;
  return row!.id;
}
