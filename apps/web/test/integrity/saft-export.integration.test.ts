import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Sql } from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { readFileSync } from 'node:fs';
import { validateXML } from 'xmllint-wasm';
import {
  buildSaftXml,
  generateSaftFinancial,
  indexAccounts,
  indexTaxCodes,
  parseStandardAccounts,
  parseStandardTaxCodes,
  saftBalances,
  saftClosingBalanceNet,
} from '@saldo/domain';
import { type LedgerDb, ledgerDbAvailable, startLedgerDb } from './db-harness.js';
import * as schema from '../../app/db/schema.js';
import { withOrgTx } from '../../app/auth/middleware.js';
import { readSaftFinancial } from '../../app/db/saft.server.js';

// Needs a real Postgres (Docker/Testcontainers, or SALDO_TEST_PG_URI). Skips cleanly otherwise.

const refRoot = new URL('../../../../db/reference/saf-t/', import.meta.url);
const accountIndex = indexAccounts(
  parseStandardAccounts(
    readFileSync(
      new URL('accounts/General_Ledger_Standard_Accounts_4_character.csv', refRoot),
      'utf8',
    ),
  ),
);
const codeIndex = indexTaxCodes(
  parseStandardTaxCodes(readFileSync(new URL('tax-codes/Standard_Tax_Codes.csv', refRoot), 'utf8')),
);
const xsd = readFileSync(
  new URL('schema/Norwegian_SAF-T_Financial_Schema_v_1.10.xsd', refRoot),
  'utf8',
);

const META = (orgNr: string, name: string) => ({ orgNr: orgNr as never, name, year: 2026 });
const SYSTEM = {
  softwareCompanyName: 'Saldo',
  softwareId: 'Saldo',
  softwareVersion: '0.0.0',
  dateCreated: '2026-06-26',
};

/**
 * The SAF-T Financial export aggregation (`feat-saft-export`): reading one fiscal year's POSTED ledger
 * + the parties register through the non-owner app role under FORCE-RLS — exactly as the export route
 * does via `withUserOrg`. Proves the export TIES OUT to the ledger (TotalDebit = TotalCredit, account
 * closing balances net to zero), that opening balances carry prior-year movement, that the real
 * query→domain→XML pipeline is XSD-valid, that drafts are excluded, and that RLS keeps one tenant's
 * ledger and parties invisible to another.
 */
