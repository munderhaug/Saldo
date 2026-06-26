import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Sql } from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import {
  ANNUAL_TERM,
  generateMvaMelding,
  indexTaxCodes,
  parseStandardTaxCodes,
  validateMvaMelding,
  type VatCode,
} from '@saldo/domain';
import { readFileSync } from 'node:fs';
import { type LedgerDb, ledgerDbAvailable, startLedgerDb } from './db-harness.js';
import * as schema from '../../app/db/schema.js';
import { withOrgTx } from '../../app/auth/middleware.js';
import { aggregateVatByCode } from '../../app/db/mva-melding.server.js';

// Needs a real Postgres (Docker/Testcontainers, or SALDO_TEST_PG_URI). Skips cleanly otherwise.

const codeIndex = indexTaxCodes(
  parseStandardTaxCodes(
    readFileSync(
      new URL('../../../../db/reference/saf-t/tax-codes/Standard_Tax_Codes.csv', import.meta.url),
      'utf8',
    ),
  ),
);

/**
 * The MVA-melding aggregation (`feat-mva-melding`): summing one fiscal year's POSTED ledger PER SAF-T VAT
 * code, read through the non-owner app role under FORCE-RLS — exactly as the melding route does via
 * `withUserOrg`. Proves the per-code grunnlag/merverdiavgift partition is correct, that the generated
 * melding TIES OUT to the ledger (Σ VAT = output − deductible input), that the reverse-charge dual leg
 * lands on both sides, that drafts are excluded, and that RLS keeps one tenant's ledger invisible.
 */
