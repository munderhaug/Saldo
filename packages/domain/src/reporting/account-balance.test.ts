import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { addØre, øre } from '../money/ore.js';
import type { AccountNo } from '../posting/types.js';
import {
  creditBalance,
  debitBalance,
  isEquityDisposition,
  kontoklasse,
} from './account-balance.js';

const bal = (number: string, debit: number, credit: number) => ({
  number: number as AccountNo,
  name: number,
  debitØre: øre(debit),
  creditØre: øre(credit),
});

describe('kontoklasse', () => {
  it('reads the leading digit for every valid class 1–8', () => {
    for (const d of ['1', '2', '3', '4', '5', '6', '7', '8'] as const) {
      expect(kontoklasse(`${d}500` as AccountNo)).toBe(d);
    }
  });

  it('returns null for an out-of-range leading digit (0/9)', () => {
    expect(kontoklasse('0000' as AccountNo)).toBeNull();
    expect(kontoklasse('9000' as AccountNo)).toBeNull();
    expect(kontoklasse('' as AccountNo)).toBeNull();
  });
});

describe('isEquityDisposition', () => {
  it('flags klasse-8 disposition/equity accounts (8800+), not finansposter (< 8800)', () => {
    expect(isEquityDisposition('8800' as AccountNo)).toBe(true); // årsresultat
    expect(isEquityDisposition('8960' as AccountNo)).toBe(true); // overføringer
    expect(isEquityDisposition('8980' as AccountNo)).toBe(true); // privatuttak
    expect(isEquityDisposition('8050' as AccountNo)).toBe(false); // renteinntekt (finans)
    expect(isEquityDisposition('8300' as AccountNo)).toBe(false); // skattekostnad
    expect(isEquityDisposition('1920' as AccountNo)).toBe(false); // not klasse 8
  });
});

describe('debit/credit balance', () => {
  it('debitBalance = debit − credit; creditBalance = credit − debit', () => {
    expect(debitBalance(bal('1500', 1000, 200))).toBe(øre(800));
    expect(creditBalance(bal('2700', 1000, 200))).toBe(øre(-800));
  });

  it('the two orientations are exact negatives (property)', () => {
    fc.assert(
      fc.property(fc.nat(1_000_000), fc.nat(1_000_000), (d, c) => {
        const b = bal('1500', d, c);
        // The two orientations are exact negatives, so they sum to zero (avoids the +0/−0 trap).
        expect(addØre(debitBalance(b), creditBalance(b))).toBe(øre(0));
      }),
    );
  });
});