describe.skipIf(!ledgerDbAvailable)('SAF-T Financial export aggregation (app role + RLS)', () => {
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
    orgNr: string;
    name: string;
    accounts: Record<string, string>;
    vat: Record<string, string>;
    period2025: string;
    period2026: string;
  }

  async function seedOrg(sql: Sql): Promise<FullOrg> {
    orgSeq += 1;
    const orgNr = String(940000000 + orgSeq);
    const name = `SAF-T ENK ${String(orgSeq)}`;
    const [org] = await sql<{ id: string }[]>`
      INSERT INTO organization (org_nr, name, mva_status)
      VALUES (${orgNr}, ${name}, 'registered_standard') RETURNING id`;
    const orgId = org!.id;

    const specs: ReadonlyArray<[string, string, string]> = [
      ['1500', 'Kundefordringer', 'asset'],
      ['1920', 'Bankinnskudd', 'asset'],
      ['2050', 'Egenkapital', 'equity_liability'],
      ['2400', 'Leverandørgjeld', 'equity_liability'],
      ['2700', 'Utgående merverdiavgift', 'equity_liability'],
      ['2710', 'Inngående merverdiavgift', 'equity_liability'],
      ['3000', 'Salgsinntekt', 'revenue'],
      ['6000', 'Driftskostnad', 'expense'],
    ];
    const accounts: Record<string, string> = {};
    for (const [number, name_, type] of specs) {
      const [a] = await sql<{ id: string }[]>`
        INSERT INTO account (organization_id, number, name, type)
        VALUES (${orgId}, ${number}, ${name_}, ${type}) RETURNING id`;
      accounts[number] = a!.id;
    }

    const vatSpecs: ReadonlyArray<[string, number, string]> = [
      ['3', 0.25, 'output'],
      ['1', 0.25, 'input'],
    ];
    const vat: Record<string, string> = {};
    for (const [code, rate, direction] of vatSpecs) {
      const [c] = await sql<{ id: string }[]>`
        INSERT INTO vat_code (organization_id, code, rate, direction)
        VALUES (${orgId}, ${code}, ${rate}, ${direction}) RETURNING id`;
      vat[code] = c!.id;
    }

    const [p25] = await sql<{ id: string }[]>`
      INSERT INTO fiscal_period (organization_id, year, starts_on, ends_on)
      VALUES (${orgId}, 2025, '2025-01-01', '2025-12-31') RETURNING id`;
    const [p26] = await sql<{ id: string }[]>`
      INSERT INTO fiscal_period (organization_id, year, starts_on, ends_on)
      VALUES (${orgId}, 2026, '2026-01-01', '2026-12-31') RETURNING id`;

    return { orgId, orgNr, name, accounts, vat, period2025: p25!.id, period2026: p26!.id };
  }

  async function addContact(
    sql: Sql,
    org: FullOrg,
    name: string,
    role: 'customer' | 'supplier',
  ): Promise<string> {
    const [c] = await sql<{ id: string }[]>`
      INSERT INTO contact (organization_id, name, mva_status, is_customer, is_supplier, org_nr, city)
      VALUES (${org.orgId}, ${name}, 'registered_standard',
              ${role === 'customer'}, ${role === 'supplier'}, ${'974760673'}, ${'Oslo'})
      RETURNING id`;
    return c!.id;
  }

  interface Leg {
    account: string;
    debit: number;
    credit: number;
    vatCode?: string;
  }

  async function postVoucher(
    sql: Sql,
    org: FullOrg,
    periodId: string,
    type: string,
    legs: readonly Leg[],
    post: boolean,
  ) {
    await sql.begin(async (tx) => {
      const [v] = await tx<{ id: string }[]>`
        INSERT INTO voucher (organization_id, type, period_id)
        VALUES (${org.orgId}, ${type}, ${periodId}) RETURNING id`;
      const voucherId = v!.id;
      for (const leg of legs) {
        await tx`
          INSERT INTO posting (organization_id, voucher_id, account_id, vat_code_id, debit_ore, credit_ore)
          VALUES (${org.orgId}, ${voucherId}, ${org.accounts[leg.account]!},
                  ${leg.vatCode ? org.vat[leg.vatCode]! : null}, ${leg.debit}, ${leg.credit})`;
      }
      if (post) await tx`UPDATE voucher SET posted_at = now() WHERE id = ${voucherId}`;
    });
  }

  /** A realistic year: prior-year opening capital, then a sale, a purchase and a bank settlement. */
  async function seedFullYear(org: FullOrg) {
    // 2025: owner deposits 50 000 capital (sets the 2026 opening balance on bank + equity).
    await postVoucher(
      db.sql,
      org,
      org.period2025,
      'manual',
      [
        { account: '1920', debit: 50_000_00, credit: 0 },
        { account: '2050', debit: 0, credit: 50_000_00 },
      ],
      true,
    );
    // 2026 sale: 100 000 net + 25 000 output VAT.
    await postVoucher(
      db.sql,
      org,
      org.period2026,
      'sales',
      [
        { account: '1500', debit: 125_000_00, credit: 0 },
        { account: '3000', debit: 0, credit: 100_000_00, vatCode: '3' },
        { account: '2700', debit: 0, credit: 25_000_00, vatCode: '3' },
      ],
      true,
    );
    // 2026 purchase: 40 000 net + 10 000 deductible input VAT.
    await postVoucher(
      db.sql,
      org,
      org.period2026,
      'purchase',
      [
        { account: '6000', debit: 40_000_00, credit: 0, vatCode: '1' },
        { account: '2710', debit: 10_000_00, credit: 0, vatCode: '1' },
        { account: '2400', debit: 0, credit: 50_000_00 },
      ],
      true,
    );
    // 2026 settlement: customer pays the invoice.
    await postVoucher(
      db.sql,
      org,
      org.period2026,
      'bank',
      [
        { account: '1920', debit: 125_000_00, credit: 0 },
        { account: '1500', debit: 0, credit: 125_000_00 },
      ],
      true,
    );
  }

  it('ties out (TotalDebit = TotalCredit, closing balances net to zero) and is XSD-valid', async () => {
    const org = await seedOrg(db.sql);
    await addContact(db.sql, org, 'Kjøper AS', 'customer');
    await addContact(db.sql, org, 'Leverandør AS', 'supplier');
    await seedFullYear(org);

    const input = await withOrgTx(appDb, org.orgId, (tx) => readSaftFinancial(tx, 2026));
    const model = generateSaftFinancial(input, META(org.orgNr, org.name), accountIndex, codeIndex);

    // Three posted 2026 vouchers (the 2025 capital voucher is not part of the 2026 entries).
    expect(model.numberOfEntries).toBe(3);
    expect(saftBalances(model)).toBe(true);
    expect(model.totalDebitØre).toBe(model.totalCreditØre);
    // Σ debit across 2026 lines = 125 000 + (40 000 + 10 000) + 125 000 = 300 000.
    expect(model.totalDebitØre).toBe(300_000_00);
    // The full chart (incl. the prior-year balances) nets to zero — the masters reconcile.
    expect(saftClosingBalanceNet(model)).toBe(0);

    const result = await validateXML({
      xml: [{ fileName: 'saf-t.xml', contents: buildSaftXml(model, SYSTEM) }],
      schema: [{ fileName: 'saf-t.xsd', contents: xsd }],
    });
    expect(result.valid).toBe(true);
  });

  it('carries prior-year movement into the opening balance', async () => {
    const org = await seedOrg(db.sql);
    await seedFullYear(org);
    const input = await withOrgTx(appDb, org.orgId, (tx) => readSaftFinancial(tx, 2026));

    const bank = input.accounts.find((a) => a.number === '1920')!;
    // Bank opened 2026 with the 50 000 capital from 2025, then took the 125 000 settlement.
    expect(bank.openingØre).toBe(50_000_00);
    expect(bank.closingØre).toBe(175_000_00);
    const equity = input.accounts.find((a) => a.number === '2050')!;
    expect(equity.openingØre).toBe(-50_000_00); // credit balance
  });

  it('maps the parties register to customers and suppliers, and resolves StandardAccountID', async () => {
    const org = await seedOrg(db.sql);
    await addContact(db.sql, org, 'Kjøper AS', 'customer');
    await addContact(db.sql, org, 'Selger AS', 'supplier');
    await seedFullYear(org);

    const input = await withOrgTx(appDb, org.orgId, (tx) => readSaftFinancial(tx, 2026));
    const model = generateSaftFinancial(input, META(org.orgNr, org.name), accountIndex, codeIndex);

    expect(model.customers.map((c) => c.name)).toEqual(['Kjøper AS']);
    expect(model.suppliers.map((s) => s.name)).toEqual(['Selger AS']);
    // Account 3000 is a committed standard account, so its StandardAccountID resolves.
    expect(model.accounts.find((a) => a.id === '3000')?.standardId).toBe('3000');
    // The output-VAT leg carries TaxInformation; the revenue leg does not.
    const lines = model.journals.flatMap((j) => j.transactions.flatMap((t) => t.lines));
    expect(lines.find((l) => l.accountId === '2700')?.tax).toMatchObject({ code: '3' });
    expect(lines.find((l) => l.accountId === '3000')?.tax).toBeUndefined();
  });

  it('excludes draft (unposted) vouchers from the entries', async () => {
    const org = await seedOrg(db.sql);
    await postVoucher(
      db.sql,
      org,
      org.period2026,
      'sales',
      [
        { account: '1500', debit: 125_000_00, credit: 0 },
        { account: '3000', debit: 0, credit: 100_000_00, vatCode: '3' },
        { account: '2700', debit: 0, credit: 25_000_00, vatCode: '3' },
      ],
      false, // draft
    );
    const input = await withOrgTx(appDb, org.orgId, (tx) => readSaftFinancial(tx, 2026));
    expect(input.transactions).toEqual([]);
    expect(input.accounts).toEqual([]);
  });

  it("never reads another tenant's ledger or parties (RLS isolation)", async () => {
    const a = await seedOrg(db.sql);
    const b = await seedOrg(db.sql);
    await addContact(db.sql, b, 'Hemmelig Kunde AS', 'customer');
    await seedFullYear(b);

    const input = await withOrgTx(appDb, a.orgId, (tx) => readSaftFinancial(tx, 2026));
    expect(input.transactions).toEqual([]);
    expect(input.accounts).toEqual([]);
    expect(input.customers).toEqual([]);
    expect(input.suppliers).toEqual([]);
  });
});
