import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { isValidBankAccount } from './bank-account.js';

const WEIGHTS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

/** The mod11 control digit for a 10-digit BBAN prefix (10 means "no valid number for this prefix"). */
function bbanControl(prefix: string): number {
  const sum = WEIGHTS.reduce((acc, w, i) => acc + w * Number(prefix[i]), 0);
  const rem = sum % 11;
  return rem === 0 ? 0 : 11 - rem;
}

describe('isValidBankAccount', () => {
  it('accepts a mod11-valid 11-digit BBAN', () => {
    expect(isValidBankAccount('86011117947')).toBe(true);
  });

  it('strips spaces and dots (1234.56.78903 style)', () => {
    expect(isValidBankAccount('8601.11.17947')).toBe(true);
    expect(isValidBankAccount('8601 11 17947')).toBe(true);
  });

  it('accepts a valid Norwegian IBAN (case-insensitive)', () => {
    expect(isValidBankAccount('NO9386011117947')).toBe(true);
    expect(isValidBankAccount('no9386011117947')).toBe(true);
    expect(isValidBankAccount('NO93 8601 1117 947')).toBe(true);
  });

  it('rejects a BBAN with the wrong control digit', () => {
    expect(isValidBankAccount('86011117948')).toBe(false);
  });

  it('rejects wrong lengths, non-digits, and the empty string', () => {
    expect(isValidBankAccount('')).toBe(false);
    expect(isValidBankAccount('8601111794')).toBe(false); // 10 digits
    expect(isValidBankAccount('860111179470')).toBe(false); // 12 digits
    expect(isValidBankAccount('8601111794X')).toBe(false);
  });

  it('rejects a Norwegian IBAN with bad ISO-7064 check digits and a non-NO IBAN', () => {
    expect(isValidBankAccount('NO0086011117947')).toBe(false); // bad check digits
    expect(isValidBankAccount('DE89370400440532013000')).toBe(false); // not Norwegian
  });

  it('property: prefix + correct control digit validates; any other final digit does not', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 9 }), { minLength: 10, maxLength: 10 }),
        fc.integer({ min: 1, max: 9 }),
        (digits, bump) => {
          const prefix = digits.join('');
          const control = bbanControl(prefix);
          fc.pre(control !== 10); // no valid 11-digit number exists for this prefix
          expect(isValidBankAccount(prefix + String(control))).toBe(true);
          const wrong = (control + bump) % 10;
          fc.pre(wrong !== control);
          expect(isValidBankAccount(prefix + String(wrong))).toBe(false);
        },
      ),
    );
  });
});
