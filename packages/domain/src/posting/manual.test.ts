import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { øre } from '../money/ore.js';
import { MVA_STATUSES, type MvaStatus } from '../vat/status.js';
import { isBalanced } from './balance.js';
import type { AccountNo, VatCode } from './types.js';
import { deriveStandardExpense, deriveStandardIncome } from './manual.js';

const acc = (s: string): AccountNo => s as AccountNo;
const salesAccounts = { receivable: acc('1500'), revenue: acc('3000'), outputVat: acc('2700') };
const purchaseAccounts = { cost: acc('7798'), inputVat: acc('2710'), payable: acc('2400') };
const OUTPUT = '3' as VatCode;
const INPUT = '1' as VatCode;

/** Statuses that do NOT charge 25 % output VAT on a standard sale (zero-rated sells at 0 %). */
const NO_OUTPUT_VAT = MVA_STATUSES.filter((s) => s !== 'registered_standard');
/** Statuses that DO deduct input VAT on a standard purchase (both registered states). */
const DEDUCTS_INPUT: readonly MvaStatus[] = ['registered_standard', 'registered_zero_rated'];
const NO_DEDUCTION = MVA_STATUSES.filter((s) => !DEDUCTS_INPUT.includes(s));

describe('deriveStandardIncome — status-driven standard-rate sale', () => {
  it('registered_standard: charges 25 % output VAT, 3-leg balanced, revenue+VAT coded', () => {
    const r = deriveStandardIncome(øre(100_000), 'registered_standard', salesAccounts, OUTPUT);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.voucher.type).toBe('sales');
    expect(isBalanced(r.voucher)).toBe(true);
    expect(r.voucher.lines.find((l) => l.account === salesAccounts.receivable)?.debit).toBe(
      125_000,
    );
    expect(r.voucher.lines.find((l) => l.account === salesAccounts.revenue)?.credit).toBe(100_000);
    expect(r.voucher.lines.find((l) => l.account === salesAccounts.outputVat)?.credit).toBe(25_000);
    // The output SAF-T code rides the revenue + VAT legs; the receivable leg is uncoded.
    expect(r.voucher.lines.find((l) => l.account === salesAccounts.revenue)?.vatCode).toBe(OUTPUT);
  });

  it.each(NO_OUTPUT_VAT)(
    '%s: books a plain 2-leg sale at net, no output VAT, no code',
    (status) => {
      const r = deriveStandardIncome(øre(100_000), status, salesAccounts, OUTPUT);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(isBalanced(r.voucher)).toBe(true);
      expect(r.voucher.lines).toHaveLength(2);
      expect(r.voucher.lines.some((l) => l.account === salesAccounts.outputVat)).toBe(false);
      expect(r.voucher.lines.every((l) => l.vatCode === undefined)).toBe(true);
      expect(r.voucher.lines.find((l) => l.account === salesAccounts.receivable)?.debit).toBe(
        100_000,
      );
    },
  );
});

describe('deriveStandardExpense — status-driven standard-rate purchase', () => {
  it.each(DEDUCTS_INPUT)('%s: deducts 25 % input VAT, net to cost, gross to payable', (status) => {
    const v = deriveStandardExpense(øre(40_000), status, purchaseAccounts, INPUT);
    expect(v.type).toBe('purchase');
    expect(isBalanced(v)).toBe(true);
    expect(v.lines.find((l) => l.account === purchaseAccounts.cost)?.debit).toBe(40_000);
    expect(v.lines.find((l) => l.account === purchaseAccounts.inputVat)?.debit).toBe(10_000);
    expect(v.lines.find((l) => l.account === purchaseAccounts.payable)?.credit).toBe(50_000);
    expect(v.lines.find((l) => l.account === purchaseAccounts.cost)?.vatCode).toBe(INPUT);
  });

  it.each(NO_DEDUCTION)('%s: no deduction — gross booked to cost (2 legs)', (status) => {
    const v = deriveStandardExpense(øre(40_000), status, purchaseAccounts, INPUT);
    expect(isBalanced(v)).toBe(true);
    expect(v.lines).toHaveLength(2);
    expect(v.lines.some((l) => l.account === purchaseAccounts.inputVat)).toBe(false);
    // Gross == net here (no VAT added), booked to cost.
    expect(v.lines.find((l) => l.account === purchaseAccounts.cost)?.debit).toBe(40_000);
  });
});

describe('balance is total across every status (property)', () => {
  const status = () => fc.constantFrom(...MVA_STATUSES);
  const amount = () => fc.integer({ min: 1, max: 1_000_000_000 }).map((n) => øre(n));

  it('income always balances', () => {
    fc.assert(
      fc.property(amount(), status(), (net, s) => {
        const r = deriveStandardIncome(net, s, salesAccounts, OUTPUT);
        expect(r.ok && isBalanced(r.voucher)).toBe(true);
      }),
    );
  });

  it('expense always balances', () => {
    fc.assert(
      fc.property(amount(), status(), (net, s) => {
        expect(isBalanced(deriveStandardExpense(net, s, purchaseAccounts, INPUT))).toBe(true);
      }),
    );
  });
});
