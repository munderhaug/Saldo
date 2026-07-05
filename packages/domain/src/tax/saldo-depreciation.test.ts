import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { addØre, ZERO, øre, type Øre } from '../money/ore.js';
import { saldoRateFor, saldoSchedule, type SaldoGruppe } from './saldo-depreciation.js';

const GROUPS: readonly SaldoGruppe[] = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];

describe('saldoRateFor — the captured 2026 table', () => {
  it('matches the captured Skatteetaten satser exactly (docs/regulatory/saldoavskrivning.md)', () => {
    const expected: Record<SaldoGruppe, number> = {
      a: 0.3,
      b: 0.2,
      c: 0.24,
      d: 0.2,
      e: 0.14,
      f: 0.12,
      g: 0.05,
      h: 0.04,
      i: 0.02,
      j: 0.1,
    };
    for (const group of GROUPS) expect(saldoRateFor(group, 2026)).toBeCloseTo(expected[group], 10);
  });

  it('fails CLOSED for an uncaptured year', () => {
    expect(() => saldoRateFor('d', 2027)).toThrow(/No captured saldoavskrivning rates for 2027/);
    expect(() => saldoRateFor('a', 2025)).toThrow(RangeError);
  });
});

describe('saldoSchedule', () => {
  it('computes the hand-checked gruppe-d schedule (20 % declining balance)', () => {
    // 100 000 kr in gruppe d: 20 000 → 16 000 → 12 800 (independent hand computation).
    const schedule = saldoSchedule(øre(100_000_00), 'd', 2026, 3);
    expect(schedule).toEqual([
      {
        year: 2026,
        openingØre: øre(100_000_00),
        avskrivningØre: øre(20_000_00),
        closingØre: øre(80_000_00),
      },
      {
        year: 2027,
        openingØre: øre(80_000_00),
        avskrivningØre: øre(16_000_00),
        closingØre: øre(64_000_00),
      },
      {
        year: 2028,
        openingØre: øre(64_000_00),
        avskrivningØre: øre(12_800_00),
        closingØre: øre(51_200_00),
      },
    ]);
  });

  it('property: each year ties out, the balance declines, and nothing goes negative', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 500_000_00 }).map((n) => øre(n)),
        fc.constantFrom(...GROUPS),
        fc.integer({ min: 1, max: 30 }),
        (opening, group, years) => {
          const schedule = saldoSchedule(opening, group, 2026, years);
          expect(schedule).toHaveLength(years);
          let carried: Øre = opening;
          let totalDeducted: Øre = ZERO;
          for (const row of schedule) {
            expect(row.openingØre).toBe(carried);
            expect(addØre(row.avskrivningØre, row.closingØre)).toBe(row.openingØre); // ties out
            expect(row.avskrivningØre >= ZERO).toBe(true);
            expect(row.closingØre >= ZERO).toBe(true);
            expect(row.closingØre <= row.openingØre).toBe(true); // declining
            carried = row.closingØre;
            totalDeducted = addØre(totalDeducted, row.avskrivningØre);
          }
          // Total deductions never exceed the basis (conservative — no over-depreciation).
          expect(totalDeducted <= opening).toBe(true);
        },
      ),
    );
  });
});
