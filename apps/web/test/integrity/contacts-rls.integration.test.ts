import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TransactionSql } from 'postgres';
import { type LedgerDb, ledgerDbAvailable, seedOrg, startLedgerDb } from './db-harness.js';

// Needs a real Postgres (Docker/Testcontainers, or SALDO_TEST_PG_URI). Skips cleanly otherwise.

/**
 * Contacts register (feat-contacts-register, §8.2) — tenancy isolation + the same-org default FK,
 * proven against real Postgres via the non-owner `saldo_app` connection (RLS is FORCEd for it). The
 * register holds an ENK's personal data, so cross-tenant leakage would be a privacy incident, not just
 * a bug: these assert a tenant sees and writes only its own contacts, and that a per-contact default
 * account can never point at another tenant's row even though FK targets are not constrained by RLS.
 */
describe.skipIf(!ledgerDbAvailable)('Contacts register — RLS isolation + same-org defaults', () => {
  let db: LedgerDb;

  beforeAll(async () => {
    db = await startLedgerDb();
  });

  afterAll(async () => {
    await db.stop();
  });

  /** Run `fn` as the app role with `app.current_org` set transaction-locally (the request pattern). */
  function asOrg<T>(orgId: string, fn: (tx: TransactionSql) => Promise<T>): Promise<T> {
    return db.appSql.begin(async (tx) => {
      await tx`SELECT set_config('app.current_org', ${orgId}, true)`;
      return fn(tx);
    }) as Promise<T>;
  }

  it('scopes reads to the current org, and a cross-tenant INSERT is rejected by WITH CHECK', async () => {
    const a = await seedOrg(db.sql);
    const b = await seedOrg(db.sql);

    await asOrg(
      a.orgId,
      (tx) => tx`
      INSERT INTO contact (organization_id, name, is_customer, mva_status)
      VALUES (${a.orgId}, 'Kunde AS', true, 'registered_standard')`,
    );
    await asOrg(
      b.orgId,
      (tx) => tx`
      INSERT INTO contact (organization_id, name, is_supplier, mva_status)
      VALUES (${b.orgId}, 'Leverandør AS', true, 'under_threshold')`,
    );

    // A sees only its own contact, never B's.
    const seen = await asOrg(a.orgId, (tx) => tx<{ name: string }[]>`SELECT name FROM contact`);
    expect(seen.map((r) => r.name)).toEqual(['Kunde AS']);

    // Writing a row tagged with another tenant's org id is blocked by the policy's WITH CHECK.
    await expect(
      asOrg(
        a.orgId,
        (tx) => tx`
        INSERT INTO contact (organization_id, name, is_customer, mva_status)
        VALUES (${b.orgId}, 'Smuglet inn', true, 'under_threshold')`,
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('blocks cross-tenant UPDATE and DELETE (the rows are invisible)', async () => {
    const a = await seedOrg(db.sql);
    const b = await seedOrg(db.sql);
    await asOrg(
      b.orgId,
      (tx) => tx`
      INSERT INTO contact (organization_id, name, is_customer, mva_status)
      VALUES (${b.orgId}, 'Bs kontakt', true, 'unntatt')`,
    );

    const updated = await asOrg(
      a.orgId,
      (tx) => tx`UPDATE contact SET name = 'hijacked' WHERE organization_id = ${b.orgId}`,
    );
    expect(updated.count).toBe(0);

    const deleted = await asOrg(
      a.orgId,
      (tx) => tx`DELETE FROM contact WHERE organization_id = ${b.orgId}`,
    );
    expect(deleted.count).toBe(0);

    const [intact] = await db.sql<{ name: string }[]>`
      SELECT name FROM contact WHERE organization_id = ${b.orgId}`;
    expect(intact!.name).toBe('Bs kontakt');
  });

  it('lets a default account/VAT code reference the OWN org, but never another tenant', async () => {
    const a = await seedOrg(db.sql);
    const b = await seedOrg(db.sql);

    // Same-org default: allowed.
    await expect(
      asOrg(
        a.orgId,
        (tx) => tx`
        INSERT INTO contact (organization_id, name, is_customer, mva_status, default_account_id)
        VALUES (${a.orgId}, 'Med standardkonto', true, 'registered_standard', ${a.debitAccountId})`,
      ),
    ).resolves.toBeDefined();

    // Cross-tenant default: the composite FK (id, organization_id) has no matching row for org A, so
    // it is rejected at the storage layer — RLS alone would not catch an FK target.
    await expect(
      asOrg(
        a.orgId,
        (tx) => tx`
        INSERT INTO contact (organization_id, name, is_customer, mva_status, default_account_id)
        VALUES (${a.orgId}, 'Stjålet konto', true, 'registered_standard', ${b.debitAccountId})`,
      ),
    ).rejects.toThrow(/foreign key|violates/i);
  });

  it('requires a role (is_customer OR is_supplier) via a CHECK constraint', async () => {
    const a = await seedOrg(db.sql);
    await expect(
      asOrg(
        a.orgId,
        (tx) => tx`
        INSERT INTO contact (organization_id, name, mva_status)
        VALUES (${a.orgId}, 'Uten rolle', 'under_threshold')`,
      ),
    ).rejects.toThrow(/contact_check|check constraint/i);
  });
});
