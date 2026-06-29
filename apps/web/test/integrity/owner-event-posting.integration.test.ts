import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import { type LedgerDb, ledgerDbAvailable, startLedgerDb } from './db-harness.js';
import * as schema from '../../app/db/schema.js';
import { withOrgTx } from '../../app/auth/middleware.js';
import { OWNER_ACCOUNTS, recordOwnerEvent } from '../../app/db/posting.server.js';
import { STANDARD_ACCOUNTS, STANDARD_VAT_CODES } from '../../app/db/provisioning.server.js';
import type { OwnerEventKind } from '../../app/contracts/owner-event.js';

// Needs a real Postgres (Docker/Testcontainers, or SALDO_TEST_PG_URI). Skips cleanly otherwise.

/**
 * Owner-economy events → ledger posting (feat-supplier-invoices, ADR 0054). Drives the REAL
 * `recordOwnerEvent` helper through the non-owner `saldo_app` role under FORCE-RLS, exactly as the
 * action runs it, against a fully-provisioned org. It proves each sole-proprietor equity event posts a
 * BALANCED, POSTED voucher: a drawing (privatuttak) debits 2060 / credits the bank; an outlay (utlegg)
 * applies the standard input-VAT fork against owner equity; and mileage / diett post a VAT-free
 * cost-vs-equity deduction (NOT payroll).
 */
describe.skipIf(!ledgerDbAvailable)('owner events → ledger posting (app role + RLS)', () => {
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

  async function provisionOrg(mvaStatus: string): Promise<string> {
    orgSeq += 1;
    const orgNr = String(970000000 + orgSeq);
    const [org] = await db.sql<{ id: string }[]>`
      INSERT INTO organization (org_nr, name, mva_status)
      VALUES (${orgNr}, ${'Privat ENK ' + String(orgSeq)}, ${mvaStatus})
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

  async function post(orgId: string, kind: OwnerEventKind, net: number) {
    return withOrgTx(appDb, orgId, (tx) =>
      recordOwnerEvent(tx, { organizationId: orgId, kind, net, year: 2026 }),
    );
  }

  async function legsOf(voucherId: string) {
    return db.sql<{ number: string; debit: number; credit: number; coded: boolean }[]>`
      SELECT a.number, p.debit_ore::int AS debit, p.credit_ore::int AS credit,
             (p.vat_code_id IS NOT NULL) AS coded
        FROM posting p JOIN account a ON a.id = p.account_id
       WHERE p.voucher_id = ${voucherId}
       ORDER BY a.number`;
  }

  it('a drawing (privatuttak) debits drawings, credits the bank — balanced, no VAT', async () => {
    const orgId = await provisionOrg('registered_standard');
    const r = await post(orgId, 'drawing', 500_000);
    expect(r.ok).toBe(true);
    const legs = await legsOf(r.ok ? r.voucherId : '');
    expect(legs).toHaveLength(2);
    expect(legs.find((l) => l.number === OWNER_ACCOUNTS.drawings)?.debit).toBe(500_000);
    expect(legs.find((l) => l.number === OWNER_ACCOUNTS.bank)?.credit).toBe(500_000);
    expect(legs.some((l) => l.coded)).toBe(false);
  });

  it('an outlay (utlegg), registered: standard input-VAT split against owner equity', async () => {
    const orgId = await provisionOrg('registered_standard');
    const r = await post(orgId, 'outlay', 100_000);
    expect(r.ok).toBe(true);
    const legs = await legsOf(r.ok ? r.voucherId : '');
    // 2062 equity 125 000 cr / 2710 input VAT 25 000 dr / 7798 cost 100 000 dr.
    expect(legs.find((l) => l.number === OWNER_ACCOUNTS.cost.outlay)?.debit).toBe(100_000);
    expect(legs.find((l) => l.number === OWNER_ACCOUNTS.inputVat)?.debit).toBe(25_000);
    expect(legs.find((l) => l.number === OWNER_ACCOUNTS.equity)?.credit).toBe(125_000);
    expect(legs.reduce((s, l) => s + l.debit, 0)).toBe(legs.reduce((s, l) => s + l.credit, 0));
  });

  it('an outlay, unregistered: books the gross to cost — no deduction', async () => {
    const orgId = await provisionOrg('under_threshold');
    const r = await post(orgId, 'outlay', 100_000);
    expect(r.ok).toBe(true);
    const legs = await legsOf(r.ok ? r.voucherId : '');
    expect(legs).toHaveLength(2);
    expect(legs.some((l) => l.number === OWNER_ACCOUNTS.inputVat)).toBe(false);
    expect(legs.find((l) => l.number === OWNER_ACCOUNTS.cost.outlay)?.debit).toBe(100_000);
    expect(legs.find((l) => l.number === OWNER_ACCOUNTS.equity)?.credit).toBe(100_000);
  });

  it.each([
    ['mileage', OWNER_ACCOUNTS.cost.mileage],
    ['diett', OWNER_ACCOUNTS.cost.diett],
  ] as const)('%s: a VAT-free cost-vs-equity deduction (not payroll)', async (kind, costNo) => {
    const orgId = await provisionOrg('registered_standard');
    const r = await post(orgId, kind, 42_000);
    expect(r.ok).toBe(true);
    const legs = await legsOf(r.ok ? r.voucherId : '');
    expect(legs).toHaveLength(2);
    expect(legs.some((l) => l.coded)).toBe(false); // no VAT
    expect(legs.find((l) => l.number === costNo)?.debit).toBe(42_000);
    expect(legs.find((l) => l.number === OWNER_ACCOUNTS.equity)?.credit).toBe(42_000);
  });
});
