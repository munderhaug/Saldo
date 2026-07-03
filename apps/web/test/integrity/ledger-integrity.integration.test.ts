import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  insertVoucher,
  type LedgerDb,
  ledgerDbAvailable,
  seedOrg,
  startLedgerDb,
} from './db-harness.js';

// Needs a real Postgres (Docker/Testcontainers, or SALDO_TEST_PG_URI). Skips cleanly otherwise.
describe.skipIf(!ledgerDbAvailable)('SQL ledger integrity (real Postgres)', () => {
  let db: LedgerDb;

  beforeAll(async () => {
    db = await startLedgerDb();
  });

  afterAll(async () => {
    await db.stop();
  });

  // ── Guarantee 1: every voucher balances (Σ debit = Σ credit), checked at commit ──
  describe('balance trigger', () => {
    it('accepts a balanced voucher', async () => {
      const org = await seedOrg(db.sql);
      const voucherId = await insertVoucher(db.sql, org.orgId, org.openPeriodId);

      await expect(
        db.sql.begin(async (tx) => {
          await tx`INSERT INTO posting (organization_id, voucher_id, account_id, debit_ore, credit_ore)
                   VALUES (${org.orgId}, ${voucherId}, ${org.debitAccountId}, 100000, 0)`;
          await tx`INSERT INTO posting (organization_id, voucher_id, account_id, debit_ore, credit_ore)
                   VALUES (${org.orgId}, ${voucherId}, ${org.creditAccountId}, 0, 100000)`;
        }),
      ).resolves.not.toThrow();
    });

    it('rejects an unbalanced voucher at commit', async () => {
      const org = await seedOrg(db.sql);
      const voucherId = await insertVoucher(db.sql, org.orgId, org.openPeriodId);

      await expect(
        db.sql.begin(async (tx) => {
          // Debit with no matching credit — the deferred constraint fires at COMMIT.
          await tx`INSERT INTO posting (organization_id, voucher_id, account_id, debit_ore, credit_ore)
                   VALUES (${org.orgId}, ${voucherId}, ${org.debitAccountId}, 100000, 0)`;
        }),
      ).rejects.toThrow(/unbalanced/i);
    });
  });

  // ── Guarantee 2: posted vouchers and their postings are immutable ──
  describe('immutability trigger', () => {
    async function postedVoucher(): Promise<{ orgId: string; voucherId: string }> {
      const org = await seedOrg(db.sql);
      const voucherId = await insertVoucher(db.sql, org.orgId, org.openPeriodId);
      await db.sql.begin(async (tx) => {
        await tx`INSERT INTO posting (organization_id, voucher_id, account_id, debit_ore, credit_ore)
                 VALUES (${org.orgId}, ${voucherId}, ${org.debitAccountId}, 100000, 0)`;
        await tx`INSERT INTO posting (organization_id, voucher_id, account_id, debit_ore, credit_ore)
                 VALUES (${org.orgId}, ${voucherId}, ${org.creditAccountId}, 0, 100000)`;
      });
      // Setting posted_at the first time is allowed (OLD.posted_at IS NULL).
      await db.sql`UPDATE voucher SET posted_at = now() WHERE id = ${voucherId}`;
      return { orgId: org.orgId, voucherId };
    }

    it('blocks UPDATE of a posted voucher', async () => {
      const { voucherId } = await postedVoucher();
      await expect(
        db.sql`UPDATE voucher SET type = 'bank' WHERE id = ${voucherId}`,
      ).rejects.toThrow(/posted/i);
    });

    it('blocks DELETE of a posted voucher', async () => {
      const { voucherId } = await postedVoucher();
      await expect(db.sql`DELETE FROM voucher WHERE id = ${voucherId}`).rejects.toThrow(/posted/i);
    });

    it('blocks UPDATE of a posting on a posted voucher', async () => {
      const { voucherId } = await postedVoucher();
      await expect(
        db.sql`UPDATE posting SET debit_ore = 1 WHERE voucher_id = ${voucherId}`,
      ).rejects.toThrow(/immutable/i);
    });

    it('blocks DELETE of a posting on a posted voucher', async () => {
      const { voucherId } = await postedVoucher();
      await expect(db.sql`DELETE FROM posting WHERE voucher_id = ${voucherId}`).rejects.toThrow(
        /immutable/i,
      );
    });

    it('blocks INSERT of new postings into a posted voucher from a later transaction', async () => {
      // The append-only INSERT hole (review 2026-07-03 P0): a balanced PAIR appended after the fact
      // would still satisfy the balance trigger while rewriting the voucher's economic content.
      const { orgId, voucherId } = await postedVoucher();
      await expect(
        db.sql.begin(async (tx) => {
          await tx`INSERT INTO posting (organization_id, voucher_id, account_id, debit_ore, credit_ore)
                   SELECT ${orgId}, ${voucherId}, account_id, 50000, 0
                     FROM posting WHERE voucher_id = ${voucherId} AND debit_ore > 0 LIMIT 1`;
          await tx`INSERT INTO posting (organization_id, voucher_id, account_id, debit_ore, credit_ore)
                   SELECT ${orgId}, ${voucherId}, account_id, 0, 50000
                     FROM posting WHERE voucher_id = ${voucherId} AND credit_ore > 0 LIMIT 1`;
        }),
      ).rejects.toThrow(/immutable/i);
      // Nothing landed: the posted voucher still has exactly its original two legs.
      const [n] = await db.sql<{ count: number }[]>`
        SELECT count(*)::int AS count FROM posting WHERE voucher_id = ${voucherId}`;
      expect(n?.count).toBe(2);
    });

    it('still allows the legitimate issue path: voucher created posted + postings in ONE transaction', async () => {
      // postIssuedVoucher / recordManualVoucher insert the voucher WITH posted_at = now() and then its
      // postings inside the same tx — the same-transaction (xmin) carve-out must keep that path open.
      const org = await seedOrg(db.sql);
      await expect(
        db.sql.begin(async (tx) => {
          const [v] = await tx<{ id: string }[]>`
            INSERT INTO voucher (organization_id, type, period_id, posted_at)
            VALUES (${org.orgId}, 'manual', ${org.openPeriodId}, now())
            RETURNING id`;
          await tx`INSERT INTO posting (organization_id, voucher_id, account_id, debit_ore, credit_ore)
                   VALUES (${org.orgId}, ${v!.id}, ${org.debitAccountId}, 100000, 0)`;
          await tx`INSERT INTO posting (organization_id, voucher_id, account_id, debit_ore, credit_ore)
                   VALUES (${org.orgId}, ${v!.id}, ${org.creditAccountId}, 0, 100000)`;
        }),
      ).resolves.not.toThrow();
    });
  });

  // ── Guarantee 3: no postings (vouchers) into a locked period ──
  describe('period-lock trigger', () => {
    it('allows a voucher in an open period', async () => {
      const org = await seedOrg(db.sql);
      await expect(insertVoucher(db.sql, org.orgId, org.openPeriodId)).resolves.toBeDefined();
    });

    it('blocks a voucher in a locked period', async () => {
      const org = await seedOrg(db.sql);
      await expect(insertVoucher(db.sql, org.orgId, org.lockedPeriodId)).rejects.toThrow(/locked/i);
    });
  });

  // ── Guarantee 4: gapless invoice numbering survives a rolled-back transaction ──
  describe('allocate_invoice_number gaplessness', () => {
    it('reuses a number after a rolled-back allocation (no gap)', async () => {
      const org = await seedOrg(db.sql);

      // First committed allocation → 1.
      const [first] = await db.sql<{ n: string }[]>`
        SELECT allocate_invoice_number(${org.orgId}) AS n`;
      expect(Number(first!.n)).toBe(1);

      // Allocate inside a transaction that rolls back: the increment must roll back too.
      let burned = 0;
      await expect(
        db.sql.begin(async (tx) => {
          const [row] = await tx<{ n: string }[]>`
            SELECT allocate_invoice_number(${org.orgId}) AS n`;
          burned = Number(row!.n);
          throw new Error('force rollback');
        }),
      ).rejects.toThrow('force rollback');
      expect(burned).toBe(2);

      // Next committed allocation reuses 2 — a SEQUENCE would have skipped to 3.
      const [next] = await db.sql<{ n: string }[]>`
        SELECT allocate_invoice_number(${org.orgId}) AS n`;
      expect(Number(next!.n)).toBe(2);

      // And numbering stays monotonic + gapless thereafter.
      const [third] = await db.sql<{ n: string }[]>`
        SELECT allocate_invoice_number(${org.orgId}) AS n`;
      expect(Number(third!.n)).toBe(3);
    });
  });
});
