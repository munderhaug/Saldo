import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { addØre, mulRate, øre, rate, sumØre, ZERO, type Rate } from '../money/ore.js';
import { MVA_STATUSES, type MvaStatus } from '../vat/status.js';
import { isBalanced, totalCredit, totalDebit } from './balance.js';
import { derivePurchaseInvoice, type PurchaseInvoiceLine } from './purchase-invoice.js';
import type { AccountNo, VatCode } from './types.js';

const acc = (s: string): AccountNo => s as AccountNo;
const vc = (s: string): VatCode => s as VatCode;

const PAYABLE = acc('2400');
const COST_A = acc('6000');
const COST_B = acc('6790');
const INPUT_VAT = acc('2710');
// Foreign-service reverse charge, regular rate.
const RC_COST = acc('6700');
const RC_OUTPUT = acc('2704');
const RC_INPUT = acc('2714');

const STANDARD = rate(0.25);
const ZERO_RATE = rate(0);

const ordinary = (
  net: number,
  vatRate: Rate,
  cost: AccountNo,
  deductible = true,
): PurchaseInvoiceLine => ({
  net: øre(net),
  vatRate,
  cost,
  inputVat: INPUT_VAT,
  deductible,
  vatCode: vc('1'),
});

const find = (lines: ReturnType<typeof derivePurchaseInvoice>['lines'], account: AccountNo) =>
  lines.find((l) => l.account === account);

