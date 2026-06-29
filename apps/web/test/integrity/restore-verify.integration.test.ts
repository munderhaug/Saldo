import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type LedgerDb, ledgerDbAvailable, seedOrg, startLedgerDb } from './db-harness.js';

// Needs a real Postgres (Docker/Testcontainers, or SALDO_TEST_PG_URI). Skips cleanly otherwise.

/**
 * The post-restore integrity assertion (db/dr/verify-restore.sql) is the heart of the DR runbook
 * (docs/runbooks/disaster-recovery.md, ADR 0038): "a restore you have never tested is not a backup."
 * The drill (tools/restore-drill.sh) exercises the full dump→restore→verify chain on a local cluster;
 * this test keeps the verifier honest in CI by running it against a CURRENT, freshly-migrated schema —
 * so it can never silently drift from db/migrations into a check that passes a database missing an
 * object the live ledger has. It asserts:
 *  - the verifier passes on a healthy migrated DB (every required object it asserts truly exists);
 *  - `expect_data=1` fails on an empty ledger but passes once a balanced posted voucher is seeded;
 *  - the verifier BITES — it raises on a DB missing an integrity trigger.
 *
 * verify-restore.sql is a psql script (\set/\if + a custom GUC); here we strip the psql meta-commands
 * and run the DO block directly. The block reads the flag via current_setting('drill.expect_data'),
 * which we set per-run with a normal SET — no psql needed.
 */
const here = dirname(fileURLToPath(import.meta.url));
const verifySqlPath = join(here, '..', '..', '..', '..', 'db', 'dr', 'verify-restore.sql');

/** The executable DO block of verify-restore.sql, with psql-only meta-commands (`\…`, the var SET) removed. */
function verifyDoBlock(): string {
  return readFileSync(verifySqlPath, 'utf8')
    .split('\n')
    .filter(
      (line) => !line.trimStart().startsWith('\\') && !line.startsWith('SET drill.expect_data'),
    )
    .join('\n');
}

describe.skipIf(!ledgerDbAvailable)('verify-restore.sql — post-restore integrity assertion', () => {
  let db: LedgerDb;
  const doBlock = verifyDoBlock();

  beforeAll(async () => {
    db = await startLedgerDb();
  });
  afterAll(async () => {
    await db.stop();
  });

  /**
   * Run the verifier in one transaction with the flag set via `SET LOCAL` — postgres-js pools
   * connections, so a session-level SET could land on a different connection than the verify query.
   */
  async function runVerify(expectData: '0' | '1'): Promise<void> {
    await db.sql.begin(async (tx) => {
      await tx.unsafe(`SET LOCAL drill.expect_data TO '${expectData}'`);
      await tx.unsafe(doBlock);
    });
  }

  it('passes against a current, freshly-migrated schema (no drift from db/migrations)', async () => {
    await expect(runVerify('0')).resolves.toBeUndefined();
  });

  it('with expect_data=1: fails on an empty ledger, passes once a posted voucher exists', async () => {
    // The harness gives each run its own freshly-migrated throwaway DB, so this ledger starts empty.
    await expect(runVerify('1')).rejects.toThrow(/zero vouchers/);

    // Seed a balanced, posted voucher in ONE transaction (the posted-completeness + balance triggers
    // are deferred to commit, exactly as the app's posting path inserts voucher + postings together).
    const org = await seedOrg(db.sql);
    await db.sql.begin(async (tx) => {
      const [v] = await tx<{ id: string }[]>`
        INSERT INTO voucher (organization_id, type, period_id, posted_at)
        VALUES (${org.orgId}, 'sales', ${org.openPeriodId}, now())
        RETURNING id`;
      await tx`
        INSERT INTO posting (organization_id, voucher_id, account_id, debit_ore, credit_ore)
        VALUES (${org.orgId}, ${v!.id}, ${org.debitAccountId}, 125000, 0)`;
      await tx`
        INSERT INTO posting (organization_id, voucher_id, account_id, debit_ore, credit_ore)
        VALUES (${org.orgId}, ${v!.id}, ${org.creditAccountId}, 0, 125000)`;
    });

    await expect(runVerify('1')).resolves.toBeUndefined();
  });

  it('BITES — raises when an integrity trigger is missing', async () => {
    // Drop one immutability trigger inside a transaction, prove the verifier catches it, then roll
    // back so the shared DB is left intact for any other suite.
    await db.sql
      .begin(async (tx) => {
        await tx.unsafe('DROP TRIGGER voucher_immutable ON voucher');
        await tx.unsafe(`SET LOCAL drill.expect_data TO '0'`);
        await expect(tx.unsafe(doBlock)).rejects.toThrow(/voucher_immutable/);
        throw new Error('rollback');
      })
      .catch((e: unknown) => {
        if (!(e instanceof Error) || e.message !== 'rollback') throw e;
      });
  });

  // The drift fix (review §9): the tenant set is derived from the catalog, and the trigger list now
  // includes the invoice/bank triggers. Prove BOTH cover a table the OLD hand-typed list skipped.
  it('BITES — the derived RLS check now covers a previously-skipped tenant table (bank_transaction)', async () => {
    await db.sql
      .begin(async (tx) => {
        await tx.unsafe('DROP POLICY org_isolation ON bank_transaction');
        await tx.unsafe(`SET LOCAL drill.expect_data TO '0'`);
        await expect(tx.unsafe(doBlock)).rejects.toThrow(/no RLS policy on: bank_transaction/);
        throw new Error('rollback');
      })
      .catch((e: unknown) => {
        if (!(e instanceof Error) || e.message !== 'rollback') throw e;
      });
  });

  it('BITES — raises on a previously-unlisted integrity trigger (bank_transaction_append_only)', async () => {
    await db.sql
      .begin(async (tx) => {
        await tx.unsafe('DROP TRIGGER bank_transaction_append_only ON bank_transaction');
        await tx.unsafe(`SET LOCAL drill.expect_data TO '0'`);
        await expect(tx.unsafe(doBlock)).rejects.toThrow(/bank_transaction_append_only/);
        throw new Error('rollback');
      })
      .catch((e: unknown) => {
        if (!(e instanceof Error) || e.message !== 'rollback') throw e;
      });
  });
});
