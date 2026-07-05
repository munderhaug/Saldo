/**
 * MVA filing persistence (feat-altinn-mva-submission, ADR 0063; the table lives in
 * `db/migrations/*_mva_filing.sql`). One append-only row per submission that reached Altinn
 * instance creation — the durable proof a filing happened and the pointer
 * (`{partyId}/{instanceGuid}`) under which Skatteetaten's kvittering/betalingsinformasjon live.
 * Written in the SAME tenant transaction as the `mva_filing.submitted` audit event (ADR 0062), so
 * the filing, its record and its attribution commit atomically. Server-only.
 */
import { desc, eq } from 'drizzle-orm';
import type { OrgTx } from '../auth/middleware.js';
import { mvaFiling } from './schema.js';

export interface MvaFilingRecord {
  readonly organizationId: string;
  readonly year: number;
  /** The domain's `termKey`: `aar` for the annual term, `T1`–`T6` bimonthly. */
  readonly term: string;
  readonly altinnPartyId: string;
  readonly altinnInstanceId: string;
}

/** Persist one filing, in the caller's tenant-scoped transaction; returns the row id. */
export async function recordMvaFiling(tx: OrgTx, input: MvaFilingRecord): Promise<string> {
  const [row] = await tx
    .insert(mvaFiling)
    .values({
      organizationId: input.organizationId,
      year: input.year,
      term: input.term,
      altinnPartyId: input.altinnPartyId,
      altinnInstanceId: input.altinnInstanceId,
    })
    .returning({ id: mvaFiling.id });
  return row!.id;
}

export interface MvaFilingRow {
  readonly id: string;
  readonly term: string;
  readonly altinnPartyId: string;
  readonly altinnInstanceId: string;
  readonly createdAt: string;
}

/** The year's filings, newest first (RLS scopes to the tenant). */
export async function listMvaFilings(tx: OrgTx, year: number): Promise<MvaFilingRow[]> {
  return tx
    .select({
      id: mvaFiling.id,
      term: mvaFiling.term,
      altinnPartyId: mvaFiling.altinnPartyId,
      altinnInstanceId: mvaFiling.altinnInstanceId,
      createdAt: mvaFiling.createdAt,
    })
    .from(mvaFiling)
    .where(eq(mvaFiling.year, year))
    .orderBy(desc(mvaFiling.createdAt));
}
