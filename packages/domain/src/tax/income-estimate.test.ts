import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { type Øre, ZERO, mulRate, subØre, sumØre, øre } from '../money/ore.js';
import { SUPPORTED_TAX_YEARS, taxParamsFor } from './params.js';
import { type IncomeTaxEstimate, estimateEnkIncomeTax } from './income-estimate.js';

const kr = (n: number): Øre => øre(n * 100); // kroner → øre, for readable profit fixtures
const YEAR = 2026;

/**
 * Hand-computed oracle (independent of the SUT): exact øre at chosen income points, derived by hand from
 * the 2026 captures (db/reference/skatt/), covering all three trygdeavgift regimes (zero / 25 % phase-in
 * cap / flat 10,8 %) and every trinnskatt band. øre values are stated exactly (kr × 100); the kr figure
 * is in the comment.
 */
const ORACLE: ReadonlyArray<readonly [profitKr: number, expected: IncomeTaxEstimate]> = [
  // ── No tax: at/under personfradrag, under trinn-1, at/under the trygde nedre grense ──
  [0, { alminneligInntektSkatt: ZERO, trinnskatt: ZERO, trygdeavgift: ZERO, total: ZERO }],
  [50_000, { alminneligInntektSkatt: ZERO, trinnskatt: ZERO, trygdeavgift: ZERO, total: ZERO }],
  // exactly the nedre grense (99 650): "inntil" is inclusive → still zero trygdeavgift
  [99_650, { alminneligInntektSkatt: ZERO, trinnskatt: ZERO, trygdeavgift: ZERO, total: ZERO }],
  // ── Trygdeavgift 25 % phase-in band binds (just above the nedre grense), still under trinn-1 ──
  [
    120_000,
    {
      alminneligInntektSkatt: øre(120_120), // (120000−114540)=5460 kr × 22 %
      trinnskatt: ZERO,
      trygdeavgift: øre(508_750), // min(10,8 %·120000, 25 %·(120000−99650)=25 %·20350)
      total: øre(628_870),
    },
  ],
  [
    150_000,
    {
      alminneligInntektSkatt: øre(780_120), // (150000−114540)=35460 kr × 22 %
      trinnskatt: ZERO,
      trygdeavgift: øre(1_258_750), // 25 %·(150000−99650)=25 %·50350 — cap still binds
      total: øre(2_038_870),
    },
  ],
  // ── At trinn-1 threshold: nothing "overstiger" it yet; trygde now flat 10,8 % (cap no longer binds) ──
  [
    226_100,
    {
      alminneligInntektSkatt: øre(2_454_320), // (226100−114540)=111560 kr × 22 %
      trinnskatt: ZERO,
      trygdeavgift: øre(2_441_880), // 10,8 %·226100 (< 25 %·126450)
      total: øre(4_896_200),
    },
  ],
  // ── Into trinn-1 only ──
  [
    300_000,
    {
      alminneligInntektSkatt: øre(4_080_120), // (300000−114540)=185460 × 22 %
      trinnskatt: øre(125_630), // 1,7 %·(300000−226100)=1,7 %·73900
      trygdeavgift: øre(3_240_000), // 10,8 %·300000
      total: øre(7_445_750),
    },
  ],
  // ── Through trinn-2 (band-1 full + part of band-2) ──
  [
    500_000,
    {
      alminneligInntektSkatt: øre(8_480_120), // (500000−114540)=385460 × 22 %
      trinnskatt: øre(883_540), // 1,7 %·92200 + 4,0 %·(500000−318300)
      trygdeavgift: øre(5_400_000), // 10,8 %·500000
      total: øre(14_763_660),
    },
  ],
  // ── Through trinn-4 (bands 1–3 full + part of band-4) ──
  [
    1_000_000,
    {
      alminneligInntektSkatt: øre(19_480_120), // (1000000−114540)=885460 × 22 %
      trinnskatt: øre(5_612_245), // 1,7 %·92200 + 4 %·406750 + 13,7 %·255050 + 16,8 %·19900
      trygdeavgift: øre(10_800_000), // 10,8 %·1000000
      total: øre(35_892_365),
    },
  ],
  // ── Into the top trinn-5 band ──
  [
    1_500_000,
    {
      alminneligInntektSkatt: øre(30_480_120), // (1500000−114540)=1385460 × 22 %
      trinnskatt: øre(14_045_045), // bands 1–4 full + 17,8 %·(1500000−1467200)
      trygdeavgift: øre(16_200_000), // 10,8 %·1500000
      total: øre(60_725_165),
    },
  ],
];

