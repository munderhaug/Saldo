import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type LedgerDb, ledgerDbAvailable, startLedgerDb } from './db-harness.js';

// Needs a real Postgres (Docker/Testcontainers, or SALDO_TEST_PG_URI). Skips cleanly otherwise.

/**
 * RLS-coverage gate (ADR 0018). The ledger-integrity rule says EVERY tenant-scoped table MUST, in the
 * same migration, force RLS, add a USING+WITH CHECK policy, and grant the app role its DML. This test
 * makes that "MUST" mechanical: it discovers every base table in `public` and asserts the full regime,
 * so a future table that forgets any part fails CI rather than silently shipping an open tenant.
 *
 * `schema_migrations` (dbmate bookkeeping) is excluded — it is not present in this harness (the
 * migrations are applied as raw SQL, not via dbmate) but is excluded defensively.
 */
describe.skipIf(!ledgerDbAvailable)('RLS coverage — every public table is locked down', () => {
  let db: LedgerDb;

  beforeAll(async () => {
    db = await startLedgerDb();
  });

  afterAll(async () => {
    await db.stop();
  });

  it('every tenant table has ENABLE + FORCE RLS, a policy, and a saldo_app grant', async () => {
    const tables = await db.sql<{ relname: string; rowsecurity: boolean; forced: boolean }[]>`
      SELECT c.relname, c.relrowsecurity AS rowsecurity, c.relforcerowsecurity AS forced
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public'
         AND c.relkind = 'r'
         AND c.relname <> 'schema_migrations'
       ORDER BY c.relname`;

    // Tenant tables MUST be FORCE-RLS'd + policied (ADR 0012). Auth/system tables are pre-org and
    // protected differently (grant + secret-key lookup, ADR 0020) — they sit on an explicit allowlist.
    const TENANT_TABLES = [
      'account',
      'ai_provenance',
      'contact',
      'fiscal_period',
      'invoice_counter',
      'organization',
      'posting',
      'product',
      'vat_code',
      'voucher',
    ];
    const AUTH_TABLES = ['app_user', 'membership', 'user_session'];

    // Every public table is classified — a FUTURE table that is neither tenant-RLS'd nor an
    // acknowledged auth table fails here, forcing a deliberate decision rather than a silent open table.
    expect(tables.map((t) => t.relname)).toEqual([...TENANT_TABLES, ...AUTH_TABLES].sort());

    for (const t of tables) {
      const isTenant = TENANT_TABLES.includes(t.relname);

      if (isTenant) {
        // RLS enabled AND forced (so the owner is subject too — ADR 0012) + a policy.
        expect(t.rowsecurity, `${t.relname}: RLS must be ENABLED`).toBe(true);
        expect(t.forced, `${t.relname}: RLS must be FORCED`).toBe(true);
        const [pol] = await db.sql<{ n: number }[]>`
          SELECT count(*)::int AS n FROM pg_policies
           WHERE schemaname = 'public' AND tablename = ${t.relname}`;
        expect(pol!.n, `${t.relname}: must have an RLS policy`).toBeGreaterThan(0);
      } else {
        // Auth table: intentionally NOT org-RLS'd (there is no tenant context when it is queried).
        expect(
          t.forced,
          `${t.relname}: auth table must not be FORCE-RLS'd by design (ADR 0020)`,
        ).toBe(false);
      }

      // Every table: the app role holds a grant (it could not function otherwise).
      const [grant] = await db.sql<{ ok: boolean }[]>`
        SELECT has_table_privilege('saldo_app', ${'public.' + t.relname}, 'SELECT') AS ok`;
      expect(grant!.ok, `${t.relname}: saldo_app must hold a grant`).toBe(true);
    }
  });
});
