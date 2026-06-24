import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  addØre,
  eqØre,
  formatKr,
  mulRate,
  negØre,
  parseKroner,
  rate,
  roundØre,
  subØre,
  sumØre,
  ZERO,
  øre,
} from './ore.js';

const safeØre = () => fc.integer({ min: -1_000_000_000, max: 1_000_000_000 }).map((n) => øre(n));

describe('øre construction', () => {
  it('rejects non-integers', () => {
    expect(() => øre(1.5)).toThrow(RangeError);
  });
  it('accepts integers', () => {
    expect(øre(2500)).toBe(2500);
  });
});

describe('arithmetic invariants', () => {
  it('add then sub is identity', () => {
    fc.assert(
      fc.property(safeØre(), safeØre(), (a, b) => {
        expect(eqØre(subØre(addØre(a, b), b), a)).toBe(true);
      }),
    );
  });

  it('neg is its own inverse', () => {
    fc.assert(
      fc.property(safeØre(), (a) => {
        expect(eqØre(negØre(negØre(a)), a)).toBe(true);
      }),
    );
  });

  it('sumØre equals a manual fold', () => {
    fc.assert(
      fc.property(fc.array(safeØre(), { maxLength: 50 }), (xs) => {
        const manual = xs.reduce((acc, x) => addØre(acc, x), ZERO);
        expect(eqØre(sumØre(xs), manual)).toBe(true);
      }),
    );
  });
});

describe('rounding (half away from zero)', () => {
  it.each([
    [0.5, 1],
    [-0.5, -1],
    [1.5, 2],
    [2.5, 3],
    [-2.5, -3],
    [2.4, 2],
    [0, 0],
  ])('roundØre(%f) = %i', (input, expected) => {
    expect(roundØre(input)).toBe(expected);
  });
});

describe('mulRate', () => {
  it('rate 0 yields zero, rate 1 yields the amount', () => {
    fc.assert(
      fc.property(safeØre(), (a) => {
        expect(eqØre(mulRate(a, rate(0)), ZERO)).toBe(true);
        expect(eqØre(mulRate(a, rate(1)), a)).toBe(true);
      }),
    );
  });

  it('25% VAT on 100,00 kr (10000 øre) = 2500 øre', () => {
    expect(mulRate(øre(10000), rate(0.25))).toBe(2500);
  });

  it('always returns an integer', () => {
    fc.assert(
      fc.property(safeØre(), fc.double({ min: 0, max: 2, noNaN: true }), (a, r) => {
        expect(Number.isInteger(mulRate(a, rate(r)))).toBe(true);
      }),
    );
  });
});

describe('parseKroner', () => {
  it('parses whole and fractional kroner into øre', () => {
    expect(parseKroner('1500')).toBe(150000);
    expect(parseKroner('1500,50')).toBe(150050);
    expect(parseKroner('1500.50')).toBe(150050);
    expect(parseKroner('0')).toBe(0);
    expect(parseKroner('0,01')).toBe(1);
  });

  it('pads a single-digit fraction to two øre digits', () => {
    expect(parseKroner('12,5')).toBe(1250);
  });

  it('ignores whitespace grouping (incl. the non-breaking space formatKr emits)', () => {
    expect(parseKroner('1 234,50')).toBe(123450);
    expect(parseKroner('1 234,50')).toBe(123450);
  });

  it('rejects malformed amounts', () => {
    for (const bad of ['', 'abc', '-5', '1,234', '1.2.3', '12,345', '1e3', '1 234.5,0']) {
      expect(parseKroner(bad)).toBeNull();
    }
  });

  it('round-trips any non-negative øre through formatKr', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000_000 }).map((n) => øre(n)),
        (amount) => {
          expect(parseKroner(formatKr(amount))).toBe(amount);
        },
      ),
    );
  });
});
