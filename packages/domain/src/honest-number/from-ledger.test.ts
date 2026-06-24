import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { addØre, subØre, øre, ZERO } from '../money/ore.js';
import { MVA_STATUSES, type MvaStatus, chargesOutputVat } from '../vat/status.js';
import { estimateEnkIncomeTax } from '../tax/income-estimate.js';
import { EMPTY_LEDGER_TOTALS, honestNumberFromLedger, type LedgerTotals } from './from-ledger.js';

const kr = (n: number) => øre(n * 100); // kroner → øre, for readable fixtures
const YEAR = 2026; // a committed tax-params year (ADR 0029)

describe('honestNumberFromLedger — ledger totals → "what\'s actually yours"', () => {
  it('reconstructs gross income from net revenue + output VAT', () => {
    const totals: LedgerTotals = {
      revenueNet: kr(160_000),
      expenseNet: ZERO,
      outputVatCollected: kr(40_000),
      deductibleInputVat: ZERO,
    };
    const r = honestNumberFromLedger(totals, YEAR, 'registered_standard');
    expect(r.income).toBe(kr(200_000)); // 160k net + 40k VAT = 200k taken in
    expect(r.vatHeld).toBe(kr(40_000));
  });

  it('feeds the income-tax estimate from profit = revenue − expense', () => {
    const totals: LedgerTotals = {
      revenueNet: kr(600_000),
      expenseNet: kr(150_000),
      outputVatCollected: ZERO,
      deductibleInputVat: ZERO,
    };
    const r = honestNumberFromLedger(totals, YEAR, 'under_threshold');
    expect(r.profit).toBe(kr(450_000));
    expect(r.tax).toEqual(estimateEnkIncomeTax(kr(450_000), YEAR));
    expect(r.estimatedTax).toBe(r.tax.total);
  });

  it('nets deductible input VAT off the VAT held', () => {
    const totals: LedgerTotals = {
      revenueNet: kr(160_000),
      expenseNet: kr(40_000),
      outputVatCollected: kr(40_000),
      deductibleInputVat: kr(10_000),
    };
    const r = honestNumberFromLedger(totals, YEAR, 'registered_standard');
    expect(r.vatHeld).toBe(kr(30_000)); // 40k output − 10k deductible input
  });

  it('holds no VAT for an unregistered org (no output leg in a correct ledger)', () => {
    const totals: LedgerTotals = {
      revenueNet: kr(120_000),
      expenseNet: kr(20_000),
      outputVatCollected: ZERO,
      deductibleInputVat: ZERO,
    };
    const r = honestNumberFromLedger(totals, YEAR, 'under_threshold');
    expect(r.vatHeld).toBe(ZERO);
    expect(r.income).toBe(kr(120_000));
  });

  it('estimates zero tax on a loss (expense exceeds revenue)', () => {
    const totals: LedgerTotals = {
      revenueNet: kr(50_000),
      expenseNet: kr(80_000),
      outputVatCollected: ZERO,
      deductibleInputVat: ZERO,
    };
    const r = honestNumberFromLedger(totals, YEAR, 'under_threshold');
    expect(r.profit).toBe(kr(-30_000));
    expect(r.tax.total).toBe(ZERO);
    expect(r.spendable).toBe(kr(50_000)); // all income is yours when there's no tax/VAT to fence off
  });

  it('an empty ledger reveals zero across the board (the "caught up" state)', () => {
    const r = honestNumberFromLedger(EMPTY_LEDGER_TOTALS, YEAR, 'registered_standard');
    expect(r.income).toBe(ZERO);
    expect(r.vatHeld).toBe(ZERO);
    expect(r.estimatedTax).toBe(ZERO);
    expect(r.spendable).toBe(ZERO);
    expect(r.profit).toBe(ZERO);
  });

  // ── Properties (fast-check) ──
  const øreArb = fc.integer({ min: 0, max: 5_000_000_00 }).map((n) => øre(n));
  const statusArb = fc.constantFrom<MvaStatus>(...MVA_STATUSES);
  const totalsArb = fc.record({
    revenueNet: øreArb,
    expenseNet: øreArb,
    outputVatCollected: øreArb,
    deductibleInputVat: øreArb,
  });

  it('property: income is exactly net revenue + output VAT', () => {
    fc.assert(
      fc.property(totalsArb, statusArb, (totals, status) => {
        const r = honestNumberFromLedger(totals, YEAR, status);
        expect(r.income).toBe(addØre(totals.revenueNet, totals.outputVatCollected));
      }),
    );
  });

  it('property: profit is exactly revenue − expense', () => {
    fc.assert(
      fc.property(totalsArb, statusArb, (totals, status) => {
        const r = honestNumberFromLedger(totals, YEAR, status);
        expect(r.profit).toBe(subØre(totals.revenueNet, totals.expenseNet));
      }),
    );
  });

  it('property: the estimate matches the standalone ENK estimator on the same profit', () => {
    fc.assert(
      fc.property(totalsArb, statusArb, (totals, status) => {
        const r = honestNumberFromLedger(totals, YEAR, status);
        expect(r.tax).toEqual(estimateEnkIncomeTax(r.profit, YEAR));
      }),
    );
  });

  it('property: spendable is never negative, never exceeds income; unregistered holds no VAT', () => {
    fc.assert(
      fc.property(totalsArb, statusArb, (totals, status) => {
        const r = honestNumberFromLedger(totals, YEAR, status);
        expect(r.spendable >= ZERO).toBe(true);
        expect(r.spendable <= r.income).toBe(true);
        if (!chargesOutputVat(status)) expect(r.vatHeld).toBe(ZERO);
      }),
    );
  });
});
