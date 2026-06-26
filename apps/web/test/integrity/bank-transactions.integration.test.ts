import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TransactionSql } from 'postgres';
import { type LedgerDb, ledgerDbAvailable, seedOrg, startLedgerDb } from './db-harness.js';

// Needs a real Postgres (Docker/Testcontainers, or SALDO_TEST_PG_URI). Skips cleanly otherwise.

/**
 * Banking import (feat-banking-import, §8.7) — the persistence invariants, proven against real Postgres:
 *   * RLS tenancy isolation on bank_account + bank_transaction (via the non-owner `saldo_app`
 *     connection, for which RLS is FORCEd) — bank data is personal/financial, so leakage is a privacy
 *     incident, not just a bug;
 *   * the same-org composite FK — a transaction can never attach to ANOTHER tenant's account;
 *   * APPEND-ONLY — an imported transaction's facts are immutable (a trigger blocks DELETE and blocks
 *     UPDATE of any imported column), while the reconciliation columns (kid, matched_voucher_id) stay
 *     writable for the downstream matching task;
 *   * IDEMPOTENT import — the per-account UNIQUE (external_ref) rejects a duplicate.
 */
describe.skipIf(!ledgerDbAvailable)(
  'Banking import — RLS, same-org FK, append-only, idempotency',
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

    /** Seed an account + a single transaction for `orgId` via the owner connection (bypasses RLS). */
    async function seedAccountWithTx(orgId: string): Promise<{ accountId: string; txId: string }> {
      const [acc] = await db.sql<{ id: string }[]>`
      INSERT INTO bank_account (organization_id, label, currency)
      VALUES (${orgId}, 'Driftskonto', 'NOK') RETURNING id`;
      const accountId = acc!.id;
      const [tx] = await db.sql<{ id: string }[]>`
      INSERT INTO bank_transaction
        (organization_id, bank_account_id, source, external_ref, amount_ore, currency, booking_date)
      VALUES (${orgId}, ${accountId}, 'camt054', 'ref-1', 123450, 'NOK', '2026-06-01') RETURNING id`;
      return { accountId, txId: tx!.id };
    }

    it('scopes reads to the current org; a cross-tenant INSERT is rejected by WITH CHECK', async () => {
      const a = await seedOrg(db.sql);
      const b = await seedOrg(db.sql);

      const [accA] = await db.sql<{ id: string }[]>`
      INSERT INTO bank_account (organization_id, label, currency)
      VALUES (${a.orgId}, 'A konto', 'NOK') RETURNING id`;
      await db.sql`
      INSERT INTO bank_account (organization_id, label, currency) VALUES (${b.orgId}, 'B konto', 'NOK')`;

      // A sees only its own account.
      const seen = await asOrg(
        a.orgId,
        (tx) => tx<{ label: string }[]>`SELECT label FROM bank_account`,
      );
      expect(seen.map((r) => r.label)).toEqual(['A konto']);

      // A transaction tagged with another tenant's org id is blocked by the policy's WITH CHECK.
      await expect(
        asOrg(
          a.orgId,
          (tx) => tx`
        INSERT INTO bank_transaction
          (organization_id, bank_account_id, source, external_ref, amount_ore, currency)
        VALUES (${b.orgId}, ${accA!.id}, 'csv', 'x', 100, 'NOK')`,
        ),
      ).rejects.toThrow(/row-level security/i);
    });

    it('rejects a transaction that references another tenant account (same-org composite FK)', async () => {
      const a = await seedOrg(db.sql);
      const b = await seedOrg(db.sql);
      const { accountId: bAccount } = await seedAccountWithTx(b.orgId);

      // A tries to attach a transaction to B's account id under A's org → no matching (id, org) row.
      await expect(
        asOrg(
          a.orgId,
          (tx) => tx`
        INSERT INTO bank_transaction
          (organization_id, bank_account_id, source, external_ref, amount_ore, currency)
        VALUES (${a.orgId}, ${bAccount}, 'csv', 'y', 100, 'NOK')`,
        ),
      ).rejects.toThrow(/foreign key|violates/i);
    });

    it('is append-only: DELETE is blocked and imported columns are immutable', async () => {
      const a = await seedOrg(db.sql);
      const { txId } = await seedAccountWithTx(a.orgId);

      await expect(db.sql`DELETE FROM bank_transaction WHERE id = ${txId}`).rejects.toThrow(
        /append-only/i,
      );

      await expect(
        db.sql`UPDATE bank_transaction SET amount_ore = 999 WHERE id = ${txId}`,
      ).rejects.toThrow(/immutable/i);
    });

    it('allows the reconciliation columns (kid, matched_voucher_id) to change', async () => {
      const a = await seedOrg(db.sql);
      const { txId } = await seedAccountWithTx(a.orgId);

      const updated =
        await db.sql`UPDATE bank_transaction SET kid = '1234567890128' WHERE id = ${txId}`;
      expect(updated.count).toBe(1);
      const [row] = await db.sql<
        { kid: string }[]
      >`SELECT kid FROM bank_transaction WHERE id = ${txId}`;
      expect(row!.kid).toBe('1234567890128');
    });

    it('rejects a duplicate (bank_account_id, external_ref) — the idempotency key', async () => {
      const a = await seedOrg(db.sql);
      const { accountId } = await seedAccountWithTx(a.orgId); // external_ref 'ref-1'

      await expect(
        db.sql`
      INSERT INTO bank_transaction
        (organization_id, bank_account_id, source, external_ref, amount_ore, currency)
      VALUES (${a.orgId}, ${accountId}, 'csv', 'ref-1', 500, 'NOK')`,
      ).rejects.toThrow(/duplicate key|unique/i);
    });
  },
);