describe.skipIf(!ledgerDbAvailable)('MVA-melding ledger aggregation (app role + RLS)', () => {
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
    vat: Record<string, string>; // code → vat_code id
    period2026: string;
  }

  async function seedOrg(sql: Sql): Promise<FullOrg> {
    orgSeq += 1;
    const orgNr = String(930000000 + orgSeq);
    const [org] = await sql<{ id: string }[]>`
      INSERT INTO organization (org_nr, name, mva_status)
      VALUES (${orgNr}, ${'Melding ENK ' + String(orgSeq)}, 'registered_standard')
      RETURNING id`;
    const orgId = org!.id;

    const specs: ReadonlyArray<[string, string, string]> = [
      ['1500', 'Kundefordringer', 'asset'],
      ['2400', 'Leverandørgjeld', 'equity_liability'],
      ['2700', 'Utgående MVA', 'equity_liability'],
      ['2704', 'Utgående MVA (snudd, høy)', 'equity_liability'],
      ['2710', 'Inngående MVA', 'equity_liability'],
      ['2714', 'Inngående MVA (snudd, høy)', 'equity_liability'],
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

    const vatSpecs: ReadonlyArray<[string, number, string]> = [
      ['3', 0.25, 'output'],
      ['1', 0.25, 'input'],
      ['86', 0.25, 'input'], // reverse-charge foreign services, deductible
      ['87', 0.25, 'none'], // reverse-charge foreign services, uten fradragsrett (non-deductible)
    ];
    const vat: Record<string, string> = {};
    for (const [code, rate, direction] of vatSpecs) {
      const [c] = await sql<{ id: string }[]>`
        INSERT INTO vat_code (organization_id, code, rate, direction)
        VALUES (${orgId}, ${code}, ${rate}, ${direction}) RETURNING id`;
      vat[code] = c!.id;
    }

    const [p] = await sql<{ id: string }[]>`
      INSERT INTO fiscal_period (organization_id, year, starts_on, ends_on)
      VALUES (${orgId}, 2026, '2026-01-01', '2026-12-31') RETURNING id`;

    return { orgId, accounts, vat, period2026: p!.id };
  }

  interface Leg {
    account: string;
    debit: number;
    credit: number;
    vatCode?: string;
  }

  async function postVoucher(sql: Sql, org: FullOrg, legs: readonly Leg[], post: boolean) {
    await sql.begin(async (tx) => {
      const [v] = await tx<{ id: string }[]>`
        INSERT INTO voucher (organization_id, type, period_id)
        VALUES (${org.orgId}, 'manual', ${org.period2026}) RETURNING id`;
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

  const meta = (orgNr: string) =>
    ({
      orgNr: orgNr as never,
      year: 2026,
      term: ANNUAL_TERM,
      mvaStatus: 'registered_standard',
    }) as const;

  it('aggregates per code, the melding ties out, and the reverse-charge dual leg lands on both sides', async () => {
    const org = await seedOrg(db.sql);
    // Domestic sale: 100 000 net, 25 000 output VAT (code 3).
    await postVoucher(
      db.sql,
      org,
      [
        { account: '1500', debit: 125_000, credit: 0 },
        { account: '3000', debit: 0, credit: 100_000, vatCode: '3' },
        { account: '2700', debit: 0, credit: 25_000, vatCode: '3' },
      ],
      true,
    );
    // Domestic purchase: 40 000 net, 10 000 deductible input VAT (code 1).
    await postVoucher(
      db.sql,
      org,
      [
        { account: '6000', debit: 40_000, credit: 0, vatCode: '1' },
        { account: '2710', debit: 10_000, credit: 0, vatCode: '1' },
        { account: '2400', debit: 0, credit: 50_000 },
      ],
      true,
    );
    // Reverse charge (foreign services), cash-neutral: cost 8 000 (code 86), self-account output 2 000
    // to code 3 on the snudd account 2704, deductible input 2 000 to code 86 on 2714.
    await postVoucher(
      db.sql,
      org,
      [
        { account: '6000', debit: 8_000, credit: 0, vatCode: '86' },
        { account: '2714', debit: 2_000, credit: 0, vatCode: '86' },
        { account: '2400', debit: 0, credit: 8_000 },
        { account: '2704', debit: 0, credit: 2_000, vatCode: '3' },
      ],
      true,
    );

    const aggregates = await withOrgTx(appDb, org.orgId, (tx) => aggregateVatByCode(tx, 2026));
    const byCode = new Map(aggregates.map((a) => [a.code, a]));

    // Code 3: revenue basis 100 000 + the reverse-charge self-account output VAT (25 000 + 2 000).
    expect(byCode.get('3' as VatCode)).toMatchObject({
      grunnlagØre: 100_000,
      merverdiavgiftØre: 27_000,
    });
    // Code 1: the query faithfully sums the purchase expense basis (40 000); VAT is negative (debited).
    expect(byCode.get('1' as VatCode)).toMatchObject({
      grunnlagØre: 40_000,
      merverdiavgiftØre: -10_000,
    });
    // Code 86: the import basis 8 000 + its deduction leg (-2 000).
    expect(byCode.get('86' as VatCode)).toMatchObject({
      grunnlagØre: 8_000,
      merverdiavgiftØre: -2_000,
    });

    const result = generateMvaMelding(aggregates, meta('930000001'), codeIndex);
    if (!result.registered) throw new Error('expected a melding');
    // The tie-out: fastsatt = Σ line VAT = output (27 000) − deductible input (10 000 + 2 000) = 15 000.
    expect(result.melding.fastsattØre).toBe(15_000);
    expect(validateMvaMelding(result.melding, codeIndex).ok).toBe(true);
    // The generator omits the basis for the pure domestic input-deduction code (1), per the sign rule.
    const line1 = result.melding.lines.find((l) => l.mvaKode === ('1' as VatCode));
    expect(line1).toMatchObject({ merverdiavgiftØre: -10_000 });
    expect(line1?.grunnlagØre).toBeUndefined();
    // Both reverse-charge legs are present on the melding (output under 3, deduction under 86).
    expect(
      result.melding.lines.find((l) => l.mvaKode === ('86' as VatCode))?.merverdiavgiftØre,
    ).toBe(-2_000);
  });

  it('reports the NET supply value as grunnlag for a non-deductible reverse charge (not net+VAT)', async () => {
    const org = await seedOrg(db.sql);
    // Non-deductible RC (code 87): cost split into NET 8 000 (coded 87) + irrecoverable VAT 2 000
    // (UNCODED), self-account output 2 000 to code 3. The melding basis must be the net (8 000).
    await postVoucher(
      db.sql,
      org,
      [
        { account: '6000', debit: 8_000, credit: 0, vatCode: '87' },
        { account: '6000', debit: 2_000, credit: 0 }, // irrecoverable VAT, UNCODED
        { account: '2400', debit: 0, credit: 8_000 },
        { account: '2704', debit: 0, credit: 2_000, vatCode: '3' },
      ],
      true,
    );

    const aggregates = await withOrgTx(appDb, org.orgId, (tx) => aggregateVatByCode(tx, 2026));
    const byCode = new Map(aggregates.map((a) => [a.code, a]));
    // The basis is the NET (8 000), NOT net+VAT (10 000); no VAT-account leg under 87 → 0 VAT.
    expect(byCode.get('87' as VatCode)).toMatchObject({ grunnlagØre: 8_000, merverdiavgiftØre: 0 });
    // The self-accounted output (2 000) lands under code 3, so the term still ties out.
    expect(byCode.get('3' as VatCode)).toMatchObject({ merverdiavgiftØre: 2_000 });

    const result = generateMvaMelding(aggregates, meta('930000001'), codeIndex);
    if (!result.registered) throw new Error('expected a melding');
    expect(result.melding.fastsattØre).toBe(2_000); // output 2 000 − deductible 0
    expect(validateMvaMelding(result.melding, codeIndex).ok).toBe(true);
    expect(result.melding.lines.find((l) => l.mvaKode === ('87' as VatCode))?.grunnlagØre).toBe(
      8_000,
    );
  });

  it('excludes draft (unposted) vouchers', async () => {
    const org = await seedOrg(db.sql);
    await postVoucher(
      db.sql,
      org,
      [
        { account: '1500', debit: 125_000, credit: 0 },
        { account: '3000', debit: 0, credit: 100_000, vatCode: '3' },
        { account: '2700', debit: 0, credit: 25_000, vatCode: '3' },
      ],
      false, // draft
    );
    const aggregates = await withOrgTx(appDb, org.orgId, (tx) => aggregateVatByCode(tx, 2026));
    expect(aggregates).toEqual([]);
  });

  it("never counts another tenant's ledger (RLS isolation)", async () => {
    const a = await seedOrg(db.sql);
    const b = await seedOrg(db.sql);
    await postVoucher(
      db.sql,
      b,
      [
        { account: '1500', debit: 1_250_000, credit: 0 },
        { account: '3000', debit: 0, credit: 1_000_000, vatCode: '3' },
        { account: '2700', debit: 0, credit: 250_000, vatCode: '3' },
      ],
      true,
    );
    const aggregates = await withOrgTx(appDb, a.orgId, (tx) => aggregateVatByCode(tx, 2026));
    expect(aggregates).toEqual([]); // A sees nothing of B's large ledger
  });
});
