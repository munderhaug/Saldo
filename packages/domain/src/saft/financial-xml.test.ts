import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { øre } from '../money/ore.js';
import { orgNr } from '../ids/org-nr.js';
import type { AccountNo, VatCode } from '../posting/types.js';
import { indexAccounts, parseStandardAccounts } from './accounts.js';
import { indexTaxCodes, parseStandardTaxCodes } from './tax-codes.js';
import {
  generateSaftFinancial,
  type SaftCompanyMeta,
  type SaftFinancialInput,
} from './financial.js';
import { buildSaftXml, SAFT_NAMESPACE, type SaftSystemInfo } from './financial-xml.js';
import { isXmlIllegalCodePoint } from '../xml/escape.js';

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

const acc = (n: string): AccountNo => n as AccountNo;
const code = (c: string): VatCode => c as VatCode;
const META: SaftCompanyMeta = { orgNr: orgNr('974760673'), name: 'Ola Nordmann', year: 2026 };
const SYSTEM: SaftSystemInfo = {
  softwareCompanyName: 'Saldo',
  softwareId: 'Saldo',
  softwareVersion: '0.0.0',
  dateCreated: '2026-06-26',
};

function input(): SaftFinancialInput {
  return {
    accounts: [
      {
        number: acc('1500'),
        name: 'Kundefordringer',
        openingØre: øre(0),
        closingØre: øre(125_000_00),
      },
      {
        number: acc('3000'),
        name: 'Salgsinntekt',
        openingØre: øre(0),
        closingØre: øre(-100_000_00),
      },
      {
        number: acc('2700'),
        name: 'Utgående mva',
        openingØre: øre(0),
        closingØre: øre(-25_000_00),
      },
    ],
    customers: [
      { id: 'K1', name: 'Kjøper AS', orgNr: orgNr('923609016'), city: 'Bergen', countryCode: 'NO' },
    ],
    suppliers: [],
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
            description: 'AR',
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
    ],
  };
}

const xml = (over?: Partial<SaftFinancialInput>): string =>
  buildSaftXml(
    generateSaftFinancial({ ...input(), ...over }, META, accountIndex, codeIndex),
    SYSTEM,
  );

describe('buildSaftXml — document shape', () => {
  it('declares the SAF-T namespace on the AuditFile root', () => {
    expect(xml()).toContain(`<AuditFile xmlns="${SAFT_NAMESPACE}">`);
  });

  it('emits the three sections in schema order: Header, MasterFiles, GeneralLedgerEntries', () => {
    const x = xml();
    expect(x.indexOf('<Header>')).toBeLessThan(x.indexOf('<MasterFiles>'));
    expect(x.indexOf('<MasterFiles>')).toBeLessThan(x.indexOf('<GeneralLedgerEntries>'));
  });

  it('renders the required Header fields including TaxAccountingBasis = A', () => {
    const x = xml();
    expect(x).toContain('<AuditFileCountry>NO</AuditFileCountry>');
    expect(x).toContain('<DefaultCurrencyCode>NOK</DefaultCurrencyCode>');
    expect(x).toContain('<TaxAccountingBasis>A</TaxAccountingBasis>');
    expect(x).toContain('<RegistrationNumber>974760673</RegistrationNumber>');
  });
});

describe('buildSaftXml — monetary formatting (SAFmonetaryType, 2 decimals)', () => {
  it('renders integer øre as a 2-decimal kroner amount', () => {
    expect(xml()).toContain('<Amount>125000.00</Amount>');
  });

  it('renders a credit account balance on the credit side with the absolute amount', () => {
    expect(xml()).toContain('<ClosingCreditBalance>100000.00</ClosingCreditBalance>');
    expect(xml()).toContain('<ClosingDebitBalance>125000.00</ClosingDebitBalance>');
  });

  it('ties the document totals out in the GeneralLedgerEntries header', () => {
    const x = xml();
    expect(x).toContain('<NumberOfEntries>1</NumberOfEntries>');
    expect(x).toContain('<TotalDebit>125000.00</TotalDebit>');
    expect(x).toContain('<TotalCredit>125000.00</TotalCredit>');
  });
});

describe('buildSaftXml — masters', () => {
  it('emits a Customers block but omits Suppliers when there are none', () => {
    const x = xml();
    expect(x).toContain('<Customers>');
    expect(x).toContain('<CustomerID>K1</CustomerID>');
    expect(x).not.toContain('<Suppliers>');
  });

  it('emits the TaxTable entry with the MVA tax type and the used code', () => {
    const x = xml();
    expect(x).toContain('<TaxType>MVA</TaxType>');
    expect(x).toContain('<TaxCode>3</TaxCode>');
    expect(x).toContain('<TaxPercentage>25</TaxPercentage>');
  });

  it('attaches TaxInformation to the MVA-account line only', () => {
    const x = xml();
    // exactly one TaxInformation block (the 2700 leg); the revenue leg carries none.
    expect(x.match(/<TaxInformation>/g)?.length).toBe(1);
    expect(x).toContain('<TaxAmount><Amount>25000.00</Amount></TaxAmount>');
  });

  it('escapes XML metacharacters in free text (account/party names)', () => {
    const x = xml({
      customers: [{ id: 'K&1', name: 'Tom & Jerry <AS>', countryCode: 'NO' }],
    });
    expect(x).toContain('Tom &amp; Jerry &lt;AS&gt;');
    expect(x).not.toContain('Tom & Jerry <AS>');
  });
});

describe('buildSaftXml — properties', () => {
  it('emits no bare ampersand, no XML-illegal char, and always closes the AuditFile', () => {
    // fullUnicodeString exercises the control/noncharacter range a real free-text field can carry
    // (a pasted NUL, vertical tab, etc.) — exactly what would otherwise yield a non-well-formed export.
    fc.assert(
      fc.property(fc.fullUnicodeString({ maxLength: 40 }), (name) => {
        const x = buildSaftXml(
          generateSaftFinancial(
            { ...input(), customers: [{ id: 'K1', name, countryCode: 'NO' }] },
            META,
            accountIndex,
            codeIndex,
          ),
          SYSTEM,
        );
        // No bare `&` that isn't the start of an entity.
        expect(/&(?!amp;|lt;|gt;|quot;|#)/.test(x)).toBe(false);
        // No character the XML 1.0 Char production forbids survived into the document. Compute once and
        // assert once — a per-char expect() over the whole document × the property runs is needlessly slow.
        const hasIllegal = Array.from(x).some((ch) => isXmlIllegalCodePoint(ch.codePointAt(0) ?? 0));
        expect(hasIllegal).toBe(false);
        expect(x.endsWith('</AuditFile>')).toBe(true);
      }),
    );
    // Generating a full SAF-T document per fast-check run is inherently a few seconds; give it headroom
    // beyond vitest's 5s default so a slow CI runner doesn't flake.
  }, 20000);
});