describe('estimateEnkIncomeTax — 2026, hand-computed oracle', () => {
  it.each(ORACLE)('profit %d kr → exact components', (profitKr, expected) => {
    expect(estimateEnkIncomeTax(kr(profitKr), YEAR)).toEqual(expected);
  });

  it('a loss (negative profit) is zero tax, not negative', () => {
    expect(estimateEnkIncomeTax(øre(-10_000_00), YEAR)).toEqual({
      alminneligInntektSkatt: ZERO,
      trinnskatt: ZERO,
      trygdeavgift: ZERO,
      total: ZERO,
    });
  });

  it('one øre over the nedre grense still yields no trygdeavgift (25 % of ~0 rounds to 0)', () => {
    const justOver = øre(99_650_00 + 1);
    expect(estimateEnkIncomeTax(justOver, YEAR).trygdeavgift).toBe(ZERO);
  });
});

describe('taxParamsFor / SUPPORTED_TAX_YEARS — fail-closed', () => {
  it('exposes 2026 as a supported, source-grounded year', () => {
    expect(SUPPORTED_TAX_YEARS).toContain(2026);
    expect(taxParamsFor(2026).year).toBe(2026);
  });

  it('throws for a year with no committed capture (never estimate from un-grounded rates)', () => {
    expect(() => taxParamsFor(2099)).toThrow(RangeError);
    expect(() => estimateEnkIncomeTax(kr(500_000), 1999)).toThrow(RangeError);
  });
});

// ── Properties (fast-check): the guarantees the honest-number reveal rests on ──
describe('estimateEnkIncomeTax — properties', () => {
  const nonNegØre = fc.integer({ min: 0, max: 50_000_000_00 }).map((n) => øre(n));
  const anyØre = fc.integer({ min: -10_000_000_00, max: 50_000_000_00 }).map((n) => øre(n));
  const p = taxParamsFor(YEAR);

  it('every component (and the total) is non-negative, for any profit incl. a loss', () => {
    fc.assert(
      fc.property(anyØre, (profit) => {
        const e = estimateEnkIncomeTax(profit, YEAR);
        expect(e.alminneligInntektSkatt >= ZERO).toBe(true);
        expect(e.trinnskatt >= ZERO).toBe(true);
        expect(e.trygdeavgift >= ZERO).toBe(true);
        expect(e.total >= ZERO).toBe(true);
      }),
    );
  });

  it('total is exactly the sum of the three components', () => {
    fc.assert(
      fc.property(anyØre, (profit) => {
        const e = estimateEnkIncomeTax(profit, YEAR);
        expect(e.total).toBe(sumØre([e.alminneligInntektSkatt, e.trinnskatt, e.trygdeavgift]));
      }),
    );
  });

  it('total never exceeds profit (the set-aside leaves something to spend)', () => {
    fc.assert(
      fc.property(nonNegØre, (profit) => {
        expect(estimateEnkIncomeTax(profit, YEAR).total <= profit).toBe(true);
      }),
    );
  });

  it('is monotonic: more profit never means less tax', () => {
    fc.assert(
      fc.property(nonNegØre, nonNegØre, (a, b) => {
        const [lo, hi] = a <= b ? [a, b] : [b, a];
        expect(estimateEnkIncomeTax(lo, YEAR).total <= estimateEnkIncomeTax(hi, YEAR).total).toBe(
          true,
        );
      }),
    );
  });

  it('trygdeavgift is zero at/under the nedre grense, and never exceeds the flat rate or the 25 % cap', () => {
    fc.assert(
      fc.property(anyØre, (profit) => {
        const { trygdeavgift } = estimateEnkIncomeTax(profit, YEAR);
        if (profit <= p.trygdeavgiftNedreGrenseØre) {
          expect(trygdeavgift).toBe(ZERO);
        } else {
          // bounded above by both the flat 10,8 % and the 25 % phase-in of the excess over the floor
          const flat = mulRate(profit, p.trygdeavgiftNæringRate);
          const cap = mulRate(
            subØre(profit, p.trygdeavgiftNedreGrenseØre),
            p.trygdeavgiftOpptrappingRate,
          );
          expect(trygdeavgift <= flat).toBe(true);
          expect(trygdeavgift <= cap).toBe(true);
        }
      }),
    );
  });
});
