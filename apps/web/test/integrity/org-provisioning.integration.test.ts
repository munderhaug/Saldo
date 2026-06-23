import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Sql } from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { type LedgerDb, ledgerDbAvailable, startLedgerDb } from './db-harness.js';
import * as schema from '../../app/db/schema.js';
import { createOrganization, listOrganizationsForUser } from '../../app/db/organizations.server.js';
import { STANDARD_ACCOUNTS, STANDARD_VAT_CODES } from '../../app/db/provisioning.server.js';

// Needs a real Postgres (Docker/Testcontainers, or SALDO_TEST_PG_URI). Skips cleanly otherwise.

/**
 * The org-onboarding provisioning transaction (ADR 0032): creating an org through the app role must,
 * atomically, write the org, its owner membership, and the full per-org kontoplan + VAT codes — and
 * RLS must keep all of it scoped to that tenant. Run through the real app primitives
 * (`drizzle(appSql)` + `createOrganization`), exactly as a route action would.
 */
describe.skipIf(!ledgerDbAvailable)('org provisioning + tenancy (app role)', () => {
  let db: LedgerDb;
  /** A Drizzle client on the non-owner app-role connection (RLS FORCEd), like the running app. */
  let appDb: ReturnType<typeof drizzle<typeof schema>>;

  beforeAll(async () => {
    db = await startLedgerDb();
    appDb = drizzle(db.appSql, { schema });
  });

  afterAll(async () => {
    await db.stop();
  });

  let userSeq = 0;
  /** Seed an app_user via the owner connection (auth tables are pre-org, no RLS). */
  async function seedUser(sql: Sql): Promise<string> {
    userSeq += 1;
    const [u] = await sql<{ id: string }[]>`
      INSERT INTO app_user (email) VALUES (${`owner${userSeq}@example.test`}) RETURNING id`;
    return u!.id;
  }

  it('provisions the full kontoplan + VAT codes and an owner membership, scoped to the new org', async () => {
    const userId = await seedUser(db.sql);
    const result = await createOrganization(appDb, {
      userId,
      orgNr: '910000010',
      name: 'Provisjonert ENK',
      mvaStatus: 'registered_standard',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { orgId } = result;

    // Counts (via the owner connection, which bypasses RLS) match the committed lists exactly.
    const [acc] = await db.sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM account WHERE organization_id = ${orgId}`;
    const [vat] = await db.sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM vat_code WHERE organization_id = ${orgId}`;
    expect(acc!.n).toBe(STANDARD_ACCOUNTS.length);
    expect(vat!.n).toBe(STANDARD_VAT_CODES.length);
    expect(acc!.n).toBeGreaterThan(700); // the standard 4-character kontoplan
    expect(vat!.n).toBe(30);

    // The owner membership exists.
    const [mem] = await db.sql<{ role: string }[]>`
      SELECT role FROM membership WHERE user_id = ${userId} AND organization_id = ${orgId}`;
    expect(mem!.role).toBe('owner');

    // A representative VAT code is provisioned with the cited rate + derived direction.
    const [output] = await db.sql<{ rate: string; direction: string }[]>`
      SELECT rate::text AS rate, direction FROM vat_code
       WHERE organization_id = ${orgId} AND code = '3'`;
    expect(output!.direction).toBe('output');
    expect(Number(output!.rate)).toBeCloseTo(0.25, 4);

    // A representative account carries its kontoklasse type.
    const [revenue] = await db.sql<{ type: string }[]>`
      SELECT type FROM account WHERE organization_id = ${orgId} AND number = '3000'`;
    expect(revenue!.type).toBe('revenue');
  });

  it('surfaces the org through the multi-membership selection query', async () => {
    const userId = await seedUser(db.sql);
    const created = await createOrganization(appDb, {
      userId,
      orgNr: '910000020',
      name: 'Valgbart Foretak',
      mvaStatus: 'under_threshold',
    });
    expect(created.ok).toBe(true);

    const orgs = await listOrganizationsForUser(appDb, userId);
    expect(orgs).toHaveLength(1);
    expect(orgs[0]).toMatchObject({
      name: 'Valgbart Foretak',
      orgNr: '910000020',
      mvaStatus: 'under_threshold',
      role: 'owner',
    });
  });

  it("keeps one org's provisioned rows invisible to another tenant (RLS)", async () => {
    const userA = await seedUser(db.sql);
    const userB = await seedUser(db.sql);
    const a = await createOrganization(appDb, {
      userId: userA,
      orgNr: '910000030',
      name: 'Tenant A',
      mvaStatus: 'registered_standard',
    });
    const b = await createOrganization(appDb, {
      userId: userB,
      orgNr: '910000040',
      name: 'Tenant B',
      mvaStatus: 'registered_standard',
    });
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;

    // User A only sees A's org; B's accounts are invisible while scoped to A.
    const aOrgs = await listOrganizationsForUser(appDb, userA);
    expect(aOrgs.map((o) => o.orgNr)).toEqual(['910000030']);

    const seen = await db.appSql.begin(async (tx) => {
      await tx`SELECT set_config('app.current_org', ${a.orgId}, true)`;
      const [own] = await tx<{ n: number }[]>`
        SELECT count(*)::int AS n FROM account WHERE organization_id = ${a.orgId}`;
      const [other] = await tx<{ n: number }[]>`
        SELECT count(*)::int AS n FROM account WHERE organization_id = ${b.orgId}`;
      return { own: own!.n, other: other!.n };
    });
    expect(seen.own).toBeGreaterThan(0);
    expect(seen.other).toBe(0);
  });

  it('rejects a duplicate org number without leaving partial rows (atomic rollback)', async () => {
    const userId = await seedUser(db.sql);
    const first = await createOrganization(appDb, {
      userId,
      orgNr: '910000050',
      name: 'First',
      mvaStatus: 'under_threshold',
    });
    expect(first.ok).toBe(true);

    const [before] = await db.sql<{ n: number }[]>`SELECT count(*)::int AS n FROM account`;
    const dup = await createOrganization(appDb, {
      userId,
      orgNr: '910000050',
      name: 'Duplicate',
      mvaStatus: 'under_threshold',
    });
    expect(dup).toEqual({ ok: false, reason: 'duplicate-org-nr' });

    // The failed creation rolled back wholesale — no orphaned accounts from the second attempt.
    const [after] = await db.sql<{ n: number }[]>`SELECT count(*)::int AS n FROM account`;
    expect(after!.n).toBe(before!.n);
  });
});
