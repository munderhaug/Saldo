import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { addØre, subØre, ZERO, øre, type Øre } from '../money/ore.js';
import type { AccountNo } from './types.js';
import type { LedgerAccountBalance } from '../reporting/account-balance.js';
import { deriveYearEndClose, isClosedByYearEnd } from './year-end.js';

const acc = (n: string): AccountNo => n as AccountNo;
const EQUITY = acc('2050');

const bal = (number: string, debit: number, credit: number): LedgerAccountBalance => ({
  number: acc(number),
  name: number,
  debitØre: øre(debit),
  creditØre: øre(credit),
});

/** Σ debit − Σ credit over a voucher's lines. */
function voucherImbalance(lines: readonly { debit: Øre; credit: Øre }[]): Øre {
  let diff: Øre = ZERO;
  for (const line of lines) diff = addØre(diff, subØre(line.debit, line.credit));
  return diff;
}

describe('isClosedByYearEnd — the result side of the ledger', () => {
  it('closes kontoklasse 3–8 (finans AND ≥8800 dispositions), never 1–2', () => {
    for (const closed of ['3000', '4000', '5000', '6000', '7000', '8050', '8800', '8910']) {
      expect(isClosedByYearEnd(acc(closed)), closed).toBe(true);
    }
    for (const kept of ['1920', '1500', '2050', '2400', '2740']) {
      expect(isClosedByYearEnd(acc(kept)), kept).toBe(false);
    }
  });
});

describe('deriveYearEndClose — exhaustive cases', () => {
  it('empties every result account and plugs the net to equity (income year)', () => {
    const result = deriveYearEndClose(
      [
        bal('1920', 100_000, 0), // balance account — untouched
        bal('3000', 0, 100_000), // income
        bal('6300', 20_000, 0), // cost
        bal('8910', 30_000, 0), // privatuttak (≥8800 disposition — also closed)
      ],
      EQUITY,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.voucher.type).toBe('year_end');
    expect(result.voucher.lines).toEqual([
      { account: acc('3000'), debit: øre(100_000), credit: ZERO }, // reverses the credit net
      { account: acc('6300'), debit: ZERO, credit: øre(20_000) },
      { account: acc('8910'), debit: ZERO, credit: øre(30_000) },
      { account: EQUITY, debit: ZERO, credit: øre(50_000) }, // result − drawings → equity
    ]);
    expect(voucherImbalance(result.voucher.lines)).toBe(ZERO);
  });

  it('plugs a loss year as an equity debit', () => {
    const result = deriveYearEndClose([bal('3000', 0, 10_000), bal('6300', 25_000, 0)], EQUITY);
    if (!result.ok) throw new Error('close failed');
    expect(result.voucher.lines.at(-1)).toEqual({
      account: EQUITY,
      debit: øre(15_000),
      credit: ZERO,
    });
  });

  it('skips zero-net result accounts and omits the plug when reversals balance exactly', () => {
    const result = deriveYearEndClose(
      [bal('3000', 5_000, 15_000), bal('6300', 10_000, 0), bal('7140', 500, 500)],
      EQUITY,
    );
    if (!result.ok) throw new Error('close failed');
    // 3000 nets credit 10k → debit line; 6300 nets debit 10k → credit line; 7140 nets zero → skipped;
    // the two reversals already balance, so no equity line is added.
    expect(result.voucher.lines).toHaveLength(2);
    expect(voucherImbalance(result.voucher.lines)).toBe(ZERO);
  });

  it('is nothing-to-close when only balance accounts (or nothing) have activity', () => {
    expect(deriveYearEndClose([bal('1920', 1_000, 0), bal('2400', 0, 1_000)], EQUITY)).toEqual({
      ok: false,
      reason: 'nothing-to-close',
    });
    expect(deriveYearEndClose([], EQUITY)).toEqual({ ok: false, reason: 'nothing-to-close' });
  });

  it('never puts a VAT code on any line', () => {
    const result = deriveYearEndClose([bal('3000', 0, 12_345)], EQUITY);
    if (!result.ok) throw new Error('close failed');
    for (const line of result.voucher.lines) expect(line).not.toHaveProperty('vatCode');
  });
});

describe('deriveYearEndClose — properties', () => {
  const balanceArb = fc.record({
    number: fc.integer({ min: 1000, max: 8999 }).map((n) => acc(String(n))),
    name: fc.constant('konto'),
    debitØre: fc.integer({ min: 0, max: 10_000_000 }).map((n) => øre(n)),
    creditØre: fc.integer({ min: 0, max: 10_000_000 }).map((n) => øre(n)),
  });

  it('every derived voucher balances and touches only result accounts + the equity plug', () => {
    fc.assert(
      fc.property(fc.array(balanceArb, { maxLength: 30 }), (balances) => {
        const result = deriveYearEndClose(balances, EQUITY);
        if (!result.ok) return; // nothing-to-close is a legal outcome
        expect(voucherImbalance(result.voucher.lines)).toBe(ZERO);
        expect(result.voucher.lines.length).toBeGreaterThanOrEqual(2);
        for (const line of result.voucher.lines) {
          const isPlug = line.account === EQUITY;
          expect(isPlug || isClosedByYearEnd(line.account)).toBe(true);
          // one side only, positive amount
          expect(line.debit === ZERO || line.credit === ZERO).toBe(true);
          expect(subØre(addØre(line.debit, line.credit), ZERO) > ZERO).toBe(true);
        }
      }),
    );
  });

  it('after the close, every result account nets zero (activity + closing line)', () => {
    fc.assert(
      fc.property(fc.array(balanceArb, { maxLength: 30 }), (balances) => {
        const result = deriveYearEndClose(balances, EQUITY);
        if (!result.ok) return;
        // Sum the year's activity + the closing lines per result account: must net zero.
        const net = new Map<string, Øre>();
        for (const b of balances) {
          if (!isClosedByYearEnd(b.number)) continue;
          net.set(b.number, addØre(net.get(b.number) ?? ZERO, subØre(b.debitØre, b.creditØre)));
        }
        for (const line of result.voucher.lines) {
          if (line.account === EQUITY) continue;
          net.set(
            line.account,
            addØre(net.get(line.account) ?? ZERO, subØre(line.debit, line.credit)),
          );
        }
        for (const [account, sum] of net) expect(sum, account).toBe(ZERO);
      }),
    );
  });
});
