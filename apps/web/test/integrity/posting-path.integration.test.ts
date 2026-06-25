import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import { type LedgerDb, ledgerDbAvailable, startLedgerDb } from './db-harness.js';
import * as schema from '../../app/db/schema.js';
import { withOrgTx } from '../../app/auth/middleware.js';
import { honestNumberFromLedger, subØre } from '@saldo/domain';
import {
  recordManualVoucher,
  recordReverseChargePurchase,
  POSTING_ACCOUNTS,
} from '../../app/db/posting.server.js';
import { aggregateLedger } from '../../app/db/ledger.server.js';
import { STANDARD_ACCOUNTS, STANDARD_VAT_CODES } from '../../app/db/provisioning.server.js';

// Needs a real Postgres (Docker/Testcontainers, or SALDO_TEST_PG_URI). Skips cleanly otherwise.

/**
 * The manual-voucher posting path (`feat-manual-voucher-entry`, ADR 0034): `recordManualVoucher` run
 * exactly as the app runs it — through the non-owner `saldo_app` role under FORCE-RLS, inside
 * `withOrgTx`. It proves the path emits ledger entries the SQL integrity layer ACCEPTS (balanced,
 * ≥2-leg, posted, with `posted_at` set), that the deferred triggers still BLOCK the bad cases the
 * path must never produce, that a locked period stops a post, and that one tenant's postings are
 * invisible to another. The org is provisioned with the WHOLE committed kontoplan + codes, as the
 * real onboarding does, so the path resolves its designated accounts/codes against real rows.
 */
