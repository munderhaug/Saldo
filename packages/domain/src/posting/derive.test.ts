import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { isZeroØre, mulRate, øre, rate, type Rate } from '../money/ore.js';
import { MVA_STATUSES, type MvaStatus } from '../vat/status.js';
import { isBalanced, totalCredit, totalDebit } from './balance.js';
import type { AccountNo } from './types.js';
import { derivePurchase, deriveSales } from './derive.js';

const acc = (s: string): AccountNo => s as AccountNo;
const purchaseAccounts = {
  cost: acc('6000'),
  inputVat: acc('2710'),
  payable: acc('2400'),
};
const salesAccounts = {
  receivable: acc('1500'),
  revenue: acc('3000'),
  outputVat: acc('2700'),
};

const STANDARD = rate(0.25);
const ZERO_RATE = rate(0);

describe('derivePurchase — the input-VAT fork', () => {
  it('registered_standard: splits deductible input VAT, books net to cost', () => {
    const v = derivePurchase({
      net: øre(100_000),
      vatRate: STANDARD,
      status: 'registered_standard',
      accounts: purchaseAccounts,
    });
    expect(v.type).toBe('purchase');
    expect(isBalanced(v)).toBe(true);
    const cost = v.lines.find((l) => l.account === purchaseAccounts.cost);
    const vat = v.lines.find((l) => l.account === purchaseAccounts.inputVat);
    const payable = v.lines.find((l) => l.account === purchaseAccounts.payable);
    expect(cost?.debit).toBe(100_000);
    expect(vat?.debit).toBe(25_000);
    expect(payable?.credit).toBe(125_000);
  });

  it('registered_zero_rated: no input-VAT line when the rate is zero', () => {
    const v = derivePurchase({
      net: øre(100_000),
      vatRate: ZERO_RATE,
      status: 'registered_zero_rated',
      accounts: purchaseAccounts,
    });
    expect(isBalanced(v)).toBe(true);
    expect(v.lines).toHaveLength(2);
    expect(v.lines.some((l) => l.account === purchaseAccounts.inputVat)).toBe(false);
  });

  it.each(['under_threshold', 'unntatt'] as const)(
    '%s: no deduction — the gross is booked to the cost account',
    (status) => {
      const v = derivePurchase({
        net: øre(100_000),
        vatRate: STANDARD,
        status,
        accounts: purchaseAccounts,
      });
      expect(isBalanced(v)).toBe(true);
      expect(v.lines).toHaveLength(2);
      const cost = v.lines.find((l) => l.account === purchaseAccounts.cost);
      expect(cost?.debit).toBe(125_000); // gross, not net
      expect(v.lines.some((l) => l.account === purchaseAccounts.inputVat)).toBe(false);
    },
  );

  it('registered but non-deductible (representasjon / uten fradragsrett): books gross to cost', () => {
    const v = derivePurchase({
      net: øre(100_000),
      vatRate: STANDARD,
      status: 'registered_standard',
      deductible: false,
      accounts: purchaseAccounts,
    });
    expect(isBalanced(v)).toBe(true);
    expect(v.lines).toHaveLength(2);
    const cost = v.lines.find((l) => l.account === purchaseAccounts.cost);
    expect(cost?.debit).toBe(125_000); // gross, no input-VAT split
    expect(v.lines.some((l) => l.account === purchaseAccounts.inputVat)).toBe(false);
  });

  it('registered: VAT that rounds to 0 øre yields no input-VAT line', () => {
    // net 1 øre × 12 % = 0.12 øre → rounds to 0; no separate VAT line.
    const v = derivePurchase({
      net: øre(1),
      vatRate: rate(0.12),
      status: 'registered_standard',
      accounts: purchaseAccounts,
    });
    expect(isBalanced(v)).toBe(true);
    expect(v.lines).toHaveLength(2);
    expect(v.lines.some((l) => l.account === purchaseAccounts.inputVat)).toBe(false);
  });

  it('property: every purchase voucher balances, for every status and rate', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100_000_000 }),
        fc.constantFrom<MvaStatus>(...MVA_STATUSES),
        fc.constantFrom<Rate>(ZERO_RATE, rate(0.12), rate(0.15), STANDARD),
        (netValue, status, vatRate) => {
          const v = derivePurchase({
            net: øre(netValue),
            vatRate,
            status,
            accounts: purchaseAccounts,
          });
          expect(isBalanced(v)).toBe(true);
          // Total either way equals the gross the supplier is paid.
          expect(totalDebit(v)).toBe(totalCredit(v));
        },
      ),
    );
  });
});

describe('deriveSales — output VAT only when registered', () => {
  it('registered_standard: charges output VAT', () => {
    const r = deriveSales({
      net: øre(100_000),
      vatRate: STANDARD,
      status: 'registered_standard',
      accounts: salesAccounts,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(isBalanced(r.voucher)).toBe(true);
    const out = r.voucher.lines.find((l) => l.account === salesAccounts.outputVat);
    const recv = r.voucher.lines.find((l) => l.account === salesAccounts.receivable);
    expect(out?.credit).toBe(25_000);
    expect(recv?.debit).toBe(125_000);
  });

  it('registered_zero_rated: no output-VAT line', () => {
    const r = deriveSales({
      net: øre(100_000),
      vatRate: ZERO_RATE,
      status: 'registered_zero_rated',
      accounts: salesAccounts,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.voucher.lines.some((l) => l.account === salesAccounts.outputVat)).toBe(false);
  });

  it.each(['under_threshold', 'unntatt'] as const)(
    '%s: hard-blocks an attempt to charge output VAT',
    (status) => {
      const r = deriveSales({
        net: øre(100_000),
        vatRate: STANDARD,
        status,
        accounts: salesAccounts,
      });
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.error).toMatch(/not VAT-registered/i);
    },
  );

  it.each(['under_threshold', 'unntatt'] as const)(
    '%s: a zero-rate sale posts net with no MVA',
    (status) => {
      const r = deriveSales({
        net: øre(100_000),
        vatRate: ZERO_RATE,
        status,
        accounts: salesAccounts,
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(isBalanced(r.voucher)).toBe(true);
      expect(r.voucher.lines.some((l) => l.account === salesAccounts.outputVat)).toBe(false);
    },
  );

  it('property: a registered sale always balances; a non-registered sale rejects non-zero VAT', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100_000_000 }),
        fc.constantFrom<MvaStatus>(...MVA_STATUSES),
        fc.constantFrom<Rate>(rate(0.12), rate(0.15), STANDARD),
        (netValue, status, vatRate) => {
          const r = deriveSales({
            net: øre(netValue),
            vatRate,
            status,
            accounts: salesAccounts,
          });
          if (status === 'registered_standard' || status === 'registered_zero_rated') {
            expect(r.ok).toBe(true);
            if (r.ok) expect(isBalanced(r.voucher)).toBe(true);
          } else {
            // Not registered: blocked iff the rate actually produces VAT. A tiny net whose
            // VAT rounds to 0 øre charges no MVA, so it is allowed (and balances).
            const chargesVat = !isZeroØre(mulRate(øre(netValue), vatRate));
            expect(r.ok).toBe(!chargesVat);
            if (r.ok) expect(isBalanced(r.voucher)).toBe(true);
          }
        },
      ),
    );
  });
});
