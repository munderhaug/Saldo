import { existsSync, readdirSync, readFileSync } from 'node:fs';
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

/** The non-owner application role created by the tenancy migration. */
const APP_ROLE = 'saldo_app';
/** Test-only password for the app role (set after migrating; never used in production). */
const APP_ROLE_PASSWORD = 'saldo_app_test';
/** Advisory-lock key serializing setup across parallel test files that share one external cluster. */
const LEDGER_SETUP_LOCK = 5_212_026;

/**
 * Can the integration suites get a real Postgres? True when **either** Docker is present (the
 * Testcontainers default, ADR 0014) **or** `SALDO_TEST_PG_URI` points at an existing Postgres (the
 * Docker-less escape hatch — e.g. a local PG started by the environment setup script). The suites
 * `skipIf(!ledgerDbAvailable)` so they run wherever a database is reachable and skip cleanly otherwise.
 */
export const ledgerDbAvailable =
  Boolean(process.env.SALDO_TEST_PG_URI) ||
  Boolean(process.env.DOCKER_HOST) ||
  existsSync('/var/run/docker.sock');

export interface LedgerDb {
  /**
   * Owner connection (the Testcontainers superuser). Bypasses RLS even under FORCE, so it is the
   * seed/admin path: use it to set up fixtures and to exercise the triggers/constraints, which
   * apply to every role.
   */
  readonly sql: Sql;
  /**
   * Application connection as the non-owner `saldo_app` role. RLS is enforced for it (it is neither
   * the owner nor a superuser, and FORCE is on), so it is the harness for the tenancy-isolation
   * tests — mirroring how the running app connects and runs `SET LOCAL app.current_org` per request.
   */
  readonly appSql: Sql;
  /**
   * The `saldo_app` connection STRING for this run's database — what `DATABASE_URL` must be set to so
   * the app's `db` singleton (the route handlers) connects as the non-owner role, with RLS in force,
   * exactly like production. Used by the route-test harness's env+dynamic-import seam.
   */
  readonly appUri: string;
  readonly stop: () => Promise<void>;
}

/**
 * Start a throwaway Postgres in a container, apply the real migrations, and return two clients:
 * an owner (superuser) connection for seeding/triggers, and a non-owner `saldo_app` connection for
 * RLS tenancy tests. The migrations create `saldo_app` without a password; we set a throwaway one
 * here so it can connect over TCP.
 */
export async function startLedgerDb(): Promise<LedgerDb> {
  const externalUri = process.env.SALDO_TEST_PG_URI;
  if (externalUri) return startOnExternalPg(externalUri);

  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer(
    'postgres:16',
  ).start();
  const sql = postgres(container.getConnectionUri(), {
    prepare: false,
    onnotice: () => {},
  });
  // Simple protocol so the multi-statement script (incl. `$$ ... $$` bodies) runs as one batch.
  await sql.unsafe(upMigrationSql()).simple();

  // Give the migration-created app role a login secret, then open a connection as it. APP_ROLE and
  // APP_ROLE_PASSWORD are fixed constants (no untrusted input), so the inlined literal is safe.
  await sql.unsafe(`ALTER ROLE ${APP_ROLE} WITH PASSWORD '${APP_ROLE_PASSWORD}'`);
  const appSql = postgres({
    host: container.getHost(),
    port: container.getPort(),
    database: container.getDatabase(),
    username: APP_ROLE,
    password: APP_ROLE_PASSWORD,
    prepare: false,
    onnotice: () => {},
  });

  return {
    sql,
    appSql,
    appUri: `postgres://${APP_ROLE}:${APP_ROLE_PASSWORD}@${container.getHost()}:${container.getPort()}/${container.getDatabase()}`,
    stop: async () => {
      await appSql.end({ timeout: 5 });
      await sql.end({ timeout: 5 });
      await container.stop();
    },
  };
}

/**
 * Docker-less path (`SALDO_TEST_PG_URI`): run the suite against an EXISTING local Postgres by creating
 * a throwaway database per run, applying the migrations into it, and dropping it on stop. Intended for
 * a local/trusted PG (e.g. the one the environment setup script starts) — not SSL/remote. CI keeps the
 * Testcontainers path (ADR 0014). `adminUri` is any database on the cluster (used to CREATE/DROP).
 */
async function startOnExternalPg(adminUri: string): Promise<LedgerDb> {
  // max:1 so the session-level advisory lock is taken and released on the same connection.
  const admin = postgres(adminUri, { prepare: false, onnotice: () => {}, max: 1 });
  const dbName = `saldo_test_${crypto.randomUUID().replace(/-/g, '')}`;

  // Serialize setup across parallel test files sharing this cluster: the migration creates the
  // cluster-global `saldo_app` role, so concurrent CREATE ROLE would race. The lock lives on the
  // shared admin database, so it's mutually exclusive regardless of advisory-lock scoping.
  await admin`SELECT pg_advisory_lock(${LEDGER_SETUP_LOCK})`;
  try {
    await admin.unsafe(`CREATE DATABASE ${dbName}`);
    const url = new URL(adminUri);
    url.pathname = `/${dbName}`;
    const sql = postgres(url.toString(), { prepare: false, onnotice: () => {} });
    await sql.unsafe(upMigrationSql()).simple();
    await sql.unsafe(`ALTER ROLE ${APP_ROLE} WITH PASSWORD '${APP_ROLE_PASSWORD}'`);

    const appSql = postgres({
      host: url.hostname,
      port: Number(url.port) || 5432,
      database: dbName,
      username: APP_ROLE,
      password: APP_ROLE_PASSWORD,
      prepare: false,
      onnotice: () => {},
    });

    const appUrl = new URL(url.toString());
    appUrl.username = APP_ROLE;
    appUrl.password = APP_ROLE_PASSWORD;

    return {
      sql,
      appSql,
      appUri: appUrl.toString(),
      stop: async () => {
        await appSql.end({ timeout: 5 });
        await sql.end({ timeout: 5 });
        await admin.unsafe(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
        await admin.end({ timeout: 5 });
      },
    };
  } finally {
    await admin`SELECT pg_advisory_unlock(${LEDGER_SETUP_LOCK})`;
  }
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
