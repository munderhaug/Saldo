import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { addØre, mulRate, øre, rate, type Rate } from '../money/ore.js';
import { MVA_STATUSES, type MvaStatus } from '../vat/status.js';
import { isBalanced, totalCredit, totalDebit } from './balance.js';
import { deriveDrawing, deriveOwnerOutlay } from './owner.js';
import type { AccountNo, VatCode } from './types.js';

const acc = (s: string): AccountNo => s as AccountNo;
const vc = (s: string): VatCode => s as VatCode;

const outlayAccounts = {
  cost: acc('6790'),
  inputVat: acc('2710'),
  equity: acc('2062'), // Innskudd kontanter — the owner-funded contra
};
const STANDARD = rate(0.25);
const ZERO_RATE = rate(0);

const find = (v: ReturnType<typeof deriveOwnerOutlay>, account: AccountNo) =>
  v.lines.find((l) => l.account === account);

describe('deriveOwnerOutlay — a privately-funded cost (utlegg / mileage / diett)', () => {
  it('registered_standard, deductible: splits input VAT, books net to cost, credits owner equity gross', () => {
    const v = deriveOwnerOutlay({
      net: øre(100_000),
      vatRate: STANDARD,
      status: 'registered_standard',
      accounts: outlayAccounts,
      vatCode: vc('1'),
    });
    expect(v.type).toBe('purchase');
    expect(isBalanced(v)).toBe(true);
    expect(find(v, outlayAccounts.cost)?.debit).toBe(100_000);
    expect(find(v, outlayAccounts.inputVat)?.debit).toBe(25_000);
    expect(find(v, outlayAccounts.equity)?.credit).toBe(125_000);
  });

  it('registered but non-deductible: books gross to cost, no input-VAT split', () => {
    const v = deriveOwnerOutlay({
      net: øre(100_000),
      vatRate: STANDARD,
      status: 'registered_standard',
      accounts: outlayAccounts,
      deductible: false,
    });
    expect(isBalanced(v)).toBe(true);
    expect(find(v, outlayAccounts.cost)?.debit).toBe(125_000);
    expect(find(v, outlayAccounts.inputVat)).toBeUndefined();
    expect(find(v, outlayAccounts.equity)?.credit).toBe(125_000);
  });

  it.each(['under_threshold', 'unntatt'] as const)('%s: gross to cost, no deduction', (status) => {
    const v = deriveOwnerOutlay({
      net: øre(100_000),
      vatRate: STANDARD,
      status,
      accounts: outlayAccounts,
    });
    expect(isBalanced(v)).toBe(true);
    expect(find(v, outlayAccounts.cost)?.debit).toBe(125_000);
    expect(find(v, outlayAccounts.inputVat)).toBeUndefined();
  });

  it('a VAT-free allowance (mileage/diett, rate 0): plain cost debit + equity credit, no VAT leg', () => {
    const v = deriveOwnerOutlay({
      net: øre(42_000),
      vatRate: ZERO_RATE,
      status: 'registered_standard',
      accounts: { cost: acc('7100'), inputVat: acc('2710'), equity: acc('2062') },
    });
    expect(isBalanced(v)).toBe(true);
    expect(v.lines).toHaveLength(2);
    expect(find(v, acc('7100'))?.debit).toBe(42_000);
    expect(find(v, acc('2062'))?.credit).toBe(42_000);
  });

  it('property: every owner outlay balances; the owner-equity credit is the gross (net + VAT)', () => {
    const RATES: readonly Rate[] = [ZERO_RATE, rate(0.12), rate(0.15), STANDARD];
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100_000_000 }),
        fc.constantFrom<MvaStatus>(...MVA_STATUSES),
        fc.constantFrom(...RATES),
        fc.boolean(),
        (net, status, vatRate, deductible) => {
          const v = deriveOwnerOutlay({
            net: øre(net),
            vatRate,
            status,
            accounts: outlayAccounts,
            deductible,
          });
          expect(isBalanced(v)).toBe(true);
          expect(totalDebit(v)).toBe(totalCredit(v));
          const gross = addØre(øre(net), mulRate(øre(net), vatRate));
          expect(find(v, outlayAccounts.equity)?.credit).toBe(gross);
        },
      ),
    );
  });
});

describe('deriveDrawing — a cash drawing (privatuttak)', () => {
  it('debits drawings, credits the asset, two balanced legs, no VAT', () => {
    const v = deriveDrawing(øre(500_000), { drawings: acc('2060'), asset: acc('1920') });
    expect(v.type).toBe('manual');
    expect(v.lines).toHaveLength(2);
    expect(isBalanced(v)).toBe(true);
    expect(find(v, acc('2060'))?.debit).toBe(500_000);
    expect(find(v, acc('1920'))?.credit).toBe(500_000);
    expect(v.lines.some((l) => l.vatCode !== undefined)).toBe(false);
  });

  it('property: a drawing always balances; debit = credit = the amount', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 100_000_000 }), (amount) => {
        const v = deriveDrawing(øre(amount), { drawings: acc('2060'), asset: acc('1920') });
        expect(isBalanced(v)).toBe(true);
        expect(totalDebit(v)).toBe(amount);
        expect(totalCredit(v)).toBe(amount);
      }),
    );
  });
});
