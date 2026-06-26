import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { øre, addØre, subØre } from '../money/ore.js';
import { type HovedbokEntry, buildHovedbok } from './hovedbok.js';

const entry = (debit: number, credit: number): HovedbokEntry => ({
  voucherId: `${debit}-${credit}`,
  voucherType: 'manual',
  date: '2026-03-01',
  debitØre: øre(debit),
  creditØre: øre(credit),
});

describe('buildHovedbok', () => {
  it('runs a debit-normal balance from the opening figure', () => {
    const r = buildHovedbok(øre(10_000), [entry(5_000, 0), entry(0, 2_000), entry(1_000, 0)]);
    expect(r.rows.map((x) => x.balanceØre)).toEqual([øre(15_000), øre(13_000), øre(14_000)]);
    expect(r.openingØre).toBe(øre(10_000));
    expect(r.closingØre).toBe(øre(14_000));
    expect(r.debitTotalØre).toBe(øre(6_000));
    expect(r.creditTotalØre).toBe(øre(2_000));
  });

  it('an account with no entries closes at its opening balance', () => {
    const r = buildHovedbok(øre(7_500), []);
    expect(r.rows).toEqual([]);
    expect(r.closingØre).toBe(øre(7_500));
  });

  it('closing = opening + Σ(debit − credit); last row balance = closing (property)', () => {
    const entryArb = fc.tuple(fc.nat(1_000_000), fc.nat(1_000_000)).map(([d, c]) => entry(d, c));
    fc.assert(
      fc.property(
        fc.integer({ min: -1_000_000, max: 1_000_000 }),
        fc.array(entryArb),
        (open, entries) => {
          const r = buildHovedbok(øre(open), entries);
          const expected = entries.reduce(
            (acc, e) => addØre(acc, subØre(e.debitØre, e.creditØre)),
            øre(open),
          );
          expect(r.closingØre).toBe(expected);
          if (entries.length > 0) {
            expect(r.rows[r.rows.length - 1]?.balanceØre).toBe(expected);
          }
        },
      ),
    );
  });
});
