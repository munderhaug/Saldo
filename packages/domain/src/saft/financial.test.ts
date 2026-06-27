import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { øre, ZERO } from '../money/ore.js';
import { orgNr } from '../ids/org-nr.js';
import type { AccountNo, VatCode } from '../posting/types.js';
import { indexAccounts, parseStandardAccounts } from './accounts.js';
import { indexTaxCodes, parseStandardTaxCodes } from './tax-codes.js';
import {
  generateSaftFinancial,
  saftBalances,
  saftClosingBalanceNet,
  type SaftCompanyMeta,
  type SaftFinancialInput,
  type SaftLineInput,
} from './financial.js';

// REAL committed SAF-T lists — accounts/codes are loaded, never hardcoded from memory (§4.3).
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
const META: SaftCompanyMeta = { orgNr: orgNr('974760673'), name: 'Eksempel ENK', year: 2026 };

/** A balanced sale: AR debit gross / revenue credit net / output-VAT credit. */
function salesInput(): SaftFinancialInput {
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
    customers: [{ id: 'K1', name: 'Kjøper AS', orgNr: orgNr('923609016'), countryCode: 'NO' }],
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

describe('generateSaftFinancial — account masters', () => {
  it('resolves a positive net to a debit balance and a negative net to a credit balance', () => {
    const m = generateSaftFinancial(salesInput(), META, accountIndex, codeIndex);
    const ar = m.accounts.find((a) => a.id === '1500')!;
    const revenue = m.accounts.find((a) => a.id === '3000')!;
    expect(ar.closing).toEqual({ side: 'debit', amountØre: øre(125_000_00) });
    expect(revenue.closing).toEqual({ side: 'credit', amountØre: øre(100_000_00) });
  });

  it('sets StandardAccountID for a standard-kontoplan number and omits it otherwise', () => {
    const input = salesInput();
    const withCustom: SaftFinancialInput = {
      ...input,
      accounts: [
        ...input.accounts,
        { number: acc('9999999'), name: 'Egendefinert', openingØre: øre(0), closingØre: øre(0) },
      ],
    };
    const m = generateSaftFinancial(withCustom, META, accountIndex, codeIndex);
    expect(m.accounts.find((a) => a.id === '1500')!.standardId).toBe('1500');
    expect(m.accounts.find((a) => a.id === '9999999')!.standardId).toBeUndefined();
  });
});

describe('generateSaftFinancial — tax table + journals', () => {
  it('collects only the codes carried on MVA-account legs, deduped and sorted by number', () => {
    const m = generateSaftFinancial(salesInput(), META, accountIndex, codeIndex);
    // The revenue leg also carries code 3, but only the equity_liability (2700) leg drives the table.
    expect(m.taxCodes.map((c) => c.code)).toEqual(['3']);
    expect(m.taxCodes[0]).toMatchObject({ code: '3', standardCode: '3', percent: '25' });
  });

  it('emits TaxInformation only on the MVA-account leg, with the posted VAT as TaxAmount', () => {
    const m = generateSaftFinancial(salesInput(), META, accountIndex, codeIndex);
    const lines = m.journals.flatMap((j) => j.transactions.flatMap((t) => t.lines));
    const vatLeg = lines.find((l) => l.accountId === '2700')!;
    const revenueLeg = lines.find((l) => l.accountId === '3000')!;
    expect(vatLeg.tax).toEqual({ code: '3', percent: '25', amountØre: øre(25_000_00) });
    expect(revenueLeg.tax).toBeUndefined();
  });

  it('emits TaxInformation on BOTH MVA-account legs of a reverse-charge dual leg', () => {
    // Cash-neutral snudd avregning: self-account output (2704, code 3) + deductible input (2714,
    // code 86), both klasse-2 MVA accounts → each carries its own TaxAmount; the basis cost line does not.
    const input: SaftFinancialInput = {
      accounts: [],
      customers: [],
      suppliers: [],
      transactions: [
        {
          voucherId: 'RC1',
          voucherType: 'purchase',
          date: '2026-03-01',
          lines: [
            {
              accountNumber: acc('6000'),
              accountType: 'expense',
              side: 'debit',
              amountØre: øre(8_000_00),
              description: 'Tjeneste',
              vatCode: code('86'),
            },
            {
              accountNumber: acc('2714'),
              accountType: 'equity_liability',
              side: 'debit',
              amountØre: øre(2_000_00),
              description: 'Inngående mva (snudd)',
              vatCode: code('86'),
            },
            {
              accountNumber: acc('2400'),
              accountType: 'equity_liability',
              side: 'credit',
              amountØre: øre(8_000_00),
              description: 'Leverandørgjeld',
            },
            {
              accountNumber: acc('2704'),
              accountType: 'equity_liability',
              side: 'credit',
              amountØre: øre(2_000_00),
              description: 'Utgående mva (snudd)',
              vatCode: code('3'),
            },
          ],
        },
      ],
    };
    const m = generateSaftFinancial(input, META, accountIndex, codeIndex);
    const lines = m.journals.flatMap((j) => j.transactions.flatMap((t) => t.lines));
    expect(lines.find((l) => l.accountId === '2714')!.tax).toMatchObject({
      code: '86',
      amountØre: øre(2_000_00),
    });
    expect(lines.find((l) => l.accountId === '2704')!.tax).toMatchObject({
      code: '3',
      amountØre: øre(2_000_00),
    });
    expect(lines.find((l) => l.accountId === '6000')!.tax).toBeUndefined(); // basis leg, no tax block
    expect(m.taxCodes.map((c) => c.code)).toEqual(['3', '86']);
    expect(saftBalances(m)).toBe(true);
  });

  it('gives a cost-booked non-deductible VAT line no TaxInformation (VAT is part of the cost)', () => {
    // `uten fradragsrett`: the irrecoverable VAT is booked to the expense account, not a 27xx MVA
    // account, so it carries no separate tax block — only the genuine MVA-account legs do.
    const input: SaftFinancialInput = {
      accounts: [],
      customers: [],
      suppliers: [],
      transactions: [
        {
          voucherId: 'ND1',
          voucherType: 'purchase',
          date: '2026-03-01',
          lines: [
            {
              accountNumber: acc('7350'),
              accountType: 'expense',
              side: 'debit',
              amountØre: øre(10_000_00),
              description: 'Representasjon inkl. mva',
              vatCode: code('87'),
            },
            {
              accountNumber: acc('2400'),
              accountType: 'equity_liability',
              side: 'credit',
              amountØre: øre(10_000_00),
              description: 'Leverandørgjeld',
            },
          ],
        },
      ],
    };
    const m = generateSaftFinancial(input, META, accountIndex, codeIndex);
    const lines = m.journals.flatMap((j) => j.transactions.flatMap((t) => t.lines));
    expect(lines.find((l) => l.accountId === '7350')!.tax).toBeUndefined();
    expect(m.taxCodes).toEqual([]); // no MVA-account leg → no tax table entry
    expect(saftBalances(m)).toBe(true);
  });

  it('groups transactions into one journal per voucher type', () => {
    const input = salesInput();
    const twoTypes: SaftFinancialInput = {
      ...input,
      accounts: [
        ...input.accounts,
        { number: acc('1920'), name: 'Bank', openingØre: øre(0), closingØre: øre(125_000_00) },
      ],
      transactions: [
        ...input.transactions,
        {
          voucherId: 'B2',
          voucherType: 'manual',
          date: '2026-04-01',
          lines: [
            {
              accountNumber: acc('1920'),
              accountType: 'asset',
              side: 'debit',
              amountØre: øre(125_000_00),
              description: 'Innbetaling',
            },
            {
              accountNumber: acc('1500'),
              accountType: 'asset',
              side: 'credit',
              amountØre: øre(125_000_00),
              description: 'AR oppgjort',
            },
          ],
        },
      ],
    };
    const m = generateSaftFinancial(twoTypes, META, accountIndex, codeIndex);
    expect(m.journals.map((j) => j.id).sort()).toEqual(['manual', 'sales']);
    expect(m.numberOfEntries).toBe(2);
  });

  it('throws on an MVA-account leg carrying a code absent from the SAF-T list', () => {
    const input = salesInput();
    const bad: SaftFinancialInput = {
      ...input,
      transactions: [
        {
          ...input.transactions[0]!,
          lines: input.transactions[0]!.lines.map(
            (l): SaftLineInput => (l.accountNumber === '2700' ? { ...l, vatCode: code('999') } : l),
          ),
        },
      ],
    };
    expect(() => generateSaftFinancial(bad, META, accountIndex, codeIndex)).toThrow(
      /unknown VAT code/,
    );
  });
});

describe('generateSaftFinancial — tie-out', () => {
  it('a balanced ledger ties out (TotalDebit = TotalCredit) and every transaction balances', () => {
    const m = generateSaftFinancial(salesInput(), META, accountIndex, codeIndex);
    expect(m.totalDebitØre).toBe(øre(125_000_00));
    expect(m.totalCreditØre).toBe(øre(125_000_00));
    expect(saftBalances(m)).toBe(true);
  });

  it("the account masters' signed closing balances net to zero for a balanced ledger", () => {
    const m = generateSaftFinancial(salesInput(), META, accountIndex, codeIndex);
    expect(saftClosingBalanceNet(m)).toBe(ZERO);
  });
});

// A balanced voucher: a random debit account and credit account share one random amount.
const txArb = fc
  .tuple(
    fc.integer({ min: 1, max: 9_999_999 }),
    fc.constantFrom('1500', '1920', '3000', '6000'),
    fc.constantFrom('2400', '2700', '3000', '1920'),
    fc.constantFrom('sales', 'purchase', 'manual', 'bank'),
  )
  .map(([ore, dr, cr, type]) => ({
    voucherId: `B${ore}-${dr}-${cr}`,
    voucherType: type,
    date: '2026-06-01',
    lines: [
      {
        accountNumber: acc(dr),
        accountType: 'asset' as const,
        side: 'debit' as const,
        amountØre: øre(ore),
        description: 'd',
      },
      {
        accountNumber: acc(cr),
        accountType: 'asset' as const,
        side: 'credit' as const,
        amountØre: øre(ore),
        description: 'c',
      },
    ],
  }));

describe('generateSaftFinancial — properties', () => {
  it('any set of balanced vouchers ties out and reports the right entry count', () => {
    fc.assert(
      fc.property(fc.array(txArb, { minLength: 1, maxLength: 40 }), (txs) => {
        const m = generateSaftFinancial(
          { accounts: [], customers: [], suppliers: [], transactions: txs },
          META,
          accountIndex,
          codeIndex,
        );
        expect(saftBalances(m)).toBe(true);
        expect(m.totalDebitØre).toBe(m.totalCreditØre);
        expect(m.numberOfEntries).toBe(txs.length);
        // Every transaction lands in exactly one journal of its own type.
        const placed = m.journals.flatMap((j) => j.transactions).length;
        expect(placed).toBe(txs.length);
      }),
    );
  });

  it('a coded sale always puts the posted VAT (and only it) on the MVA-account leg', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 4_000_000 }), (net) => {
        const vat = øre(Math.trunc((net * 25) / 100));
        const gross = øre(net + Number(vat));
        const m = generateSaftFinancial(
          {
            accounts: [],
            customers: [],
            suppliers: [],
            transactions: [
              {
                voucherId: 'S',
                voucherType: 'sales',
                date: '2026-06-01',
                lines: [
                  {
                    accountNumber: acc('1500'),
                    accountType: 'asset',
                    side: 'debit',
                    amountØre: gross,
                    description: 'AR',
                  },
                  {
                    accountNumber: acc('3000'),
                    accountType: 'revenue',
                    side: 'credit',
                    amountØre: øre(net),
                    description: 'Salg',
                    vatCode: code('3'),
                  },
                  {
                    accountNumber: acc('2700'),
                    accountType: 'equity_liability',
                    side: 'credit',
                    amountØre: vat,
                    description: 'mva',
                    vatCode: code('3'),
                  },
                ],
              },
            ],
          },
          META,
          accountIndex,
          codeIndex,
        );
        expect(saftBalances(m)).toBe(true);
        const lines = m.journals.flatMap((j) => j.transactions.flatMap((t) => t.lines));
        // The MVA-account leg carries TaxInformation with the posted VAT; the basis legs carry none.
        expect(lines.find((l) => l.accountId === '2700')!.tax).toEqual({
          code: '3',
          percent: '25',
          amountØre: vat,
        });
        expect(lines.filter((l) => l.tax !== undefined)).toHaveLength(1);
        expect(m.taxCodes.map((c) => c.code)).toEqual(['3']);
      }),
    );
  });
});
