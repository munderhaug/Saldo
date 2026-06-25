import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { addØre, mulRate, sumØre, øre, rate, type Øre } from '../money/ore.js';
import { MVA_STATUSES, chargesOutputVat, type MvaStatus } from '../vat/status.js';
import { isBalanced, totalCredit, totalDebit } from './balance.js';
import type { AccountNo, VatCode } from './types.js';
import { deriveSalesInvoice, reverseVoucher, type SalesInvoiceLine } from './sales-invoice.js';

const acc = (s: string): AccountNo => s as AccountNo;
const code = (s: string): VatCode => s as VatCode;
const RECEIVABLE = acc('1500');
const STANDARD = rate(0.25);
const REDUCED_LOW = rate(0.12);
const ZERO_RATE = rate(0);

/** A 25 % output line on revenue 3000 / output VAT 2700. */
const standardLine = (net: number): SalesInvoiceLine => ({
  net: øre(net),
  vatRate: STANDARD,
  revenue: acc('3000'),
  outputVat: acc('2700'),
  vatCode: code('3'),
});

describe('deriveSalesInvoice — the AR voucher', () => {
  it('registered_standard, one 25 % line: receivable gross / revenue net / output VAT', () => {
    const r = deriveSalesInvoice({
      receivable: RECEIVABLE,
      status: 'registered_standard',
      lines: [standardLine(100_000)],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.voucher.type).toBe('sales');
    expect(isBalanced(r.voucher)).toBe(true);
    const recv = r.voucher.lines.find((l) => l.account === RECEIVABLE);
    const rev = r.voucher.lines.find((l) => l.account === '3000');
    const vat = r.voucher.lines.find((l) => l.account === '2700');
    expect(recv?.debit).toBe(125_000);
    expect(rev?.credit).toBe(100_000);
    expect(rev?.vatCode).toBe('3');
    expect(vat?.credit).toBe(25_000);
    expect(vat?.vatCode).toBe('3');
  });

  it('merges lines sharing an account+code into one revenue and one VAT credit', () => {
    const r = deriveSalesInvoice({
      receivable: RECEIVABLE,
      status: 'registered_standard',
      lines: [standardLine(100_000), standardLine(40_000)],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // One receivable, one merged revenue, one merged VAT — not six legs.
    expect(r.voucher.lines).toHaveLength(3);
    expect(r.voucher.lines.find((l) => l.account === RECEIVABLE)?.debit).toBe(175_000);
    expect(r.voucher.lines.find((l) => l.account === '3000')?.credit).toBe(140_000);
    expect(r.voucher.lines.find((l) => l.account === '2700')?.credit).toBe(35_000);
  });

  it('keeps distinct revenue accounts and distinct VAT rates as separate legs', () => {
    const r = deriveSalesInvoice({
      receivable: RECEIVABLE,
      status: 'registered_standard',
      lines: [
        standardLine(100_000),
        {
          net: øre(50_000),
          vatRate: REDUCED_LOW,
          revenue: acc('3100'),
          outputVat: acc('2703'),
          vatCode: code('33'),
        },
      ],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(isBalanced(r.voucher)).toBe(true);
    expect(r.voucher.lines.find((l) => l.account === '3100')?.credit).toBe(50_000);
    expect(r.voucher.lines.find((l) => l.account === '2703')?.credit).toBe(6_000); // 50 000 × 12 %
    // receivable = 125 000 + 56 000
    expect(r.voucher.lines.find((l) => l.account === RECEIVABLE)?.debit).toBe(181_000);
  });

  it('a zero-rated line (registered) posts revenue at net with NO VAT leg', () => {
    const r = deriveSalesInvoice({
      receivable: RECEIVABLE,
      status: 'registered_zero_rated',
      lines: [
        {
          net: øre(80_000),
          vatRate: ZERO_RATE,
          revenue: acc('3000'),
          outputVat: acc('2700'),
          vatCode: code('5'),
        },
      ],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.voucher.lines).toHaveLength(2); // receivable + revenue only
    expect(r.voucher.lines.some((l) => l.account === '2700')).toBe(false);
    expect(r.voucher.lines.find((l) => l.account === RECEIVABLE)?.debit).toBe(80_000);
  });

  it.each(['under_threshold', 'unntatt'] as const)(
    '%s org books a plain net sale (no VAT, revenue uncoded)',
    (status) => {
      const r = deriveSalesInvoice({
        receivable: RECEIVABLE,
        status,
        lines: [
          {
            net: øre(50_000),
            vatRate: ZERO_RATE,
            revenue: acc('3000'),
            outputVat: acc('2700'),
            vatCode: code('6'),
          },
        ],
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.voucher.lines).toHaveLength(2);
      expect(r.voucher.lines.find((l) => l.account === RECEIVABLE)?.debit).toBe(50_000);
      expect(r.voucher.lines.find((l) => l.account === '3000')?.credit).toBe(50_000);
    },
  );

  it('propagates the hard block when a non-registered org carries an output-VAT line', () => {
    const r = deriveSalesInvoice({
      receivable: RECEIVABLE,
      status: 'under_threshold',
      lines: [standardLine(100_000)], // 25 % on an unregistered org
    });
    expect(r.ok).toBe(false);
  });

  // Property: for any mix of lines an org may legally post, the voucher balances and its receivable
  // debit equals the document gross (Σ net + Σ chargeable VAT).
  it('is always balanced and ties the receivable to the document gross', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<MvaStatus>(...MVA_STATUSES),
        fc.array(fc.integer({ min: 1, max: 1_000_000 }), { minLength: 1, maxLength: 8 }),
        (status, nets) => {
          // Only registered orgs may charge VAT; everyone else posts at a zero rate.
          const vatRate =
            chargesOutputVat(status) && status === 'registered_standard' ? STANDARD : ZERO_RATE;
          const lines: SalesInvoiceLine[] = nets.map((n) => ({
            net: øre(n),
            vatRate,
            revenue: acc('3000'),
            outputVat: acc('2700'),
            vatCode: code(vatRate === ZERO_RATE ? '6' : '3'),
          }));
          const r = deriveSalesInvoice({ receivable: RECEIVABLE, status, lines });
          expect(r.ok).toBe(true);
          if (!r.ok) return;
          expect(isBalanced(r.voucher)).toBe(true);
          const expectedGross = lines.reduce<Øre>(
            (acc2, l) => addØre(acc2, addØre(l.net, mulRate(l.net, l.vatRate))),
            øre(0),
          );
          expect(r.voucher.lines.find((l) => l.account === RECEIVABLE)?.debit).toBe(expectedGross);
        },
      ),
    );
  });
});

describe('reverseVoucher — the credit-note motbilag', () => {
  it('swaps every leg and stays balanced, recording what it reverses', () => {
    const base = deriveSalesInvoice({
      receivable: RECEIVABLE,
      status: 'registered_standard',
      lines: [standardLine(100_000)],
    });
    expect(base.ok).toBe(true);
    if (!base.ok) return;
    const motbilag = reverseVoucher(base.voucher, 'voucher-1');
    expect(motbilag.type).toBe('reversal');
    expect(motbilag.reversesVoucherId).toBe('voucher-1');
    expect(isBalanced(motbilag)).toBe(true);
    // Debit and credit totals are preserved (swapped), so the net economic effect cancels the original.
    expect(totalDebit(motbilag)).toBe(totalCredit(base.voucher));
    expect(totalCredit(motbilag)).toBe(totalDebit(base.voucher));
    // The receivable is now a CREDIT (reduces what the customer owes).
    expect(motbilag.lines.find((l) => l.account === RECEIVABLE)?.credit).toBe(125_000);
    // The output-VAT leg keeps its code, now on the debit side (reduces the VAT liability).
    const vat = motbilag.lines.find((l) => l.account === '2700');
    expect(vat?.debit).toBe(25_000);
    expect(vat?.vatCode).toBe('3');
  });

  it('reversing an arbitrary balanced sales voucher preserves balance and code (property)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 500_000 }), { minLength: 1, maxLength: 6 }),
        (nets) => {
          const base = deriveSalesInvoice({
            receivable: RECEIVABLE,
            status: 'registered_standard',
            lines: nets.map(standardLine),
          });
          if (!base.ok) return;
          const motbilag = reverseVoucher(base.voucher, 'v');
          expect(isBalanced(motbilag)).toBe(true);
          expect(sumØre(motbilag.lines.map((l) => l.credit))).toBe(totalDebit(base.voucher));
        },
      ),
    );
  });
});