describe.skipIf(!ledgerDbAvailable)('manual-voucher posting path (app role + RLS)', () => {
  let db: LedgerDb;
  let appDb: ReturnType<typeof drizzle<typeof schema>>;
  let ownerDb: ReturnType<typeof drizzle<typeof schema>>;

  beforeAll(async () => {
    db = await startLedgerDb();
    appDb = drizzle(db.appSql, { schema });
    ownerDb = drizzle(db.sql, { schema });
  });

  afterAll(async () => {
    await db.stop();
  });

  let orgSeq = 0;

  /** Seed (via the owner connection, which bypasses RLS) a fully-provisioned org of the given status. */
  async function provisionOrg(mvaStatus: string): Promise<string> {
    orgSeq += 1;
    const orgNr = String(930000000 + orgSeq);
    const [org] = await db.sql<{ id: string }[]>`
      INSERT INTO organization (org_nr, name, mva_status)
      VALUES (${orgNr}, ${'Bilag ENK ' + String(orgSeq)}, ${mvaStatus})
      RETURNING id`;
    const orgId = org!.id;
    await ownerDb
      .insert(schema.account)
      .values(STANDARD_ACCOUNTS.map((a) => ({ organizationId: orgId, ...a })));
    await ownerDb
      .insert(schema.vatCode)
      .values(STANDARD_VAT_CODES.map((c) => ({ organizationId: orgId, ...c })));
    return orgId;
  }

  /** The postings of a voucher, as raw øre legs (owner read; RLS-free for assertions). */
  async function legsOf(voucherId: string) {
    return db.sql<{ number: string; debit: number; credit: number; coded: boolean }[]>`
      SELECT a.number, p.debit_ore::int AS debit, p.credit_ore::int AS credit,
             (p.vat_code_id IS NOT NULL) AS coded
        FROM posting p JOIN account a ON a.id = p.account_id
       WHERE p.voucher_id = ${voucherId}
       ORDER BY a.number`;
  }

  it('posts a registered sale as a balanced, posted 3-leg voucher and aggregates it', async () => {
    const orgId = await provisionOrg('registered_standard');
    const result = await withOrgTx(appDb, orgId, (tx) =>
      recordManualVoucher(tx, { organizationId: orgId, kind: 'income', net: 100_000, year: 2026 }),
    );
    expect(result.ok).toBe(true);
    const voucherId = result.ok ? result.voucherId : '';

    const [v] = await db.sql<{ type: string; posted: string | null }[]>`
      SELECT type, posted_at AS posted FROM voucher WHERE id = ${voucherId}`;
    expect(v?.type).toBe('sales');
    expect(v?.posted).not.toBeNull();

    // Ordered by account number: 1500 receivable (gross 125000 dr) / 2700 output VAT (25000 cr) /
    // 3000 revenue (net 100000 cr).
    const legs = await legsOf(voucherId);
    expect(legs).toEqual([
      { number: POSTING_ACCOUNTS.income.receivable, debit: 125_000, credit: 0, coded: false },
      { number: POSTING_ACCOUNTS.income.outputVat, debit: 0, credit: 25_000, coded: true },
      { number: POSTING_ACCOUNTS.income.revenue, debit: 0, credit: 100_000, coded: true },
    ]);

    const totals = await withOrgTx(appDb, orgId, (tx) => aggregateLedger(tx, 2026));
    expect(totals).toEqual({
      revenueNet: 100_000,
      expenseNet: 0,
      outputVatCollected: 25_000,
      deductibleInputVat: 0,
    });
  });

  it('posts a registered purchase with deductible input VAT', async () => {
    const orgId = await provisionOrg('registered_standard');
    const result = await withOrgTx(appDb, orgId, (tx) =>
      recordManualVoucher(tx, { organizationId: orgId, kind: 'expense', net: 40_000, year: 2026 }),
    );
    expect(result.ok).toBe(true);

    const totals = await withOrgTx(appDb, orgId, (tx) => aggregateLedger(tx, 2026));
    expect(totals).toEqual({
      revenueNet: 0,
      expenseNet: 40_000,
      outputVatCollected: 0,
      deductibleInputVat: 10_000,
    });
  });

  it('books gross to cost (no VAT) for an unregistered org', async () => {
    const orgId = await provisionOrg('under_threshold');
    const result = await withOrgTx(appDb, orgId, (tx) =>
      recordManualVoucher(tx, { organizationId: orgId, kind: 'income', net: 50_000, year: 2026 }),
    );
    expect(result.ok).toBe(true);
    const voucherId = result.ok ? result.voucherId : '';

    // No output-VAT leg: receivable (50000 dr) / revenue (50000 cr), both at net.
    const legs = await legsOf(voucherId);
    expect(legs).toHaveLength(2);
    expect(legs.every((l) => !l.coded)).toBe(true);

    const totals = await withOrgTx(appDb, orgId, (tx) => aggregateLedger(tx, 2026));
    expect(totals.revenueNet).toBe(50_000);
    expect(totals.outputVatCollected).toBe(0);
  });

  it('posts a deductible reverse-charge purchase as a BALANCED dual-leg voucher; both legs on the MVA basis', async () => {
    // SAF-T '86' (services bought from abroad, deductible): the buyer self-accounts VAT — output 2704
    // + input 2714 (snudd avregning). Net cash is just the net, but BOTH VAT legs must appear so the
    // MVA-melding is complete (`.claude/rules/vat.md`).
    const orgId = await provisionOrg('registered_standard');
    const result = await withOrgTx(appDb, orgId, (tx) =>
      recordReverseChargePurchase(tx, {
        organizationId: orgId,
        vatCode: '86',
        net: 100_000,
        year: 2026,
      }),
    );
    expect(result.ok).toBe(true);
    const voucherId = result.ok ? result.voucherId : '';

    const [v] = await db.sql<{ type: string; posted: string | null }[]>`
      SELECT type, posted_at AS posted FROM voucher WHERE id = ${voucherId}`;
    expect(v?.type).toBe('purchase');
    expect(v?.posted).not.toBeNull();

    // Ordered by account number: 2400 payable (net 100000 cr) / 2704 output VAT (25000 cr, coded) /
    // 2714 input VAT (25000 dr, coded) / 7798 cost (net 100000 dr, coded). Balanced, net cash = net.
    const legs = await legsOf(voucherId);
    expect(legs).toEqual([
      { number: POSTING_ACCOUNTS.expense.payable, debit: 0, credit: 100_000, coded: false },
      { number: '2704', debit: 0, credit: 25_000, coded: true },
      { number: '2714', debit: 25_000, credit: 0, coded: true },
      { number: POSTING_ACCOUNTS.expense.cost, debit: 100_000, credit: 0, coded: true },
    ]);
    expect(legs.reduce((s, l) => s + l.debit, 0)).toBe(legs.reduce((s, l) => s + l.credit, 0));

    // Both legs land on the MVA basis: output VAT collected AND deductible input VAT, netting to 0.
    const totals = await withOrgTx(appDb, orgId, (tx) => aggregateLedger(tx, 2026));
    expect(totals).toEqual({
      revenueNet: 0,
      expenseNet: 100_000,
      outputVatCollected: 25_000, // self-accounted output leg (2704, code 3)
      deductibleInputVat: 25_000, // deduction leg (2714, code 86) — net VAT effect is 0
    });
  });

  it('posts a NON-deductible reverse-charge purchase: VAT joins cost, output leg still on the basis', async () => {
    // SAF-T '87' (services bought from abroad, uten fradragsrett): the self-accounted VAT is
    // irrecoverable, so it joins the cost (gross to 7798) — but the output leg is still owed and posted.
    const orgId = await provisionOrg('registered_standard');
    const result = await withOrgTx(appDb, orgId, (tx) =>
      recordReverseChargePurchase(tx, {
        organizationId: orgId,
        vatCode: '87',
        net: 100_000,
        year: 2026,
      }),
    );
    expect(result.ok).toBe(true);
    const voucherId = result.ok ? result.voucherId : '';

    // 2400 payable (100000 cr) / 2704 output VAT (25000 cr) / 7798 cost incl. VAT (125000 dr). No 2714.
    const legs = await legsOf(voucherId);
    expect(legs).toEqual([
      { number: POSTING_ACCOUNTS.expense.payable, debit: 0, credit: 100_000, coded: false },
      { number: '2704', debit: 0, credit: 25_000, coded: true },
      { number: POSTING_ACCOUNTS.expense.cost, debit: 125_000, credit: 0, coded: true },
    ]);
    expect(legs.some((l) => l.number === '2714')).toBe(false); // no deduction

    const totals = await withOrgTx(appDb, orgId, (tx) => aggregateLedger(tx, 2026));
    expect(totals.outputVatCollected).toBe(25_000); // owed to the state
    expect(totals.deductibleInputVat).toBe(0); // no deduction — the VAT is a real cost
    expect(totals.expenseNet).toBe(125_000); // the irrecoverable VAT is part of the cost
  });

  it('refuses a domestic reverse-charge SALE code (51) on the purchase path', async () => {
    // 51 is the seller side (direction 'output') — it posts as an ordinary net sale via the invoice
    // path, never through the buyer self-account dual leg.
    const orgId = await provisionOrg('registered_standard');
    const result = await withOrgTx(appDb, orgId, (tx) =>
      recordReverseChargePurchase(tx, {
        organizationId: orgId,
        vatCode: '51',
        net: 100_000,
        year: 2026,
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('not-reverse-charge');
  });

  it('refuses to post into a locked period (period-lock trigger)', async () => {
    const orgId = await provisionOrg('registered_standard');
    // Pre-create the 2026 period LOCKED; the path will find (not create) it and the trigger blocks.
    await db.sql`
      INSERT INTO fiscal_period (organization_id, year, starts_on, ends_on, locked_at)
      VALUES (${orgId}, 2026, '2026-01-01', '2026-12-31', now())`;

    // The post goes through Drizzle, which wraps the trigger's "Period … is locked" on `.cause`; assert
    // the post rejects AND that the lock left nothing behind (no voucher persisted for the tenant).
    await expect(
      withOrgTx(appDb, orgId, (tx) =>
        recordManualVoucher(tx, {
          organizationId: orgId,
          kind: 'income',
          net: 100_000,
          year: 2026,
        }),
      ),
    ).rejects.toThrow();
    const counted = await db.sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM voucher WHERE organization_id = ${orgId}`;
    expect(counted[0]?.count).toBe(0);
  });

  it("never counts another tenant's postings (RLS isolation via saldo_app)", async () => {
    const a = await provisionOrg('registered_standard');
    const b = await provisionOrg('registered_standard');
    await withOrgTx(appDb, a, (tx) =>
      recordManualVoucher(tx, { organizationId: a, kind: 'income', net: 100_000, year: 2026 }),
    );
    await withOrgTx(appDb, b, (tx) =>
      recordManualVoucher(tx, { organizationId: b, kind: 'income', net: 999_999, year: 2026 }),
    );

    const totals = await withOrgTx(appDb, a, (tx) => aggregateLedger(tx, 2026));
    expect(totals.revenueNet).toBe(100_000); // unaffected by B's larger ledger
  });

  it('a posted sale + purchase make the honest-number reveal show real figures (end-to-end)', async () => {
    const orgId = await provisionOrg('registered_standard');
    // Realistic year scale (500k kr sale, 100k kr purchase) so the income-tax estimate is non-zero.
    await withOrgTx(appDb, orgId, (tx) =>
      recordManualVoucher(tx, {
        organizationId: orgId,
        kind: 'income',
        net: 50_000_000,
        year: 2026,
      }),
    );
    await withOrgTx(appDb, orgId, (tx) =>
      recordManualVoucher(tx, {
        organizationId: orgId,
        kind: 'expense',
        net: 10_000_000,
        year: 2026,
      }),
    );

    // Exactly the chain home.tsx runs: aggregateLedger (RLS) → honestNumberFromLedger (pure).
    const totals = await withOrgTx(appDb, orgId, (tx) => aggregateLedger(tx, 2026));
    const reveal = honestNumberFromLedger(totals, 2026, 'registered_standard');

    expect(reveal.income).toBe(62_500_000); // gross taken in = revenueNet 50M + output VAT 12.5M
    expect(reveal.vatHeld).toBe(10_000_000); // output 12.5M − deductible input 2.5M
    expect(reveal.profit).toBe(40_000_000); // revenueNet 50M − expenseNet 10M
    expect(reveal.estimatedTax).toBeGreaterThan(0);
    // Spendable is what's left after VAT held + tax set aside — and it's real, not the zero state.
    expect(reveal.spendable).toBe(
      subØre(subØre(reveal.income, reveal.vatHeld), reveal.estimatedTax),
    );
    expect(reveal.spendable).toBeGreaterThan(0);
  });

  it('the balance trigger rejects a hand-built unbalanced posted voucher', async () => {
    const orgId = await provisionOrg('registered_standard');
    const [period] = await db.sql<{ id: string }[]>`
      INSERT INTO fiscal_period (organization_id, year, starts_on, ends_on)
      VALUES (${orgId}, 2026, '2026-01-01', '2026-12-31') RETURNING id`;
    const accId = async (number: string) =>
      (
        await db.sql<
          { id: string }[]
        >`SELECT id FROM account WHERE organization_id = ${orgId} AND number = ${number}`
      )[0]!.id;

    await expect(
      db.sql.begin(async (tx) => {
        const [v] = await tx<{ id: string }[]>`
          INSERT INTO voucher (organization_id, type, period_id, posted_at)
          VALUES (${orgId}, 'sales', ${period!.id}, now()) RETURNING id`;
        // 100000 dr vs 90000 cr — unbalanced; the deferred trigger must reject at COMMIT.
        await tx`INSERT INTO posting (organization_id, voucher_id, account_id, debit_ore, credit_ore)
                 VALUES (${orgId}, ${v!.id}, ${await accId('1500')}, 100000, 0)`;
        await tx`INSERT INTO posting (organization_id, voucher_id, account_id, debit_ore, credit_ore)
                 VALUES (${orgId}, ${v!.id}, ${await accId('3000')}, 0, 90000)`;
      }),
    ).rejects.toThrow(/unbalanced/i);
  });

  it('posted-completeness rejects a single-leg posted voucher', async () => {
    const orgId = await provisionOrg('registered_standard');
    const [period] = await db.sql<{ id: string }[]>`
      INSERT INTO fiscal_period (organization_id, year, starts_on, ends_on)
      VALUES (${orgId}, 2026, '2026-01-01', '2026-12-31') RETURNING id`;
    const [acc] = await db.sql<{ id: string }[]>`
      SELECT id FROM account WHERE organization_id = ${orgId} AND number = '1500'`;

    await expect(
      db.sql.begin(async (tx) => {
        const [v] = await tx<{ id: string }[]>`
          INSERT INTO voucher (organization_id, type, period_id, posted_at)
          VALUES (${orgId}, 'sales', ${period!.id}, now()) RETURNING id`;
        // One lone (valid) leg: a posted voucher must have ≥ 2 postings — the completeness trigger
        // rejects this at COMMIT (it fails the count check before the balance check).
        await tx`INSERT INTO posting (organization_id, voucher_id, account_id, debit_ore, credit_ore)
                 VALUES (${orgId}, ${v!.id}, ${acc!.id}, 100000, 0)`;
      }),
    ).rejects.toThrow(/at least 2 postings/i);
  });
});
