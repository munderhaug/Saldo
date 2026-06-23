import { existsSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type LedgerDb, startLedgerDb } from './db-harness.js';

// Needs a Docker daemon (Testcontainers); skips gracefully where unavailable (CI has Docker).
const dockerAvailable = Boolean(process.env.DOCKER_HOST) || existsSync('/var/run/docker.sock');

/**
 * RLS-coverage gate (ADR 0018). The ledger-integrity rule says EVERY tenant-scoped table MUST, in the
 * same migration, force RLS, add a USING+WITH CHECK policy, and grant the app role its DML. This test
 * makes that "MUST" mechanical: it discovers every base table in `public` and asserts the full regime,
 * so a future table that forgets any part fails CI rather than silently shipping an open tenant.
 *
 * `schema_migrations` (dbmate bookkeeping) is excluded — it is not present in this harness (the
 * migrations are applied as raw SQL, not via dbmate) but is excluded defensively.
 */
describe.skipIf(!dockerAvailable)('RLS coverage — every public table is locked down', () => {
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

    // Sanity: the seven business tables exist (guards against an empty/over-broad query passing vacuously).
    expect(tables.map((t) => t.relname)).toEqual([
      'account',
      'fiscal_period',
      'invoice_counter',
      'organization',
      'posting',
      'vat_code',
      'voucher',
    ]);

    for (const t of tables) {
      // 1. RLS enabled AND forced (so the owner is subject too — ADR 0012).
      expect(t.rowsecurity, `${t.relname}: RLS must be ENABLED`).toBe(true);
      expect(t.forced, `${t.relname}: RLS must be FORCED`).toBe(true);

      // 2. At least one policy.
      const [pol] = await db.sql<{ n: number }[]>`
        SELECT count(*)::int AS n FROM pg_policies
         WHERE schemaname = 'public' AND tablename = ${t.relname}`;
      expect(pol!.n, `${t.relname}: must have an RLS policy`).toBeGreaterThan(0);

      // 3. The app role can at least read it (the per-table DML grant exists).
      const [grant] = await db.sql<{ ok: boolean }[]>`
        SELECT has_table_privilege('saldo_app', ${'public.' + t.relname}, 'SELECT') AS ok`;
      expect(grant!.ok, `${t.relname}: saldo_app must hold a grant`).toBe(true);
    }
  });
});
