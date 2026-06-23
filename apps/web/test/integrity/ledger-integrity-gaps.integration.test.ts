import { existsSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { insertVoucher, type LedgerDb, seedOrg, startLedgerDb } from './db-harness.js';

// Needs a Docker daemon (Testcontainers); skips gracefully where unavailable (CI has Docker).
const dockerAvailable = Boolean(process.env.DOCKER_HOST) || existsSync('/var/run/docker.sock');

/**
 * Ledger-integrity GAPS (ADR 0018). Each test proves the BAD case is now blocked by SQL — the four
 * holes that the original guarantees left open: posting-side period lock, empty/half-posted vouchers,
 * overlapping fiscal periods, and cross-org period references. Run by the owner (superuser) connection,
 * which bypasses RLS but is fully subject to triggers/constraints.
 */
describe.skipIf(!dockerAvailable)('SQL ledger integrity — closed gaps (real Postgres)', () => {
  let db: LedgerDb;

  beforeAll(async () => {
    db = await startLedgerDb();
  });

  afterAll(async () => {
    await db.stop();
  });

  // ── Gap 1: the period lock now reaches postings (not just the voucher) ──
  describe('period-lock hole', () => {
    it('blocks adding a posting to an unposted voucher whose period was locked afterwards', async () => {
      const org = await seedOrg(db.sql);
      const voucherId = await insertVoucher(db.sql, org.orgId, org.openPeriodId);
      // Lock the period AFTER the (unposted) voucher already exists in it.
      await db.sql`UPDATE fiscal_period SET locked_at = now() WHERE id = ${org.openPeriodId}`;

      await expect(
        db.sql`INSERT INTO posting (organization_id, voucher_id, account_id, debit_ore, credit_ore)
               VALUES (${org.orgId}, ${voucherId}, ${org.debitAccountId}, 100, 0)`,
      ).rejects.toThrow(/locked/i);
    });

    it('blocks deleting an unposted voucher in a now-locked period', async () => {
      const org = await seedOrg(db.sql);
      const voucherId = await insertVoucher(db.sql, org.orgId, org.openPeriodId);
      await db.sql`UPDATE fiscal_period SET locked_at = now() WHERE id = ${org.openPeriodId}`;

      await expect(db.sql`DELETE FROM voucher WHERE id = ${voucherId}`).rejects.toThrow(/locked/i);
    });
  });

  // ── Gap 2: a posted voucher must have >= 2 postings and balance ──
  describe('posted voucher completeness', () => {
    it('rejects posting an empty voucher (no postings)', async () => {
      const org = await seedOrg(db.sql);
      // Single statement → the deferred constraint fires at the implicit commit.
      await expect(
        db.sql`INSERT INTO voucher (organization_id, type, period_id, posted_at)
               VALUES (${org.orgId}, 'manual', ${org.openPeriodId}, now())`,
      ).rejects.toThrow(/at least 2 postings/i);
    });

    it('rejects posting a dangling single-leg voucher', async () => {
      const org = await seedOrg(db.sql);
      await expect(
        db.sql.begin(async (tx) => {
          const [v] = await tx<{ id: string }[]>`
            INSERT INTO voucher (organization_id, type, period_id)
            VALUES (${org.orgId}, 'manual', ${org.openPeriodId}) RETURNING id`;
          await tx`INSERT INTO posting (organization_id, voucher_id, account_id, debit_ore, credit_ore)
                   VALUES (${org.orgId}, ${v!.id}, ${org.debitAccountId}, 100, 0)`;
          await tx`UPDATE voucher SET posted_at = now() WHERE id = ${v!.id}`;
        }),
        // One leg can never balance (debit<>credit), so the balance check is what bites here.
      ).rejects.toThrow(/unbalanced|at least 2 postings/i);
    });

    it('accepts posting a balanced 2-leg voucher', async () => {
      const org = await seedOrg(db.sql);
      await expect(
        db.sql.begin(async (tx) => {
          const [v] = await tx<{ id: string }[]>`
            INSERT INTO voucher (organization_id, type, period_id)
            VALUES (${org.orgId}, 'manual', ${org.openPeriodId}) RETURNING id`;
          await tx`INSERT INTO posting (organization_id, voucher_id, account_id, debit_ore, credit_ore)
                   VALUES (${org.orgId}, ${v!.id}, ${org.debitAccountId}, 100, 0)`;
          await tx`INSERT INTO posting (organization_id, voucher_id, account_id, debit_ore, credit_ore)
                   VALUES (${org.orgId}, ${v!.id}, ${org.creditAccountId}, 0, 100)`;
          await tx`UPDATE voucher SET posted_at = now() WHERE id = ${v!.id}`;
        }),
      ).resolves.not.toThrow();
    });
  });

  // ── Gap 3: a tenant's fiscal periods may not overlap ──
  describe('fiscal-period overlap', () => {
    it('rejects an overlapping period for the same org', async () => {
      const org = await seedOrg(db.sql); // seeds 2026 (Jan–Dec) and 2025
      await expect(
        db.sql`INSERT INTO fiscal_period (organization_id, year, starts_on, ends_on)
               VALUES (${org.orgId}, 2026, '2026-06-01', '2027-05-31')`,
      ).rejects.toThrow(/overlap|exclu/i);
    });

    it('accepts a non-overlapping period', async () => {
      const org = await seedOrg(db.sql);
      await expect(
        db.sql`INSERT INTO fiscal_period (organization_id, year, starts_on, ends_on)
               VALUES (${org.orgId}, 2024, '2024-01-01', '2024-12-31')`,
      ).resolves.toBeDefined();
    });
  });

  // ── Gap 4: a voucher's period must belong to the voucher's own org ──
  describe('cross-org period reference', () => {
    it("rejects a voucher pointing at another org's period", async () => {
      const a = await seedOrg(db.sql);
      const b = await seedOrg(db.sql);
      await expect(
        db.sql`INSERT INTO voucher (organization_id, type, period_id)
               VALUES (${b.orgId}, 'manual', ${a.openPeriodId})`,
      ).rejects.toThrow(/voucher_period_same_org|foreign key/i);
    });

    it('accepts a voucher pointing at its own period', async () => {
      const b = await seedOrg(db.sql);
      await expect(insertVoucher(db.sql, b.orgId, b.openPeriodId)).resolves.toBeDefined();
    });
  });
});
