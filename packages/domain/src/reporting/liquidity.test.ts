import { describe, expect, it } from 'vitest';
import { øre } from '../money/ore.js';
import type { AccountNo } from '../posting/types.js';
import type { LedgerAccountBalance } from './account-balance.js';
import { buildLiquidity, isLiquidAccount } from './liquidity.js';

const bal = (number: string, debit: number, credit: number): LedgerAccountBalance => ({
  number: number as AccountNo,
  name: number,
  debitØre: øre(debit),
  creditØre: øre(credit),
});

describe('isLiquidAccount', () => {
  it('treats konto 19xx (bankinnskudd, kontanter) as liquid, nothing else', () => {
    expect(isLiquidAccount('1920')).toBe(true);
    expect(isLiquidAccount('1900')).toBe(true);
    expect(isLiquidAccount('1500')).toBe(false); // kundefordringer
    expect(isLiquidAccount('2400')).toBe(false);
  });

  it('excludes the restricted skattetrekk account (1950) — money held in trust', () => {
    expect(isLiquidAccount('1950')).toBe(false);
  });
});

describe('buildLiquidity', () => {
  it('cash is the debit balance of the liquid accounts only', () => {
    const r = buildLiquidity({
      balances: [
        bal('1920', 80_000, 5_000), // bank, net 75 000
        bal('1900', 2_000, 0), // kontanter
        bal('1500', 125_000, 0), // receivable — NOT cash
      ],
      outstandingReceivablesØre: øre(0),
      outstandingPayablesØre: øre(0),
    });
    expect(r.cashAccounts.map((c) => c.number)).toEqual(['1920', '1900']);
    expect(r.cashØre).toBe(øre(77_000));
    expect(r.projectedØre).toBe(øre(77_000));
  });

  it('the projected position adds receivables and subtracts payables', () => {
    const r = buildLiquidity({
      balances: [bal('1920', 50_000, 0)],
      outstandingReceivablesØre: øre(30_000),
      outstandingPayablesØre: øre(12_000),
    });
    expect(r.cashØre).toBe(øre(50_000));
    expect(r.projectedØre).toBe(øre(68_000)); // 50 000 + 30 000 − 12 000
  });

  it('an empty ledger yields a zero position', () => {
    const r = buildLiquidity({
      balances: [],
      outstandingReceivablesØre: øre(0),
      outstandingPayablesØre: øre(0),
    });
    expect(r.cashAccounts).toEqual([]);
    expect(r.cashØre).toBe(øre(0));
    expect(r.projectedØre).toBe(øre(0));
  });
});
