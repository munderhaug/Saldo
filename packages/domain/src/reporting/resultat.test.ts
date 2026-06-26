import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { øre, subØre } from '../money/ore.js';
import type { AccountNo } from '../posting/types.js';
import type { LedgerAccountBalance } from './account-balance.js';
import { buildResultat } from './resultat.js';

const bal = (number: string, debit: number, credit: number): LedgerAccountBalance => ({
  number: number as AccountNo,
  name: number,
  debitØre: øre(debit),
  creditØre: øre(credit),
});

describe('buildResultat', () => {
  it('a simple year: revenue (3) − cost (4–7), no finans', () => {
    const r = buildResultat([
      bal('3000', 0, 100_000), // sales 100 000
      bal('4000', 30_000, 0), // varekostnad 30 000
      bal('6000', 20_000, 0), // annen driftskostnad 20 000
    ]);
    expect(r.driftsinntekterØre).toBe(øre(100_000));
    expect(r.driftskostnaderØre).toBe(øre(50_000));
    expect(r.driftsresultatØre).toBe(øre(50_000));
    expect(r.finansposterØre).toBe(øre(0));
    expect(r.aarsresultatØre).toBe(øre(50_000));
  });

  it('groups by kontoklasse with per-group subtotals, ascending', () => {
    const r = buildResultat([
      bal('5000', 40_000, 0), // lønn
      bal('3000', 0, 100_000),
      bal('3100', 0, 5_000),
    ]);
    expect(r.groups.map((g) => g.klasse)).toEqual(['3', '5']);
    expect(r.groups[0]?.subtotalØre).toBe(øre(105_000));
    expect(r.groups[0]?.lines).toHaveLength(2);
    expect(r.groups[1]?.subtotalØre).toBe(øre(40_000));
  });

  it('finansposter (klasse 8) fold into årsresultat; a finanskostnad is negative', () => {
    const r = buildResultat([
      bal('3000', 0, 100_000),
      bal('6000', 60_000, 0),
      bal('8050', 0, 2_000), // renteinntekt
      bal('8150', 9_000, 0), // rentekostnad
    ]);
    expect(r.driftsresultatØre).toBe(øre(40_000));
    expect(r.finansposterØre).toBe(øre(-7_000)); // 2 000 − 9 000
    expect(r.aarsresultatØre).toBe(øre(33_000));
  });

  it('excludes klasse-8 disposition accounts (8800+) from finansposter and årsresultat', () => {
    const r = buildResultat([
      bal('3000', 0, 100_000),
      bal('8050', 0, 2_000), // renteinntekt — finans, counts
      bal('8980', 30_000, 0), // privatuttak — equity disposition, NOT a cost
    ]);
    expect(r.finansposterØre).toBe(øre(2_000)); // only the renteinntekt
    expect(r.aarsresultatØre).toBe(øre(102_000)); // privatuttak does NOT reduce the result
    expect(r.groups.find((g) => g.klasse === '8')?.lines).toHaveLength(1);
  });

  it('ignores balance-sheet accounts (klasse 1–2) entirely', () => {
    const r = buildResultat([
      bal('1500', 125_000, 0),
      bal('2700', 0, 25_000),
      bal('3000', 0, 100_000),
    ]);
    expect(r.groups.map((g) => g.klasse)).toEqual(['3']);
    expect(r.aarsresultatØre).toBe(øre(100_000));
  });

  it('an empty ledger yields no groups and a zero result', () => {
    const r = buildResultat([]);
    expect(r.groups).toEqual([]);
    expect(r.aarsresultatØre).toBe(øre(0));
  });

  it('årsresultat always equals Σ over result accounts of (credit − debit) (property)', () => {
    const klasse = fc.constantFrom('3', '4', '5', '6', '7', '8');
    const account = fc
      .tuple(klasse, fc.integer({ min: 0, max: 99 }))
      .map(([k, n]) => `${k}${String(n).padStart(3, '0')}`);
    const balanceArb = fc
      .tuple(account, fc.nat(5_000_000), fc.nat(5_000_000))
      .map(([number, d, c]) => bal(number, d, c));

    fc.assert(
      fc.property(fc.array(balanceArb, { maxLength: 30 }), (balances) => {
        const r = buildResultat(balances);
        const expected = balances.reduce(
          (acc, b) => subØre(acc, subØre(b.debitØre, b.creditØre)),
          øre(0),
        );
        expect(r.aarsresultatØre).toBe(expected);
      }),
    );
  });
});
