import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Sql, TransactionSql } from 'postgres';
import { type LedgerDb, ledgerDbAvailable, seedOrg, startLedgerDb } from './db-harness.js';

// Needs a real Postgres (Docker/Testcontainers, or SALDO_TEST_PG_URI). Skips cleanly otherwise.

/**
 * Products catalogue (feat-products-catalog, §8.3) — tenancy isolation, the same-org default FK, and
 * the value CHECKs, proven against real Postgres via the non-owner `saldo_app` connection (RLS is
 * FORCEd for it). A catalogue holds no personal data, but cross-tenant leakage of one tenant's
 * price list / margins would still be a confidentiality breach: these assert a tenant sees and writes
 * only its own items, that a per-item default account/VAT code can never point at another tenant's
 * row (the composite FK, not just RLS), and that kind/price are constrained at the storage layer.
 */
describe.skipIf(!ledgerDbAvailable)(
  'Products catalogue — RLS isolation + same-org defaults',
  () => {
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

    /** Seed an output VAT code for an org (the owner connection bypasses RLS). Returns its id. */
    async function seedVatCode(sql: Sql, orgId: string, code: string): Promise<string> {
      const [row] = await sql<{ id: string }[]>`
      INSERT INTO vat_code (organization_id, code, rate, direction)
      VALUES (${orgId}, ${code}, 0.25, 'output')
      RETURNING id`;
      return row!.id;
    }

    it('scopes reads to the current org, and a cross-tenant INSERT is rejected by WITH CHECK', async () => {
      const a = await seedOrg(db.sql);
      const b = await seedOrg(db.sql);

      await asOrg(
        a.orgId,
        (tx) => tx`
      INSERT INTO product (organization_id, kind, name, unit, unit_price_ore)
      VALUES (${a.orgId}, 'service', 'Konsulenttime', 'time', 125000)`,
      );
      await asOrg(
        b.orgId,
        (tx) => tx`
      INSERT INTO product (organization_id, kind, name)
      VALUES (${b.orgId}, 'goods', 'Bs vare')`,
      );

      // A sees only its own item, never B's.
      const seen = await asOrg(a.orgId, (tx) => tx<{ name: string }[]>`SELECT name FROM product`);
      expect(seen.map((r) => r.name)).toEqual(['Konsulenttime']);

      // Writing a row tagged with another tenant's org id is blocked by the policy's WITH CHECK.
      await expect(
        asOrg(
          a.orgId,
          (tx) => tx`
        INSERT INTO product (organization_id, kind, name)
        VALUES (${b.orgId}, 'goods', 'Smuglet inn')`,
        ),
      ).rejects.toThrow(/row-level security/i);
    });

    it('blocks cross-tenant UPDATE and DELETE (the rows are invisible)', async () => {
      const a = await seedOrg(db.sql);
      const b = await seedOrg(db.sql);
      await asOrg(
        b.orgId,
        (tx) => tx`
      INSERT INTO product (organization_id, kind, name)
      VALUES (${b.orgId}, 'goods', 'Bs vare')`,
      );

      const updated = await asOrg(
        a.orgId,
        (tx) => tx`UPDATE product SET name = 'hijacked' WHERE organization_id = ${b.orgId}`,
      );
      expect(updated.count).toBe(0);

      const deleted = await asOrg(
        a.orgId,
        (tx) => tx`DELETE FROM product WHERE organization_id = ${b.orgId}`,
      );
      expect(deleted.count).toBe(0);

      const [intact] = await db.sql<{ name: string }[]>`
      SELECT name FROM product WHERE organization_id = ${b.orgId}`;
      expect(intact!.name).toBe('Bs vare');
    });

    it('lets a default account/VAT code reference the OWN org, but never another tenant', async () => {
      const a = await seedOrg(db.sql);
      const b = await seedOrg(db.sql);
      const aVat = await seedVatCode(db.sql, a.orgId, 'A3');
      const bVat = await seedVatCode(db.sql, b.orgId, 'B3');

      // Same-org defaults (account + VAT code): allowed.
      await expect(
        asOrg(
          a.orgId,
          (tx) => tx`
        INSERT INTO product (organization_id, kind, name, default_account_id, default_vat_code_id)
        VALUES (${a.orgId}, 'service', 'Med standarder', ${a.creditAccountId}, ${aVat})`,
        ),
      ).resolves.toBeDefined();

      // Cross-tenant default account: the composite FK (id, organization_id) has no matching row for A.
      await expect(
        asOrg(
          a.orgId,
          (tx) => tx`
        INSERT INTO product (organization_id, kind, name, default_account_id)
        VALUES (${a.orgId}, 'service', 'Stjålet konto', ${b.creditAccountId})`,
        ),
      ).rejects.toThrow(/foreign key|violates/i);

      // Cross-tenant default VAT code: same — RLS alone would not catch an FK target.
      await expect(
        asOrg(
          a.orgId,
          (tx) => tx`
        INSERT INTO product (organization_id, kind, name, default_vat_code_id)
        VALUES (${a.orgId}, 'service', 'Stjålet MVA-kode', ${bVat})`,
        ),
      ).rejects.toThrow(/foreign key|violates/i);
    });

    it('constrains kind to goods/service and the unit price to non-negative øre', async () => {
      const a = await seedOrg(db.sql);

      await expect(
        asOrg(
          a.orgId,
          (tx) => tx`
        INSERT INTO product (organization_id, kind, name)
        VALUES (${a.orgId}, 'widget', 'Ugyldig type')`,
        ),
      ).rejects.toThrow(/product_kind_check|check constraint/i);

      await expect(
        asOrg(
          a.orgId,
          (tx) => tx`
        INSERT INTO product (organization_id, kind, name, unit_price_ore)
        VALUES (${a.orgId}, 'goods', 'Negativ pris', -1)`,
        ),
      ).rejects.toThrow(/product_unit_price_ore_check|check constraint/i);
    });
  },
);
