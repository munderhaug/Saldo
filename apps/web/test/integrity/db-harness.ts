import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import postgres, { type Sql } from 'postgres';

const here = dirname(fileURLToPath(import.meta.url));
// apps/web/test/integrity -> repo root db/migrations
const migrationsDir = join(here, '..', '..', '..', '..', 'db', 'migrations');

/**
 * Concatenate the `-- migrate:up` body of every committed SQL migration, in order.
 * The database built by these files is the source of truth (ADR 0011); these tests
 * assert that the SQL integrity guarantees actually block the bad cases.
 */
function upMigrationSql(): string {
  return readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => {
      const text = readFileSync(join(migrationsDir, f), 'utf8');
      const afterUp = text.split('-- migrate:up')[1] ?? '';
      return afterUp.split('-- migrate:down')[0] ?? '';
    })
    .join('\n');
}

export interface LedgerDb {
  readonly sql: Sql;
  readonly stop: () => Promise<void>;
}

/**
 * Start a throwaway Postgres in a container, apply the real migrations, and return a
 * client. The connection role owns the schema, so RLS (which exempts owners) does not
 * interfere — these tests exercise the triggers/constraints, which apply to all roles.
 */
export async function startLedgerDb(): Promise<LedgerDb> {
  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer(
    'postgres:16',
  ).start();
  const sql = postgres(container.getConnectionUri(), {
    prepare: false,
    onnotice: () => {},
  });
  // Simple protocol so the multi-statement script (incl. `$$ ... $$` bodies) runs as one batch.
  await sql.unsafe(upMigrationSql()).simple();
  return {
    sql,
    stop: async () => {
      await sql.end({ timeout: 5 });
      await container.stop();
    },
  };
}

export interface SeededOrg {
  readonly orgId: string;
  /** An expense/asset account (used as the debit side in tests). */
  readonly debitAccountId: string;
  /** A revenue/liability account (used as the credit side in tests). */
  readonly creditAccountId: string;
  /** An open (unlocked) fiscal period. */
  readonly openPeriodId: string;
  /** A locked fiscal period. */
  readonly lockedPeriodId: string;
}

let orgSeq = 0;

/** Seed one isolated organization with two accounts and an open + a locked period. */
export async function seedOrg(sql: Sql): Promise<SeededOrg> {
  orgSeq += 1;
  const orgNr = String(100000000 + orgSeq).slice(0, 9);

  const [org] = await sql<{ id: string }[]>`
    INSERT INTO organization (org_nr, name, mva_status)
    VALUES (${orgNr}, ${'Test ENK ' + String(orgSeq)}, 'registered_standard')
    RETURNING id`;
  const orgId = org!.id;

  const [debit] = await sql<{ id: string }[]>`
    INSERT INTO account (organization_id, number, name, type)
    VALUES (${orgId}, '6000', 'Driftskostnad', 'expense')
    RETURNING id`;
  const [credit] = await sql<{ id: string }[]>`
    INSERT INTO account (organization_id, number, name, type)
    VALUES (${orgId}, '3000', 'Salgsinntekt', 'revenue')
    RETURNING id`;

  const [open] = await sql<{ id: string }[]>`
    INSERT INTO fiscal_period (organization_id, year, starts_on, ends_on)
    VALUES (${orgId}, 2026, '2026-01-01', '2026-12-31')
    RETURNING id`;
  const [locked] = await sql<{ id: string }[]>`
    INSERT INTO fiscal_period (organization_id, year, starts_on, ends_on, locked_at)
    VALUES (${orgId}, 2025, '2025-01-01', '2025-12-31', now())
    RETURNING id`;

  return {
    orgId,
    debitAccountId: debit!.id,
    creditAccountId: credit!.id,
    openPeriodId: open!.id,
    lockedPeriodId: locked!.id,
  };
}

/** Insert an unposted voucher in the given period and return its id. */
export async function insertVoucher(
  sql: Sql,
  orgId: string,
  periodId: string,
  type = 'manual',
): Promise<string> {
  const [v] = await sql<{ id: string }[]>`
    INSERT INTO voucher (organization_id, type, period_id)
    VALUES (${orgId}, ${type}, ${periodId})
    RETURNING id`;
  return v!.id;
}