describe('derivePurchaseInvoice — the AP voucher (multi-line input-VAT fork)', () => {
  it('registered_standard, one deductible line: splits input VAT, books net to cost, one gross payable', () => {
    const v = derivePurchaseInvoice({
      payable: PAYABLE,
      status: 'registered_standard',
      lines: [ordinary(100_000, STANDARD, COST_A)],
    });
    expect(v.type).toBe('purchase');
    expect(isBalanced(v)).toBe(true);
    expect(find(v.lines, COST_A)?.debit).toBe(100_000);
    expect(find(v.lines, INPUT_VAT)?.debit).toBe(25_000);
    expect(find(v.lines, PAYABLE)?.credit).toBe(125_000);
  });

  it('registered but non-deductible (representasjon/vehicle/private use): books gross to cost, no split', () => {
    const v = derivePurchaseInvoice({
      payable: PAYABLE,
      status: 'registered_standard',
      lines: [ordinary(100_000, STANDARD, COST_A, false)],
    });
    expect(isBalanced(v)).toBe(true);
    expect(find(v.lines, COST_A)?.debit).toBe(125_000); // gross
    expect(find(v.lines, INPUT_VAT)).toBeUndefined();
    expect(find(v.lines, PAYABLE)?.credit).toBe(125_000);
  });

  it.each(['under_threshold', 'unntatt'] as const)(
    '%s: no deduction — gross to cost, payable still the supplier gross',
    (status) => {
      const v = derivePurchaseInvoice({
        payable: PAYABLE,
        status,
        lines: [ordinary(100_000, STANDARD, COST_A)],
      });
      expect(isBalanced(v)).toBe(true);
      expect(find(v.lines, COST_A)?.debit).toBe(125_000);
      expect(find(v.lines, INPUT_VAT)).toBeUndefined();
      expect(find(v.lines, PAYABLE)?.credit).toBe(125_000);
    },
  );

  it('merges distinct cost accounts but folds every line into ONE payable credit', () => {
    const v = derivePurchaseInvoice({
      payable: PAYABLE,
      status: 'registered_standard',
      lines: [ordinary(100_000, STANDARD, COST_A), ordinary(40_000, STANDARD, COST_B)],
    });
    expect(isBalanced(v)).toBe(true);
    expect(find(v.lines, COST_A)?.debit).toBe(100_000);
    expect(find(v.lines, COST_B)?.debit).toBe(40_000);
    expect(find(v.lines, INPUT_VAT)?.debit).toBe(35_000); // 25 000 + 10 000 merged
    expect(find(v.lines, PAYABLE)?.credit).toBe(175_000); // (125 000 + 50 000)
    expect(v.lines.filter((l) => l.account === PAYABLE)).toHaveLength(1);
  });

  it('merges two lines on the SAME cost account into one debit', () => {
    const v = derivePurchaseInvoice({
      payable: PAYABLE,
      status: 'registered_standard',
      lines: [ordinary(100_000, STANDARD, COST_A), ordinary(30_000, STANDARD, COST_A)],
    });
    expect(v.lines.filter((l) => l.account === COST_A)).toHaveLength(1);
    expect(find(v.lines, COST_A)?.debit).toBe(130_000);
    expect(isBalanced(v)).toBe(true);
  });

  it('a reverse-charge line self-accounts both legs; the supplier credit is only the net', () => {
    const v = derivePurchaseInvoice({
      payable: PAYABLE,
      status: 'registered_standard',
      lines: [
        {
          reverseCharge: true,
          net: øre(100_000),
          vatRate: STANDARD,
          cost: RC_COST,
          outputVat: RC_OUTPUT,
          inputVat: RC_INPUT,
          deductible: true,
          outputVatCode: vc('3'),
          inputVatCode: vc('86'),
        },
      ],
    });
    expect(isBalanced(v)).toBe(true);
    expect(find(v.lines, RC_COST)?.debit).toBe(100_000);
    expect(find(v.lines, RC_INPUT)?.debit).toBe(25_000);
    expect(find(v.lines, RC_OUTPUT)?.credit).toBe(25_000);
    expect(find(v.lines, PAYABLE)?.credit).toBe(100_000); // net only — the supplier never invoices the VAT
  });

  it('mixes an ordinary line and a reverse-charge line in one balanced voucher', () => {
    const v = derivePurchaseInvoice({
      payable: PAYABLE,
      status: 'registered_standard',
      lines: [
        ordinary(100_000, STANDARD, COST_A),
        {
          reverseCharge: true,
          net: øre(50_000),
          vatRate: STANDARD,
          cost: RC_COST,
          outputVat: RC_OUTPUT,
          inputVat: RC_INPUT,
          deductible: true,
          outputVatCode: vc('3'),
          inputVatCode: vc('86'),
        },
      ],
    });
    expect(isBalanced(v)).toBe(true);
    // The single payable credit = ordinary gross (125 000) + reverse-charge net (50 000).
    expect(find(v.lines, PAYABLE)?.credit).toBe(175_000);
  });

  it('property: every AP voucher balances; the payable credit is Σ(ordinary gross) + Σ(reverse-charge net)', () => {
    const RATES: readonly Rate[] = [ZERO_RATE, rate(0.12), rate(0.15), STANDARD];
    const lineSpec = fc.record({
      reverse: fc.boolean(),
      net: fc.integer({ min: 1, max: 50_000_000 }),
      vatRate: fc.constantFrom(...RATES),
      deductible: fc.boolean(),
    });
    fc.assert(
      fc.property(
        fc.constantFrom<MvaStatus>(...MVA_STATUSES),
        fc.array(lineSpec, { minLength: 1, maxLength: 6 }),
        (status, specs) => {
          const lines: PurchaseInvoiceLine[] = specs.map((s) =>
            s.reverse
              ? {
                  reverseCharge: true,
                  net: øre(s.net),
                  vatRate: s.vatRate,
                  cost: RC_COST,
                  outputVat: RC_OUTPUT,
                  inputVat: RC_INPUT,
                  deductible: s.deductible,
                  outputVatCode: vc('3'),
                  inputVatCode: vc('86'),
                }
              : ordinary(s.net, s.vatRate, COST_A, s.deductible),
          );
          const v = derivePurchaseInvoice({ payable: PAYABLE, status, lines });
          expect(isBalanced(v)).toBe(true);
          expect(totalDebit(v)).toBe(totalCredit(v));
          const expectedPayable = sumØre(
            specs.map((s) =>
              s.reverse ? øre(s.net) : addØre(øre(s.net), mulRate(øre(s.net), s.vatRate)),
            ),
          );
          const payable = find(v.lines, PAYABLE)?.credit ?? ZERO;
          expect(payable).toBe(expectedPayable);
        },
      ),
    );
  });
});
