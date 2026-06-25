import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { addØre, eqØre, øre, rate, ZERO } from '../money/ore.js';
import { grossFromNet } from './pricing.js';

const STANDARD = rate(0.25);
const REDUCED = rate(0.12);
const ZERO_RATE = rate(0);

describe('grossFromNet — net→VAT→gross split for a catalogue unit price', () => {
  it('25 % on 1 000,00 kr → 250,00 kr VAT, 1 250,00 kr gross', () => {
    expect(grossFromNet(øre(100_000), STANDARD)).toEqual({
      net: øre(100_000),
      vat: øre(25_000),
      gross: øre(125_000),
    });
  });

  it('12 % on 99,90 kr rounds the VAT once, half away from zero', () => {
    // 9990 × 0.12 = 1198.8 → 1199 øre.
    expect(grossFromNet(øre(9990), REDUCED)).toEqual({
      net: øre(9990),
      vat: øre(1199),
      gross: øre(11_189),
    });
  });

  it('a zero rate (zero-rated / unntatt / not registered) yields no VAT — gross equals net', () => {
    expect(grossFromNet(øre(50_000), ZERO_RATE)).toEqual({
      net: øre(50_000),
      vat: ZERO,
      gross: øre(50_000),
    });
  });

  it('a zero net price is VAT-free at any rate', () => {
    expect(grossFromNet(ZERO, STANDARD)).toEqual({ net: ZERO, vat: ZERO, gross: ZERO });
  });

  it('gross is always net + vat, and never below net, for any non-negative price and rate', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 1_000_000_000 }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (n, r) => {
          const net = øre(n);
          const { vat, gross } = grossFromNet(net, rate(r));
          expect(eqØre(gross, addØre(net, vat))).toBe(true);
          expect(gross >= net).toBe(true);
          expect(vat >= ZERO).toBe(true);
        },
      ),
    );
  });

  it('a zero rate yields zero VAT for any net price', () => {
    fc.assert(
      fc.property(fc.nat({ max: 1_000_000_000 }), (n) => {
        const net = øre(n);
        expect(grossFromNet(net, ZERO_RATE)).toEqual({ net, vat: ZERO, gross: net });
      }),
    );
  });
});
