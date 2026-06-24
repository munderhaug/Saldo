import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Sql } from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { type LedgerDb, ledgerDbAvailable, startLedgerDb } from './db-harness.js';
import * as schema from '../../app/db/schema.js';
import { withOrgTx } from '../../app/auth/middleware.js';
import { aggregateLedger } from '../../app/db/ledger.server.js';

// Needs a real Postgres (Docker/Testcontainers, or SALDO_TEST_PG_URI). Skips cleanly otherwise.

/**
 * The honest-number aggregation query (`feat-honest-number-surface`): summing one fiscal year's POSTED
 * ledger into revenue/expense/output-VAT/deductible-input totals, read through the non-owner app role
 * under FORCE-RLS — exactly as the home loader does via `withUserOrg`. Proves the partition by
 * kontoklasse + VAT direction is correct, that drafts and other years are excluded, and that RLS keeps
 * one tenant's ledger invisible to another.
 */
describe.skipIf(!ledgerDbAvailable)('honest-number ledger aggregation (app role + RLS)', () => {
  let db: LedgerDb;
  let appDb: ReturnType<typeof drizzle<typeof schema>>;

  beforeAll(async () => {
    db = await startLedgerDb();
    appDb = drizzle(db.appSql, { schema });
  });

  afterAll(async () => {
    await db.stop();
  });

  let orgSeq = 0;

  interface FullOrg {
    orgId: string;
    accounts: Record<string, string>; // account number → id
    vatOutputId: string;
    vatInputId: string;
    period2026: string;
    period2025: string;
  }

  /** Seed (via the owner connection) an org with the accounts, VAT codes and open periods we post into. */
  async function seedFullOrg(sql: Sql): Promise<FullOrg> {
    orgSeq += 1;
    const orgNr = String(920000000 + orgSeq);
    const [org] = await sql<{ id: string }[]>`
      INSERT INTO organization (org_nr, name, mva_status)
      VALUES (${orgNr}, ${'Aggreger ENK ' + String(orgSeq)}, 'registered_standard')
      RETURNING id`;
    const orgId = org!.id;

    // number → kontoklasse type, mirroring classifyAccountType (klasse 1/2/3/6).
    const specs: ReadonlyArray<[string, string, string]> = [
      ['1500', 'Kundefordringer', 'asset'],
      ['2400', 'Leverandørgjeld', 'equity_liability'],
      ['2700', 'Utgående MVA', 'equity_liability'],
      ['2710', 'Inngående MVA', 'equity_liability'],
      ['3000', 'Salgsinntekt', 'revenue'],
      ['6000', 'Driftskostnad', 'expense'],
    ];
    const accounts: Record<string, string> = {};
    for (const [number, name, type] of specs) {
      const [a] = await sql<{ id: string }[]>`
        INSERT INTO account (organization_id, number, name, type)
        VALUES (${orgId}, ${number}, ${name}, ${type}) RETURNING id`;
      accounts[number] = a!.id;
    }

    const [out] = await sql<{ id: string }[]>`
      INSERT INTO vat_code (organization_id, code, rate, direction)
      VALUES (${orgId}, '3', 0.25, 'output') RETURNING id`;
    const [inp] = await sql<{ id: string }[]>`
      INSERT INTO vat_code (organization_id, code, rate, direction)
      VALUES (${orgId}, '1', 0.25, 'input') RETURNING id`;

    const [p26] = await sql<{ id: string }[]>`
      INSERT INTO fiscal_period (organization_id, year, starts_on, ends_on)
      VALUES (${orgId}, 2026, '2026-01-01', '2026-12-31') RETURNING id`;
    const [p25] = await sql<{ id: string }[]>`
      INSERT INTO fiscal_period (organization_id, year, starts_on, ends_on)
      VALUES (${orgId}, 2025, '2025-01-01', '2025-12-31') RETURNING id`;

    return {
      orgId,
      accounts,
      vatOutputId: out!.id,
      vatInputId: inp!.id,
      period2026: p26!.id,
      period2025: p25!.id,
    };
  }

  interface Leg {
    account: string;
    debit: number;
    credit: number;
    vatCodeId?: string;
  }

  /** Insert a balanced voucher with its postings; set posted_at when `post` is true. */
  async function postVoucher(
    sql: Sql,
    org: FullOrg,
    periodId: string,
    legs: readonly Leg[],
    post: boolean,
  ): Promise<void> {
    await sql.begin(async (tx) => {
      const [v] = await tx<{ id: string }[]>`
        INSERT INTO voucher (organization_id, type, period_id)
        VALUES (${org.orgId}, 'manual', ${periodId}) RETURNING id`;
      const voucherId = v!.id;
      for (const leg of legs) {
        const accountId = org.accounts[leg.account]!;
        await tx`
          INSERT INTO posting (organization_id, voucher_id, account_id, vat_code_id, debit_ore, credit_ore)
          VALUES (${org.orgId}, ${voucherId}, ${accountId},
                  ${leg.vatCodeId ?? null}, ${leg.debit}, ${leg.credit})`;
      }
      if (post) {
        await tx`UPDATE voucher SET posted_at = now() WHERE id = ${voucherId}`;
      }
    });
  }

  /** A posted sale: receivable (gross) / revenue (net) / output VAT. */
  async function postSale(sql: Sql, org: FullOrg, periodId: string, net: number, vat: number) {
    await postVoucher(
      sql,
      org,
      periodId,
      [
        { account: '1500', debit: net + vat, credit: 0 },
        { account: '3000', debit: 0, credit: net, vatCodeId: org.vatOutputId },
        { account: '2700', debit: 0, credit: vat, vatCodeId: org.vatOutputId },
      ],
      true,
    );
  }

  /** A posted purchase: expense (net) + input VAT (deductible) / payable (gross). */
  async function postPurchase(sql: Sql, org: FullOrg, net: number, vat: number) {
    await postVoucher(
      sql,
      org,
      org.period2026,
      [
        { account: '6000', debit: net, credit: 0, vatCodeId: org.vatInputId },
        { account: '2710', debit: vat, credit: 0, vatCodeId: org.vatInputId },
        { account: '2400', debit: 0, credit: net + vat },
      ],
      true,
    );
  }

  it('partitions posted activity into revenue / expense / output-VAT / deductible-input', async () => {
    const org = await seedFullOrg(db.sql);
    await postSale(db.sql, org, org.period2026, 100_000, 25_000);
    await postPurchase(db.sql, org, 40_000, 10_000);

    const totals = await withOrgTx(appDb, org.orgId, (tx) => aggregateLedger(tx, 2026));
    expect(totals).toEqual({
      revenueNet: 100_000,
      expenseNet: 40_000,
      // The revenue line ALSO carries the output SAF-T code; only the liability VAT leg must count.
      outputVatCollected: 25_000,
      deductibleInputVat: 10_000,
    });
  });

  it('excludes draft (unposted) vouchers', async () => {
    const org = await seedFullOrg(db.sql);
    await postSale(db.sql, org, org.period2026, 100_000, 25_000);
    // A balanced but UNposted sale must not move the totals.
    await postVoucher(
      db.sql,
      org,
      org.period2026,
      [
        { account: '1500', debit: 50_000, credit: 0 },
        { account: '3000', debit: 0, credit: 50_000, vatCodeId: org.vatOutputId },
      ],
      false,
    );

    const totals = await withOrgTx(appDb, org.orgId, (tx) => aggregateLedger(tx, 2026));
    expect(totals.revenueNet).toBe(100_000);
  });

  it('scopes to the requested fiscal year', async () => {
    const org = await seedFullOrg(db.sql);
    await postSale(db.sql, org, org.period2026, 100_000, 25_000);
    await postSale(db.sql, org, org.period2025, 70_000, 17_500); // prior year

    const y2026 = await withOrgTx(appDb, org.orgId, (tx) => aggregateLedger(tx, 2026));
    const y2025 = await withOrgTx(appDb, org.orgId, (tx) => aggregateLedger(tx, 2025));
    expect(y2026.revenueNet).toBe(100_000);
    expect(y2025.revenueNet).toBe(70_000);
  });

  it('returns all zeros for a year with no posted activity', async () => {
    const org = await seedFullOrg(db.sql);
    const totals = await withOrgTx(appDb, org.orgId, (tx) => aggregateLedger(tx, 2026));
    expect(totals).toEqual({
      revenueNet: 0,
      expenseNet: 0,
      outputVatCollected: 0,
      deductibleInputVat: 0,
    });
  });

  it("never counts another tenant's ledger (RLS isolation)", async () => {
    const a = await seedFullOrg(db.sql);
    const b = await seedFullOrg(db.sql);
    await postSale(db.sql, a, a.period2026, 100_000, 25_000);
    await postSale(db.sql, b, b.period2026, 999_999, 250_000); // B's much larger ledger

    // Scoped to A, B's postings are invisible — A's revenue is unchanged by B's activity.
    const totals = await withOrgTx(appDb, a.orgId, (tx) => aggregateLedger(tx, 2026));
    expect(totals.revenueNet).toBe(100_000);
  });
});
