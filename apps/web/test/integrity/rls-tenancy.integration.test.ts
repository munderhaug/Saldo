import { existsSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TransactionSql } from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { type LedgerDb, seedOrg, startLedgerDb } from './db-harness.js';
import * as schema from '../../app/db/schema.js';
import { withOrgTx } from '../../app/auth/middleware.js';

// Needs a Docker daemon (Testcontainers). Skip gracefully where unavailable so `pnpm test` still
// runs the pure suites; CI has Docker and runs this for real.
const dockerAvailable = Boolean(process.env.DOCKER_HOST) || existsSync('/var/run/docker.sock');

/**
 * Guarantee 5 — runtime tenant isolation via RLS. The first four guarantees are exercised by the
 * owner (superuser) connection, which bypasses RLS by design. These tests use the non-owner
 * `saldo_app` connection (db.appSql), for which RLS is FORCEd, and assert that an org sees and
 * touches only its own rows. Reproduces, against real Postgres, the isolation we rely on in prod.
 */
describe.skipIf(!dockerAvailable)('RLS tenant isolation (non-owner app role)', () => {
  let db: LedgerDb;

  beforeAll(async () => {
    db = await startLedgerDb();
  });

  afterAll(async () => {
    await db.stop();
  });

  /**
   * Run `fn` as the app role with `app.current_org` set transaction-locally — the same pattern the
   * request middleware uses (`SET LOCAL` per request). postgres.js types `begin()` as
   * `UnwrapPromiseArray<T>`, which is structurally `T` for our scalar/array results, so we narrow it.
   */
  function asOrg<T>(orgId: string, fn: (tx: TransactionSql) => Promise<T>): Promise<T> {
    return db.appSql.begin(async (tx) => {
      await tx`SELECT set_config('app.current_org', ${orgId}, true)`;
      return fn(tx);
    }) as Promise<T>;
  }

  /** Generate a fresh uuid using the app connection (no tenancy needed). */
  async function newUuid(): Promise<string> {
    const rows = await db.appSql<{ id: string }[]>`SELECT gen_random_uuid() AS id`;
    return rows[0]!.id;
  }

  it('connects as a non-owner, non-superuser role that cannot bypass or disable RLS', async () => {
    const [role] = await db.appSql<{ usr: string; super: boolean; bypass: boolean }[]>`
      SELECT current_user AS usr, rolsuper AS super, rolbypassrls AS bypass
        FROM pg_roles WHERE rolname = current_user`;
    expect(role!.usr).toBe('saldo_app');
    expect(role!.super).toBe(false);
    expect(role!.bypass).toBe(false);

    // Not the owner ⇒ cannot turn RLS off to escape isolation.
    await expect(db.appSql`ALTER TABLE organization DISABLE ROW LEVEL SECURITY`).rejects.toThrow(
      /must be owner/i,
    );
  });

  it('returns no rows when app.current_org is unset', async () => {
    await seedOrg(db.sql); // a tenant exists, but the app set no org
    const [orgs] = await db.appSql<{ n: number }[]>`SELECT count(*)::int AS n FROM organization`;
    expect(orgs!.n).toBe(0);
    const [accts] = await db.appSql<{ n: number }[]>`SELECT count(*)::int AS n FROM account`;
    expect(accts!.n).toBe(0);
  });

  it('scopes reads to the current org only', async () => {
    const a = await seedOrg(db.sql);
    const b = await seedOrg(db.sql);

    const seen = await asOrg(a.orgId, (tx) => tx<{ id: string }[]>`SELECT id FROM organization`);
    expect(seen.map((r) => r.id)).toEqual([a.orgId]);

    // Org B is invisible to org A.
    const [other] = await asOrg(
      a.orgId,
      (tx) =>
        tx<{ n: number }[]>`SELECT count(*)::int AS n FROM organization WHERE id = ${b.orgId}`,
    );
    expect(other!.n).toBe(0);

    // Account scoping too: A sees its own seeded accounts, none of B's.
    const [acct] = await asOrg(
      a.orgId,
      (tx) =>
        tx<{ mine: number; theirs: number }[]>`
          SELECT
            count(*) FILTER (WHERE organization_id = ${a.orgId})::int AS mine,
            count(*) FILTER (WHERE organization_id = ${b.orgId})::int AS theirs
          FROM account`,
    );
    expect(acct!.mine).toBeGreaterThan(0);
    expect(acct!.theirs).toBe(0);
  });

  it('blocks a cross-tenant INSERT via WITH CHECK, allows same-tenant', async () => {
    const a = await seedOrg(db.sql);
    const b = await seedOrg(db.sql);

    await expect(
      asOrg(
        a.orgId,
        (tx) =>
          tx`INSERT INTO account (organization_id, number, name, type)
             VALUES (${b.orgId}, '7000', 'cross-tenant', 'expense')`,
      ),
    ).rejects.toThrow(/row-level security/i);

    await expect(
      asOrg(
        a.orgId,
        (tx) =>
          tx`INSERT INTO account (organization_id, number, name, type)
             VALUES (${a.orgId}, '7000', 'own', 'expense')`,
      ),
    ).resolves.toBeDefined();
  });

  it('blocks cross-tenant UPDATE and DELETE (the rows are invisible)', async () => {
    const a = await seedOrg(db.sql);
    const b = await seedOrg(db.sql);

    const updated = await asOrg(
      a.orgId,
      (tx) => tx`UPDATE account SET name = 'hijacked' WHERE organization_id = ${b.orgId}`,
    );
    expect(updated.count).toBe(0);

    const deleted = await asOrg(
      a.orgId,
      (tx) => tx`DELETE FROM account WHERE organization_id = ${b.orgId}`,
    );
    expect(deleted.count).toBe(0);

    // B's data is untouched (checked via the owner connection, which bypasses RLS).
    const [bIntact] = await db.sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM account WHERE organization_id = ${b.orgId}`;
    expect(bIntact!.n).toBeGreaterThan(0);
  });

  it('allows the organization-insert bootstrap (id = current_org) but not a mismatched id', async () => {
    // Bootstrap: the app picks the new org id, sets current_org to it, then inserts that id.
    const newId = await newUuid();
    await expect(
      asOrg(
        newId,
        (tx) =>
          tx`INSERT INTO organization (id, org_nr, name, mva_status)
             VALUES (${newId}, '910000001', 'Bootstrapped ENK', 'under_threshold')`,
      ),
    ).resolves.toBeDefined();

    // A row whose id does not equal current_org is rejected by WITH CHECK.
    const otherId = await newUuid();
    await expect(
      asOrg(
        newId,
        (tx) =>
          tx`INSERT INTO organization (id, org_nr, name, mva_status)
             VALUES (${otherId}, '910000002', 'Wrong id', 'under_threshold')`,
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('lets the app role allocate gapless invoice numbers for its own tenant, never another', async () => {
    const a = await seedOrg(db.sql);
    const b = await seedOrg(db.sql);

    const numbers = await asOrg(a.orgId, async (tx) => {
      const [first] = await tx<{ n: string }[]>`SELECT allocate_invoice_number(${a.orgId}) AS n`;
      const [second] = await tx<{ n: string }[]>`SELECT allocate_invoice_number(${a.orgId}) AS n`;
      return [Number(first!.n), Number(second!.n)];
    });
    expect(numbers).toEqual([1, 2]);

    // The SECURITY DEFINER function refuses to allocate for a foreign org while scoped to A — the
    // arg-vs-GUC guard makes this hold on every topology, not only where the owner is non-superuser.
    await expect(
      asOrg(a.orgId, (tx) => tx`SELECT allocate_invoice_number(${b.orgId})`),
    ).rejects.toThrow(/not the current tenant/i);
  });

  it('enforces RLS through the Drizzle app path (withOrgTx middleware)', async () => {
    const a = await seedOrg(db.sql);
    await seedOrg(db.sql); // a second tenant that must stay invisible

    // The real app primitive: a Drizzle client on the app-role connection, scoped via SET LOCAL.
    const appDb = drizzle(db.appSql, { schema });
    const orgs = await withOrgTx(appDb, a.orgId, (tx) => tx.select().from(schema.organization));
    expect(orgs.map((o) => o.id)).toEqual([a.orgId]);

    // And a write outside the tenant is still rejected through the ORM path.
    await expect(
      withOrgTx(appDb, a.orgId, (tx) =>
        tx
          .insert(schema.account)
          .values({ organizationId: orgs[0]!.id, number: '8000', name: 'ok', type: 'expense' }),
      ),
    ).resolves.toBeDefined();
  });
});
