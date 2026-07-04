import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { isZeroØre, mulRate, øre, rate, sumØre, type Rate } from '../money/ore.js';
import { MVA_STATUSES, type MvaStatus } from '../vat/status.js';
import { isBalanced, totalCredit, totalDebit } from './balance.js';
import type { AccountNo } from './types.js';
import { derivePurchase, deriveReverseChargePurchase, deriveSales } from './derive.js';
import type { VatCode } from './types.js';

const acc = (s: string): AccountNo => s as AccountNo;
const vc = (s: string): VatCode => s as VatCode;
const purchaseAccounts = {
  cost: acc('6000'),
  inputVat: acc('2710'),
  payable: acc('2400'),
};
// Foreign-service reverse charge, regular rate: self-account output 2704, deduct input 2714.
const rcAccounts = {
  cost: acc('6700'),
  payable: acc('2400'),
  outputVat: acc('2704'),
  inputVat: acc('2714'),
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

describe('deriveReverseChargePurchase — dual-leg snudd avregning', () => {
  it('registered + deductible: posts BOTH legs, net to cost, net cash = net', () => {
    const v = deriveReverseChargePurchase({
      net: øre(100_000),
      vatRate: STANDARD,
      status: 'registered_standard',
      accounts: rcAccounts,
      deductible: true,
      outputVatCode: vc('3'),
      inputVatCode: vc('86'),
    });
    expect(v.type).toBe('purchase');
    expect(isBalanced(v)).toBe(true);
    // 4 legs: cost 100 000 dr / input VAT 2714 25 000 dr / payable 100 000 cr / output VAT 2704 25 000 cr.
    expect(v.lines).toHaveLength(4);
    expect(v.lines.find((l) => l.account === rcAccounts.cost)?.debit).toBe(100_000);
    expect(v.lines.find((l) => l.account === rcAccounts.inputVat)?.debit).toBe(25_000);
    expect(v.lines.find((l) => l.account === rcAccounts.payable)?.credit).toBe(100_000); // only the net
    expect(v.lines.find((l) => l.account === rcAccounts.outputVat)?.credit).toBe(25_000);
    // BOTH VAT legs are present on the melding even though their net cash effect cancels.
    expect(totalDebit(v)).toBe(125_000);
    expect(totalCredit(v)).toBe(125_000);
  });

  it('tags each VAT leg with a direction-correct code so both land on the MVA basis', () => {
    const v = deriveReverseChargePurchase({
      net: øre(100_000),
      vatRate: STANDARD,
      status: 'registered_standard',
      accounts: rcAccounts,
      deductible: true,
      outputVatCode: vc('3'),
      inputVatCode: vc('86'),
    });
    expect(v.lines.find((l) => l.account === rcAccounts.outputVat)?.vatCode).toBe('3'); // output side
    expect(v.lines.find((l) => l.account === rcAccounts.inputVat)?.vatCode).toBe('86'); // input side
  });

  it('registered + NON-deductible (uten fradragsrett): VAT joins cost, output leg still posts', () => {
    const v = deriveReverseChargePurchase({
      net: øre(100_000),
      vatRate: STANDARD,
      status: 'registered_standard',
      accounts: rcAccounts,
      deductible: false,
      outputVatCode: vc('3'),
      inputVatCode: vc('87'),
    });
    expect(isBalanced(v)).toBe(true);
    // 4 legs: cost NET 100 000 (coded 87) + cost VAT 25 000 (uncoded) dr / payable 100 000 cr /
    // output VAT 25 000 cr. The irrecoverable VAT joins cost but never the coded basis.
    expect(v.lines).toHaveLength(4);
    const costLines = v.lines.filter((l) => l.account === rcAccounts.cost);
    expect(sumØre(costLines.map((l) => l.debit))).toBe(125_000); // total cost still gross
    // The code-bearing cost line carries the NET (the melding grunnlag), VAT joins an UNCODED line.
    expect(costLines.find((l) => l.vatCode === '87')?.debit).toBe(100_000);
    expect(costLines.find((l) => l.vatCode === undefined)?.debit).toBe(25_000);
    expect(v.lines.some((l) => l.account === rcAccounts.inputVat)).toBe(false); // no deduction
    expect(v.lines.find((l) => l.account === rcAccounts.outputVat)?.credit).toBe(25_000); // still owed
  });

  it.each(['under_threshold', 'unntatt'] as const)(
    '%s: outside the VAT system — a plain net purchase, no melding legs',
    (status) => {
      const v = deriveReverseChargePurchase({
        net: øre(100_000),
        vatRate: STANDARD,
        status,
        accounts: rcAccounts,
        deductible: true,
        outputVatCode: vc('3'),
        inputVatCode: vc('86'),
      });
      expect(isBalanced(v)).toBe(true);
      expect(v.lines).toHaveLength(2);
      expect(v.lines.find((l) => l.account === rcAccounts.cost)?.debit).toBe(100_000); // net only
      expect(v.lines.some((l) => l.account.startsWith('27'))).toBe(false); // no VAT legs
    },
  );

  it('a zero-rate reverse-charge code (e.g. 85) posts a plain net purchase', () => {
    const v = deriveReverseChargePurchase({
      net: øre(100_000),
      vatRate: ZERO_RATE,
      status: 'registered_standard',
      accounts: rcAccounts,
      deductible: true,
      inputVatCode: vc('85'),
    });
    expect(isBalanced(v)).toBe(true);
    expect(v.lines).toHaveLength(2);
    expect(v.lines.some((l) => l.account.startsWith('27'))).toBe(false);
  });

  it('property: every reverse-charge purchase balances; net VAT cancels iff deductible', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100_000_000 }),
        fc.constantFrom<MvaStatus>(...MVA_STATUSES),
        fc.constantFrom<Rate>(ZERO_RATE, rate(0.12), rate(0.15), STANDARD),
        fc.boolean(),
        (netValue, status, vatRate, deductible) => {
          const v = deriveReverseChargePurchase({
            net: øre(netValue),
            vatRate,
            status,
            accounts: rcAccounts,
            deductible,
            outputVatCode: vc('3'),
            inputVatCode: vc('86'),
          });
          expect(isBalanced(v)).toBe(true);
          expect(totalDebit(v)).toBe(totalCredit(v));
          const out = v.lines.find((l) => l.account === rcAccounts.outputVat)?.credit ?? øre(0);
          const inp = v.lines.find((l) => l.account === rcAccounts.inputVat)?.debit ?? øre(0);
          // A registered, deductible purchase self-accounts AND deducts the same VAT → both legs equal.
          if (
            status === 'registered_standard' &&
            deductible &&
            !isZeroØre(mulRate(øre(netValue), vatRate))
          ) {
            expect(out).toBe(inp);
            expect(out).toBeGreaterThan(0);
          }
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

describe('negative-amount guard (review 2026-07-03 §10)', () => {
  const accounts = {
    cost: '4000' as AccountNo,
    inputVat: '2710' as AccountNo,
    payable: '2400' as AccountNo,
  };
  const salesAccounts = {
    receivable: '1500' as AccountNo,
    revenue: '3000' as AccountNo,
    outputVat: '2700' as AccountNo,
  };

  it('derivePurchase throws on a negative net (a correction is a motbilag)', () => {
    expect(() =>
      derivePurchase({
        net: øre(-100),
        vatRate: rate(0.25),
        status: 'registered_standard',
        accounts,
      }),
    ).toThrow(RangeError);
  });

  it('deriveSales refuses a negative net typed (never a flipped voucher)', () => {
    const r = deriveSales({
      net: øre(-100),
      vatRate: rate(0.25),
      status: 'registered_standard',
      accounts: salesAccounts,
    });
    expect(r.ok).toBe(false);
  });
});
