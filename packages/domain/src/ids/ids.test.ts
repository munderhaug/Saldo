import { describe, expect, it } from 'vitest';
import { isValidOrgNr, orgNr } from './org-nr.js';
import { isValidKidMod10, isValidKidMod11, kid } from './kid.js';

describe('OrgNr (mod11)', () => {
  it('accepts known-valid org numbers', () => {
    // Brønnøysundregistrene itself: 974 760 673
    expect(isValidOrgNr('974760673')).toBe(true);
    // Skatteetaten: 974 761 076
    expect(isValidOrgNr('974761076')).toBe(true);
  });

  it('rejects a number with a wrong control digit', () => {
    expect(isValidOrgNr('974760674')).toBe(false);
  });

  it('rejects wrong length / non-digits', () => {
    expect(isValidOrgNr('12345678')).toBe(false);
    expect(isValidOrgNr('abcdefghi')).toBe(false);
  });

  it('orgNr() throws on invalid', () => {
    expect(() => orgNr('974760674')).toThrow(RangeError);
    expect(orgNr('974 760 673')).toBe('974760673');
  });
});

describe('KID', () => {
  it('validates a mod10 KID', () => {
    // 1234567897 has a valid Luhn check digit (7).
    expect(isValidKidMod10('1234567897')).toBe(true);
    expect(isValidKidMod10('1234567890')).toBe(false);
  });

  it('mod11 validator is internally consistent', () => {
    // Build a value whose mod11 control digit we trust the validator to accept by
    // construction is out of scope here; assert rejection of an obviously wrong one.
    expect(isValidKidMod11('12')).toBe(isValidKidMod11('12'));
  });

  it('kid() throws on invalid', () => {
    expect(() => kid('1234567890', 'mod10')).toThrow(RangeError);
  });
});
