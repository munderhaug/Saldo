/**
 * SAF-T Financial validation entrypoint (`pnpm saft:validate`). A CI gate that builds a representative
 * SAF-T Financial export from the pure `@saldo/domain` generator (grounded in the committed reference
 * lists under `db/reference/saf-t/`) and validates it locally:
 *   1. the ledger tie-out (`saftBalances` — TotalDebit = TotalCredit, every transaction balances);
 *   2. XML **well-formedness** (fast-xml-parser);
 *   3. **XSD validation** against the committed official schema
 *      (`db/reference/saf-t/schema/Norwegian_SAF-T_Financial_Schema_v_1.10.xsd`) via `xmllint-wasm`.
 *
 * This is REAL XSD validation (not the well-formedness-only scaffold it replaces). It runs on every
 * change touching the export logic — keep it green. Exit 0 when the sample ties out, is well-formed AND
 * XSD-valid; 1 otherwise.
 */
import { readFileSync } from 'node:fs';
import { XMLValidator } from 'fast-xml-parser';
import { validateXML } from 'xmllint-wasm';
import {
  buildSaftXml,
  generateSaftFinancial,
  indexAccounts,
  indexTaxCodes,
  orgNr,
  parseStandardAccounts,
  parseStandardTaxCodes,
  saftBalances,
  øre,
  type AccountNo,
  type SaftFinancialInput,
  type VatCode,
} from '@saldo/domain';

const ref = (path: string): URL => new URL(`../../../db/reference/saf-t/${path}`, import.meta.url);

const codeIndex = indexTaxCodes(
  parseStandardTaxCodes(readFileSync(ref('tax-codes/Standard_Tax_Codes.csv'), 'utf8')),
);
const accountIndex = indexAccounts(
  parseStandardAccounts(
    readFileSync(ref('accounts/General_Ledger_Standard_Accounts_4_character.csv'), 'utf8'),
  ),
);

const acc = (n: string): AccountNo => n as AccountNo;
const code = (c: string): VatCode => c as VatCode;

/**
 * A representative year: a standard-rated sale (AR + revenue + output VAT), a domestic purchase with
 * deductible input VAT, and a manual bank settlement — exercising every section the schema requires
 * (account masters with balances, customers + suppliers, the tax table, and multi-journal entries).
 */
