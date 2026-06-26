import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Sql } from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import {
  buildBalanse,
  buildHovedbok,
  buildResultat,
  bucketReskontro,
  debitBalance,
  øre,
} from '@saldo/domain';
import { type LedgerDb, ledgerDbAvailable, startLedgerDb } from './db-harness.js';
import * as schema from '../../app/db/schema.js';
import { withOrgTx } from '../../app/auth/middleware.js';
import {
  aggregateAccountBalances,
  listOpenReceivables,
  readAccountLedger,
} from '../../app/db/reporting.server.js';

// Needs a real Postgres (Docker/Testcontainers, or SALDO_TEST_PG_URI). Skips cleanly otherwise.

/**
 * The reporting aggregations (`feat-reporting`): per-account balances summed from the POSTED ledger,
 * read through the non-owner app role under FORCE-RLS exactly as the report routes do via `withUserOrg`.
 * Proves the two hard tie-outs — **resultat + balanse balance** (eiendeler = egenkapital og gjeld +
 * årsresultat) and **reskontro reconciles to the kundefordringer control account** (1500), with paid
 * invoices excluded and a credit note signed negative — plus the hovedbok running balance, and that RLS
 * keeps one tenant's ledger invisible.
 */
describe.skipIf(!ledgerDbAvailable)('Reporting ledger aggregation (app role + RLS)', () => {
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
    accounts: Record<string, string>;
    contactId: string;
    period2026: string;
  }

  async function seedOrg(sql: Sql): Promise<FullOrg> {
    orgSeq += 1;
    const orgNr = String(940000000 + orgSeq);
    const [org] = await sql<{ id: string }[]>`
      INSERT INTO organization (org_nr, name, mva_status)
      VALUES (${orgNr}, ${'Rapport ENK ' + String(orgSeq)}, 'registered_standard')
      RETURNING id`;
    const orgId = org!.id;

    const specs: ReadonlyArray<[string, string, string]> = [
      ['1500', 'Kundefordringer', 'asset'],
      ['1920', 'Bankinnskudd', 'asset'],
      ['2400', 'Leverandørgjeld', 'equity_liability'],
      ['2700', 'Utgående MVA', 'equity_liability'],
      ['2710', 'Inngående MVA', 'equity_liability'],
      ['3000', 'Salgsinntekt', 'revenue'],
      ['6000', 'Driftskostnad', 'expense'],
      ['8050', 'Renteinntekt', 'financial'],
      ['8980', 'Privatuttak', 'financial'],
    ];
    const accounts: Record<string, string> = {};
    for (const [number, name, type] of specs) {
      const [a] = await sql<{ id: string }[]>`
        INSERT INTO account (organization_id, number, name, type)
        VALUES (${orgId}, ${number}, ${name}, ${type}) RETURNING id`;
      accounts[number] = a!.id;
    }

    const [c] = await sql<{ id: string }[]>`
      INSERT INTO contact (organization_id, is_customer, name, mva_status)
      VALUES (${orgId}, true, ${'Acme AS'}, 'registered_standard') RETURNING id`;

    const [p] = await sql<{ id: string }[]>`
      INSERT INTO fiscal_period (organization_id, year, starts_on, ends_on)
      VALUES (${orgId}, 2026, '2026-01-01', '2026-12-31') RETURNING id`;

    return { orgId, accounts, contactId: c!.id, period2026: p!.id };
  }

  interface Leg {
    account: string;
    debit: number;
    credit: number;
  }

  async function postVoucher(sql: Sql, org: FullOrg, legs: readonly Leg[], post: boolean) {
    await sql.begin(async (tx) => {
      const [v] = await tx<{ id: string }[]>`
        INSERT INTO voucher (organization_id, type, period_id)
        VALUES (${org.orgId}, 'manual', ${org.period2026}) RETURNING id`;
      const voucherId = v!.id;
      for (const leg of legs) {
        await tx`
          INSERT INTO posting (organization_id, voucher_id, account_id, debit_ore, credit_ore)
          VALUES (${org.orgId}, ${voucherId}, ${org.accounts[leg.account]!}, ${leg.debit}, ${leg.credit})`;
      }
      if (post) await tx`UPDATE voucher SET posted_at = now() WHERE id = ${voucherId}`;
    });
  }

  async function insertInvoice(
    sql: Sql,
    org: FullOrg,
    inv: {
      kind: 'invoice' | 'credit_note';
      status: string;
      number: number;
      net: number;
      vat: number;
      gross: number;
      dueDate: string;
    },
  ) {
    await sql`
      INSERT INTO invoice (organization_id, kind, status, invoice_number, customer_id, customer_name,
                           issue_date, due_date, kid, net_ore, vat_ore, gross_ore, issued_at)
      VALUES (${org.orgId}, ${inv.kind}, ${inv.status}, ${inv.number}, ${org.contactId}, ${'Acme AS'},
              '2026-01-15', ${inv.dueDate}, ${'01' + String(inv.number).padStart(7, '0')},
              ${inv.net}, ${inv.vat}, ${inv.gross}, now())`;
  }

  /**
   * Seed a complete little year: two sales (one open, one paid+settled), a credit note, a purchase with
   * input VAT, and a finans item. Returns nothing — the ledger + invoice rows are the fixture.
   */
  async function seedYear(sql: Sql, org: FullOrg) {
    // Sale #1 — issued, still open: AR 12 500 / revenue 10 000 / output VAT 2 500.
    await postVoucher(
      sql,
      org,
      [
        { account: '1500', debit: 12_500, credit: 0 },
        { account: '3000', debit: 0, credit: 10_000 },
        { account: '2700', debit: 0, credit: 2_500 },
      ],
      true,
    );
    await insertInvoice(sql, org, {
      kind: 'invoice',
      status: 'issued',
      number: 1,
      net: 10_000,
      vat: 2_500,
      gross: 12_500,
      dueDate: '2026-02-15',
    });

    // Sale #2 — issued then paid: AR 6 250, settled by a bank receipt crediting AR.
    await postVoucher(
      sql,
      org,
      [
        { account: '1500', debit: 6_250, credit: 0 },
        { account: '3000', debit: 0, credit: 5_000 },
        { account: '2700', debit: 0, credit: 1_250 },
      ],
      true,
    );
    await postVoucher(
      sql,
      org,
      [
        { account: '1920', debit: 6_250, credit: 0 },
        { account: '1500', debit: 0, credit: 6_250 },
      ],
      true,
    );
    await insertInvoice(sql, org, {
      kind: 'invoice',
      status: 'paid',
      number: 2,
      net: 5_000,
      vat: 1_250,
      gross: 6_250,
      dueDate: '2026-02-15',
    });

    // Credit note — issued, open: reverses AR 1 250 (revenue 1 000 + output VAT 250).
    await postVoucher(
      sql,
      org,
      [
        { account: '3000', debit: 1_000, credit: 0 },
        { account: '2700', debit: 250, credit: 0 },
        { account: '1500', debit: 0, credit: 1_250 },
      ],
      true,
    );
    await insertInvoice(sql, org, {
      kind: 'credit_note',
      status: 'issued',
      number: 3,
      net: 1_000,
      vat: 250,
      gross: 1_250,
      dueDate: '2026-02-15',
    });

    // Purchase with input VAT: cost 4 000 + input VAT 1 000 / supplier 5 000.
    await postVoucher(
      sql,
      org,
      [
        { account: '6000', debit: 4_000, credit: 0 },
        { account: '2710', debit: 1_000, credit: 0 },
        { account: '2400', debit: 0, credit: 5_000 },
      ],
      true,
    );

    // Finans: bank interest 200.
    await postVoucher(
      sql,
      org,
      [
        { account: '1920', debit: 200, credit: 0 },
        { account: '8050', debit: 0, credit: 200 },
      ],
      true,
    );
  }

  it('resultat and balanse tie out to the posted ledger', async () => {
    const org = await seedOrg(db.sql);
    await seedYear(db.sql, org);

    const balances = await withOrgTx(appDb, org.orgId, (tx) => aggregateAccountBalances(tx, 2026));
    const resultat = buildResultat(balances);
    const balanse = buildBalanse(balances, resultat.aarsresultatØre);

    expect(resultat.driftsinntekterØre).toBe(øre(14_000)); // 10 000 + 5 000 − 1 000
    expect(resultat.driftskostnaderØre).toBe(øre(4_000));
    expect(resultat.driftsresultatØre).toBe(øre(10_000));
    expect(resultat.finansposterØre).toBe(øre(200));
    expect(resultat.aarsresultatØre).toBe(øre(10_200));

    expect(balanse.eiendelerØre).toBe(øre(17_700)); // AR 11 250 + bank 6 450
    expect(balanse.sumEgenkapitalGjeldØre).toBe(øre(17_700));
    expect(balanse.balanserer).toBe(true);
    expect(balanse.differanseØre).toBe(øre(0));
  });

  it('keeps a klasse-8 disposition posting (privatuttak) out of årsresultat, on the equity side', async () => {
    const org = await seedOrg(db.sql);
    await seedYear(db.sql, org);
    // Owner draw: privatuttak 8980 3 000 out of the bank — an equity movement, not a cost.
    await postVoucher(
      db.sql,
      org,
      [
        { account: '8980', debit: 3_000, credit: 0 },
        { account: '1920', debit: 0, credit: 3_000 },
      ],
      true,
    );

    const balances = await withOrgTx(appDb, org.orgId, (tx) => aggregateAccountBalances(tx, 2026));
    const resultat = buildResultat(balances);
    const balanse = buildBalanse(balances, resultat.aarsresultatØre);

    expect(resultat.aarsresultatØre).toBe(øre(10_200)); // unchanged — privatuttak is NOT in the result
    expect(balanse.egenkapitalGjeld.map((l) => l.number)).toContain('8980');
    expect(balanse.eiendelerØre).toBe(øre(14_700)); // bank down 3 000 (17 700 − 3 000)
    expect(balanse.balanserer).toBe(true);
  });

  it('reskontro reconciles to the AR control account (paid excluded, credit note signed)', async () => {
    const org = await seedOrg(db.sql);
    await seedYear(db.sql, org);

    const { balances, open } = await withOrgTx(appDb, org.orgId, async (tx) => ({
      balances: await aggregateAccountBalances(tx, 2026),
      open: await listOpenReceivables(tx),
    }));

    // Only the open invoice (+12 500) and the credit note (−1 250) — the paid invoice is excluded.
    expect(open).toHaveLength(2);
    const reskontro = bucketReskontro(open, '2026-06-26');
    expect(reskontro.totalØre).toBe(øre(11_250));

    // Tie-out: the per-contact reskontro total equals the kundefordringer (1500) control balance.
    const ar = balances.find((b) => b.number === '1500');
    expect(ar).toBeDefined();
    expect(debitBalance(ar!)).toBe(reskontro.totalØre);
    expect(reskontro.contacts).toHaveLength(1); // one customer (Acme AS)
    expect(reskontro.contacts[0]?.totalØre).toBe(øre(11_250));
  });

  it('hovedbok folds a running balance that closes at the account balance', async () => {
    const org = await seedOrg(db.sql);
    await seedYear(db.sql, org);

    const ledger = await withOrgTx(appDb, org.orgId, (tx) =>
      readAccountLedger(tx, org.accounts['1500']!, 2026),
    );
    expect(ledger).not.toBeNull();
    const hovedbok = buildHovedbok(øre(ledger!.openingØre), ledger!.entries);
    expect(hovedbok.openingØre).toBe(øre(0)); // no prior years
    expect(hovedbok.rows).toHaveLength(4); // two debits + two credits on 1500
    expect(hovedbok.closingØre).toBe(øre(11_250)); // ties to the balanse AR figure
  });

  it('excludes drafts and isolates tenants (RLS)', async () => {
    const a = await seedOrg(db.sql);
    const b = await seedOrg(db.sql);
    await seedYear(db.sql, b);
    // A draft on A must not count.
    await postVoucher(
      db.sql,
      a,
      [
        { account: '1500', debit: 99_999, credit: 0 },
        { account: '3000', debit: 0, credit: 99_999 },
      ],
      false,
    );

    const aBalances = await withOrgTx(appDb, a.orgId, (tx) => aggregateAccountBalances(tx, 2026));
    const aOpen = await withOrgTx(appDb, a.orgId, (tx) => listOpenReceivables(tx));
    expect(aBalances).toEqual([]); // A's only voucher is a draft; B's ledger is invisible
    expect(aOpen).toEqual([]);
  });
});
