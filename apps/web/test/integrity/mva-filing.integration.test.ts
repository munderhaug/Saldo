import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import { type LedgerDb, ledgerDbAvailable, startLedgerDb } from './db-harness.js';
import * as schema from '../../app/db/schema.js';
import { withOrgTx } from '../../app/auth/middleware.js';
import { listMvaFilings, recordMvaFiling } from '../../app/db/mva-filing.server.js';
import { recordAuditEvent } from '../../app/db/audit.server.js';

// Needs a real Postgres (Docker/Testcontainers, or SALDO_TEST_PG_URI). Skips cleanly otherwise.

/**
 * The MVA filing record (feat-altinn-mva-submission, ADR 0063). A filing is a §5.5 act against the
 * authorities: the row proving it happened must be tenant-isolated, append-only, and written in the
 * SAME tenant transaction as its `mva_filing.submitted` audit attribution (ADR 0062).
 *
 * Proven against the running invariants — the non-owner `saldo_app` role under FORCE-RLS, inside
 * `withOrgTx`, exactly as the MVA screen's submit action runs it:
 *  - one submission ⇒ one filing row + one attributed audit event, atomically;
 *  - the term format is closed in SQL ('aar' | 'T1'–'T6');
 *  - one row per Altinn instance (UNIQUE org+instance);
 *  - tenant isolation and the append-only grant (no UPDATE/DELETE — history is never rewritten;
 *    a korrigert melding is a NEW row).
 */
describe.skipIf(!ledgerDbAvailable)('mva_filing — the filing record (ADR 0063)', () => {
  let db: LedgerDb;
  let appDb: ReturnType<typeof drizzle<typeof schema>>;

  beforeAll(async () => {
    db = await startLedgerDb();
    appDb = drizzle(db.appSql, { schema });
  });
  afterAll(async () => {
    await db.stop();
  });

  let seq = 0;
  /** Seed a bare org + an authenticated user (owner connection). */
  async function provision(): Promise<{ orgId: string; userId: string }> {
    seq += 1;
    const [org] = await db.sql<{ id: string }[]>`
      INSERT INTO organization (org_nr, name, mva_status)
      VALUES (${String(970000000 + seq)}, ${'Filing ENK ' + String(seq)}, 'registered_standard')
      RETURNING id`;
    const [user] = await db.sql<{ id: string }[]>`
      INSERT INTO app_user (email) VALUES (${`filer${String(seq)}@example.test`}) RETURNING id`;
    return { orgId: org!.id, userId: user!.id };
  }

  const GUID = () => crypto.randomUUID();

  it('records the filing + its audit attribution atomically in one tenant tx', async () => {
    const { orgId, userId } = await provision();
    const instanceGuid = GUID();
    const filingId = await withOrgTx(appDb, orgId, async (tx) => {
      const id = await recordMvaFiling(tx, {
        organizationId: orgId,
        year: 2026,
        term: 'aar',
        altinnPartyId: '51234',
        altinnInstanceId: instanceGuid,
      });
      await recordAuditEvent(tx, {
        organizationId: orgId,
        actorUserId: userId,
        action: 'mva_filing.submitted',
        entityId: id,
      });
      return id;
    });

    const filings = await withOrgTx(appDb, orgId, (tx) => listMvaFilings(tx, 2026));
    expect(filings).toHaveLength(1);
    expect(filings[0]).toMatchObject({
      id: filingId,
      term: 'aar',
      altinnPartyId: '51234',
      altinnInstanceId: instanceGuid,
    });

    const [audit] = await db.sql<{ actor: string; table: string }[]>`
      SELECT actor_user_id AS actor, entity_table AS "table" FROM audit_log
       WHERE organization_id = ${orgId} AND action = 'mva_filing.submitted' AND entity_id = ${filingId}`;
    expect(audit).toEqual({ actor: userId, table: 'mva_filing' });
  });

  it('rejects a free-text term in SQL (closed aar | T1–T6 format)', async () => {
    const { orgId } = await provision();
    await expect(
      db.sql`
        INSERT INTO mva_filing (organization_id, year, term, altinn_party_id, altinn_instance_id)
        VALUES (${orgId}, 2026, 'whenever', 'p', ${GUID()})`,
    ).rejects.toThrow(/mva_filing_term_check/);
  });

  it('is one row per Altinn instance (UNIQUE org + instance id)', async () => {
    const { orgId } = await provision();
    const instanceGuid = GUID();
    const insert = () => db.sql`
      INSERT INTO mva_filing (organization_id, year, term, altinn_party_id, altinn_instance_id)
      VALUES (${orgId}, 2026, 'aar', 'p', ${instanceGuid})`;
    await insert();
    await expect(insert()).rejects.toThrow(/mva_filing_organization_id_altinn_instance_id_key/);
  });

  it("never sees another tenant's filings (RLS isolation via saldo_app)", async () => {
    const a = await provision();
    const b = await provision();
    await withOrgTx(appDb, a.orgId, (tx) =>
      recordMvaFiling(tx, {
        organizationId: a.orgId,
        year: 2026,
        term: 'aar',
        altinnPartyId: 'p',
        altinnInstanceId: GUID(),
      }),
    );
    expect(await withOrgTx(appDb, b.orgId, (tx) => listMvaFilings(tx, 2026))).toHaveLength(0);
  });

  it('is append-only to the app role: no UPDATE/DELETE grant on mva_filing', async () => {
    for (const priv of ['UPDATE', 'DELETE']) {
      const [row] = await db.sql<{ ok: boolean }[]>`
        SELECT has_table_privilege('saldo_app', 'public.mva_filing', ${priv}) AS ok`;
      expect(row!.ok, priv).toBe(false);
    }
  });
});
