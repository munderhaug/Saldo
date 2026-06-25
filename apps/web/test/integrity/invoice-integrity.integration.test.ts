import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Sql, TransactionSql } from 'postgres';
import {
  type LedgerDb,
  type SeededOrg,
  ledgerDbAvailable,
  seedOrg,
  startLedgerDb,
} from './db-harness.js';

// Needs a real Postgres (Docker/Testcontainers, or SALDO_TEST_PG_URI). Skips cleanly otherwise.

/**
 * Sales-invoicing SQL integrity (build-spec §8.4, ADR 0042). Proves, against real Postgres, the
 * guarantees the route layer relies on: GAPLESS numbering (under concurrency AND rollback), the
 * append-only immutability of an issued document (and its lines), and RLS tenant isolation via the
 * non-owner `saldo_app` connection. The owner connection drives the trigger/constraint cases (they
 * apply to every role); `appSql` drives the tenancy case (RLS is FORCEd for it).
 */
describe.skipIf(!ledgerDbAvailable)('sales-invoicing integrity (real Postgres)', () => {
  let db: LedgerDb;

  beforeAll(async () => {
    db = await startLedgerDb();
  });

  afterAll(async () => {
    await db.stop();
  });

  /** A revenue account + an output VAT code for the seeded org (same-org line references). */
  async function seedSalesRefs(
    sql: Sql,
    org: SeededOrg,
  ): Promise<{ accountId: string; vatCodeId: string }> {
    const [vat] = await sql<{ id: string }[]>`
      INSERT INTO vat_code (organization_id, code, rate, direction)
      VALUES (${org.orgId}, '3', 0.2500, 'output')
      ON CONFLICT (organization_id, code) DO UPDATE SET rate = EXCLUDED.rate
      RETURNING id`;
    return { accountId: org.creditAccountId, vatCodeId: vat!.id };
  }

  /** Insert a draft invoice with one line; returns its id. */
  async function insertDraft(sql: Sql, org: SeededOrg): Promise<string> {
    const refs = await seedSalesRefs(sql, org);
    const [inv] = await sql<{ id: string }[]>`
      INSERT INTO invoice (organization_id, kind, status, customer_name, net_ore, vat_ore, gross_ore)
      VALUES (${org.orgId}, 'invoice', 'draft', 'Kunde AS', 100000, 25000, 125000)
      RETURNING id`;
    const invoiceId = inv!.id;
    await sql`
      INSERT INTO invoice_line
        (organization_id, invoice_id, line_no, description, quantity, unit, unit_price_ore,
         account_id, vat_code_id, net_ore, vat_ore)
      VALUES (${org.orgId}, ${invoiceId}, 1, 'Konsulenttime', 1, 'time', 100000,
              ${refs.accountId}, ${refs.vatCodeId}, 100000, 25000)`;
    return invoiceId;
  }

  /** Issue a draft the way the action does: allocate a number, mint a KID, set issued_at. */
  async function issue(sql: Sql, org: SeededOrg, invoiceId: string): Promise<number> {
    return sql.begin(async (tx) => {
      const rows = await tx<{ n: string }[]>`SELECT allocate_invoice_number(${org.orgId}) AS n`;
      const number = Number(rows[0]!.n);
      await tx`
        UPDATE invoice SET status = 'issued', invoice_number = ${number},
          kid = ${String(number).padStart(7, '0')}, issue_date = '2026-06-25',
          due_date = '2026-07-09', issued_at = now()
        WHERE id = ${invoiceId}`;
      return number;
    });
  }

  // ── Gapless numbering: per-org counter, NOT a SEQUENCE ──
  describe('gapless invoice numbering', () => {
    it('allocates 1..N with no gaps or duplicates under concurrency', async () => {
      const org = await seedOrg(db.sql);
      const N = 25;
      const numbers = await Promise.all(
        Array.from({ length: N }, () =>
          db.sql.begin(async (tx) => {
            const rows = await tx<
              { n: string }[]
            >`SELECT allocate_invoice_number(${org.orgId}) AS n`;
            return Number(rows[0]!.n);
          }),
        ),
      );
      expect([...numbers].sort((a, b) => a - b)).toEqual(
        Array.from({ length: N }, (_, i) => i + 1),
      );
    });

    it('leaves NO gap when an issuing transaction rolls back (the counter rolls back with it)', async () => {
      const org = await seedOrg(db.sql);
      const a = await insertDraft(db.sql, org);
      const c = await insertDraft(db.sql, org);
      expect(await issue(db.sql, org, a)).toBe(1);

      // A doomed issuing tx allocates number 2, then rolls back.
      await expect(
        db.sql.begin(async (tx) => {
          await tx`SELECT allocate_invoice_number(${org.orgId})`;
          throw new Error('rollback');
        }),
      ).rejects.toThrow(/rollback/);

      // The next real issue reuses 2 — no gap, unlike a SEQUENCE which would jump to 3.
      expect(await issue(db.sql, org, c)).toBe(2);
    });

    it('numbers are per-org (two tenants both start at 1)', async () => {
      const orgA = await seedOrg(db.sql);
      const orgB = await seedOrg(db.sql);
      const a = await insertDraft(db.sql, orgA);
      const b = await insertDraft(db.sql, orgB);
      expect(await issue(db.sql, orgA, a)).toBe(1);
      expect(await issue(db.sql, orgB, b)).toBe(1);
    });
  });

  // ── Immutability: an issued document is append-only ──
  describe('issued-document immutability', () => {
    async function issuedInvoice(): Promise<{ org: SeededOrg; invoiceId: string }> {
      const org = await seedOrg(db.sql);
      const invoiceId = await insertDraft(db.sql, org);
      await issue(db.sql, org, invoiceId);
      return { org, invoiceId };
    }

    it('blocks UPDATE of a frozen financial column', async () => {
      const { invoiceId } = await issuedInvoice();
      await expect(
        db.sql`UPDATE invoice SET gross_ore = 1 WHERE id = ${invoiceId}`,
      ).rejects.toThrow(/immutable/i);
    });

    it('blocks UPDATE of the customer snapshot', async () => {
      const { invoiceId } = await issuedInvoice();
      await expect(
        db.sql`UPDATE invoice SET customer_name = 'Endret' WHERE id = ${invoiceId}`,
      ).rejects.toThrow(/immutable/i);
    });

    it('blocks DELETE of an issued document', async () => {
      const { invoiceId } = await issuedInvoice();
      await expect(db.sql`DELETE FROM invoice WHERE id = ${invoiceId}`).rejects.toThrow(/issued/i);
    });

    it('ALLOWS the lifecycle status (and its timestamp) to advance', async () => {
      const { invoiceId } = await issuedInvoice();
      await expect(
        db.sql`UPDATE invoice SET status = 'paid', paid_at = now() WHERE id = ${invoiceId}`,
      ).resolves.not.toThrow();
    });

    it('freezes the lines of an issued document (no UPDATE / DELETE / INSERT)', async () => {
      const { org, invoiceId } = await issuedInvoice();
      await expect(
        db.sql`UPDATE invoice_line SET description = 'x' WHERE invoice_id = ${invoiceId}`,
      ).rejects.toThrow(/immutable/i);
      await expect(
        db.sql`DELETE FROM invoice_line WHERE invoice_id = ${invoiceId}`,
      ).rejects.toThrow(/immutable/i);
      await expect(
        db.sql`
          INSERT INTO invoice_line
            (organization_id, invoice_id, line_no, description, quantity, unit, unit_price_ore,
             account_id, vat_code_id, net_ore, vat_ore)
          VALUES (${org.orgId}, ${invoiceId}, 2, 'Ny linje', 1, 'stk', 1000,
                  ${org.creditAccountId}, ${org.creditAccountId}, 1000, 0)`,
      ).rejects.toThrow(/immutable/i);
    });

    it('lets a DRAFT be freely edited and deleted', async () => {
      const org = await seedOrg(db.sql);
      const invoiceId = await insertDraft(db.sql, org);
      await expect(
        db.sql`UPDATE invoice SET customer_name = 'Endret' WHERE id = ${invoiceId}`,
      ).resolves.not.toThrow();
      await expect(
        db.sql`DELETE FROM invoice_line WHERE invoice_id = ${invoiceId}`,
      ).resolves.not.toThrow();
      await expect(db.sql`DELETE FROM invoice WHERE id = ${invoiceId}`).resolves.not.toThrow();
    });
  });

  // ── Same-org composite FK: a line cannot reference another tenant's account / VAT code ──
  it('rejects a line whose account belongs to another org (same-org composite FK)', async () => {
    const orgA = await seedOrg(db.sql);
    const orgB = await seedOrg(db.sql);
    const invoiceId = await insertDraft(db.sql, orgA);
    await expect(
      db.sql`
        INSERT INTO invoice_line
          (organization_id, invoice_id, line_no, description, quantity, unit, unit_price_ore,
           account_id, vat_code_id, net_ore, vat_ore)
        VALUES (${orgA.orgId}, ${invoiceId}, 9, 'Kryss-tenant', 1, 'stk', 1000,
                ${orgB.creditAccountId}, ${orgB.creditAccountId}, 1000, 0)`,
    ).rejects.toThrow();
  });

  // ── RLS isolation via the non-owner app role ──
  describe('RLS tenant isolation (non-owner app role)', () => {
    function asOrg<T>(orgId: string, fn: (tx: TransactionSql) => Promise<T>): Promise<T> {
      return db.appSql.begin(async (tx) => {
        await tx`SELECT set_config('app.current_org', ${orgId}, true)`;
        return fn(tx);
      }) as Promise<T>;
    }

    it("an org cannot see another tenant's invoices", async () => {
      const orgA = await seedOrg(db.sql);
      const orgB = await seedOrg(db.sql);
      const invoiceId = await insertDraft(db.sql, orgA);

      const seenByA = await asOrg(
        orgA.orgId,
        (tx) => tx<{ id: string }[]>`SELECT id FROM invoice WHERE id = ${invoiceId}`,
      );
      const seenByB = await asOrg(
        orgB.orgId,
        (tx) => tx<{ id: string }[]>`SELECT id FROM invoice WHERE id = ${invoiceId}`,
      );
      expect(seenByA).toHaveLength(1);
      expect(seenByB).toHaveLength(0);
    });
  });
});