function sampleInput(): SaftFinancialInput {
  return {
    accounts: [
      {
        number: acc('1500'),
        name: 'Kundefordringer',
        openingØre: øre(0),
        closingØre: øre(75_000_00),
      },
      { number: acc('1920'), name: 'Bankinnskudd', openingØre: øre(0), closingØre: øre(50_000_00) },
      {
        number: acc('2400'),
        name: 'Leverandørgjeld',
        openingØre: øre(0),
        closingØre: øre(-50_000_00),
      },
      {
        number: acc('2700'),
        name: 'Utgående merverdiavgift',
        openingØre: øre(0),
        closingØre: øre(-25_000_00),
      },
      {
        number: acc('2710'),
        name: 'Inngående merverdiavgift',
        openingØre: øre(0),
        closingØre: øre(10_000_00),
      },
      {
        number: acc('3000'),
        name: 'Salgsinntekt',
        openingØre: øre(0),
        closingØre: øre(-100_000_00),
      },
      {
        number: acc('6000'),
        name: 'Driftskostnad',
        openingØre: øre(0),
        closingØre: øre(40_000_00),
      },
    ],
    customers: [
      { id: 'K1', name: 'Kjøper AS', orgNr: orgNr('923609016'), city: 'Bergen', countryCode: 'NO' },
    ],
    suppliers: [
      {
        id: 'L1',
        name: 'Leverandør AS',
        orgNr: orgNr('974760673'),
        addressLine: 'Storgata 1',
        postalCode: '0151',
        city: 'Oslo',
        countryCode: 'NO',
      },
    ],
    transactions: [
      {
        voucherId: 'B1',
        voucherType: 'sales',
        date: '2026-03-15',
        lines: [
          {
            accountNumber: acc('1500'),
            accountType: 'asset',
            side: 'debit',
            amountØre: øre(125_000_00),
            description: 'Kundefordring',
            customerId: 'K1',
          },
          {
            accountNumber: acc('3000'),
            accountType: 'revenue',
            side: 'credit',
            amountØre: øre(100_000_00),
            description: 'Salg',
            vatCode: code('3'),
          },
          {
            accountNumber: acc('2700'),
            accountType: 'equity_liability',
            side: 'credit',
            amountØre: øre(25_000_00),
            description: 'Utgående mva',
            vatCode: code('3'),
          },
        ],
      },
      {
        voucherId: 'B2',
        voucherType: 'purchase',
        date: '2026-04-02',
        lines: [
          {
            accountNumber: acc('6000'),
            accountType: 'expense',
            side: 'debit',
            amountØre: øre(40_000_00),
            description: 'Driftskostnad',
            vatCode: code('1'),
          },
          {
            accountNumber: acc('2710'),
            accountType: 'equity_liability',
            side: 'debit',
            amountØre: øre(10_000_00),
            description: 'Inngående mva',
            vatCode: code('1'),
          },
          {
            accountNumber: acc('2400'),
            accountType: 'equity_liability',
            side: 'credit',
            amountØre: øre(50_000_00),
            description: 'Leverandørgjeld',
            supplierId: 'L1',
          },
        ],
      },
      {
        voucherId: 'B3',
        voucherType: 'manual',
        date: '2026-05-10',
        lines: [
          {
            accountNumber: acc('1920'),
            accountType: 'asset',
            side: 'debit',
            amountØre: øre(125_000_00),
            description: 'Innbetaling fra kunde',
          },
          {
            accountNumber: acc('1500'),
            accountType: 'asset',
            side: 'credit',
            amountØre: øre(125_000_00),
            description: 'Kundefordring oppgjort',
          },
        ],
      },
    ],
  };
}

async function main(): Promise<number> {
  const model = generateSaftFinancial(
    sampleInput(),
    { orgNr: orgNr('974760673'), name: 'Eksempel Enkeltpersonforetak', year: 2026 },
    accountIndex,
    codeIndex,
  );

  let ok = true;

  if (saftBalances(model)) {
    console.log(
      '✓ saft:validate — ledger tie-out: TotalDebit = TotalCredit, every transaction balances',
    );
  } else {
    ok = false;
    console.error('✗ saft:validate — the export does not tie out (TotalDebit ≠ TotalCredit)');
  }

  const xml = buildSaftXml(model, {
    softwareCompanyName: 'Saldo',
    softwareId: 'Saldo',
    softwareVersion: '0.0.0',
    dateCreated: '2026-06-26',
  });

  const wellFormed = XMLValidator.validate(xml);
  if (wellFormed === true) {
    console.log('✓ saft:validate — XML is well-formed');
  } else {
    ok = false;
    console.error(`✗ saft:validate — XML not well-formed: ${wellFormed.err.msg}`);
  }

  const schema = readFileSync(ref('schema/Norwegian_SAF-T_Financial_Schema_v_1.10.xsd'), 'utf8');
  const result = await validateXML({
    xml: [{ fileName: 'saf-t-financial.xml', contents: xml }],
    schema: [{ fileName: 'saf-t-financial.xsd', contents: schema }],
  });
  if (result.valid) {
    console.log(
      '✓ saft:validate — XSD-valid against the official Norwegian SAF-T Financial schema',
    );
  } else {
    ok = false;
    for (const e of result.errors) console.error(`✗ ${e.message ?? e.rawMessage}`);
  }

  if (!ok) {
    console.error(
      'saft:validate FAILED. Fix the mapping in the export builder (@saldo/domain/saft) — codes and ' +
        'accounts come from the committed SAF-T reference lists (db/reference/saf-t).',
    );
  }
  return ok ? 0 : 1;
}

process.exit(await main());
