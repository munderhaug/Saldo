import { describe, expect, it } from 'vitest';
import { rateForCategory, satsForCategory } from './rates.js';
import type { RateCategory } from './tax-codes.js';

describe('rateForCategory — 2026 MVA rates (cited: docs/regulatory/mva-rates.md)', () => {
  it.each<[RateCategory, number]>([
    ['regular', 0.25],
    ['reduced-middle', 0.15],
    ['reduced-low', 0.12],
    ['zero', 0],
    ['none', 0],
  ])('%s → %d', (category, expected) => {
    expect(rateForCategory(category)).toBeCloseTo(expected, 10);
  });

  it('raw-fish rate is ~11.11 %', () => {
    expect(rateForCategory('reduced-raw-fish')).toBeCloseTo(0.1111, 4);
  });
});

describe('satsForCategory — MVA-melding sats strings (cited: kodelister/sats.xml)', () => {
  it.each<[RateCategory, string]>([
    ['regular', '25'],
    ['reduced-middle', '15'],
    ['reduced-low', '12'],
    ['reduced-raw-fish', '11,11'],
    ['zero', '0'],
    ['none', '0'],
  ])('%s → "%s"', (category, expected) => {
    expect(satsForCategory(category)).toBe(expected);
  });
});
