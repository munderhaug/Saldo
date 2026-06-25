import { describe, expect, it } from 'vitest';
import {
  chargesOutputVat,
  deductsInputVat,
  MVA_STATUSES,
  proposeMvaStatusFromVatRegister,
  type MvaStatus,
} from './status.js';

describe('MVA status forks', () => {
  // Exhaustive over the closed status set: only the two registered states charge/deduct VAT.
  const registered: MvaStatus[] = ['registered_standard', 'registered_zero_rated'];
  it.each(MVA_STATUSES)('chargesOutputVat(%s) reflects registration', (status) => {
    expect(chargesOutputVat(status)).toBe(registered.includes(status));
  });
  it.each(MVA_STATUSES)('deductsInputVat(%s) reflects registration', (status) => {
    expect(deductsInputVat(status)).toBe(registered.includes(status));
  });
});

describe('proposeMvaStatusFromVatRegister', () => {
  it('proposes registered_standard for a unit in the VAT register', () => {
    expect(proposeMvaStatusFromVatRegister(true)).toBe('registered_standard');
  });

  it('proposes under_threshold when not registered or unknown', () => {
    // false (not in the register) and undefined (brreg omitted the flag) both fall back to the
    // safe, non-charging default — never silently assume registration.
    expect(proposeMvaStatusFromVatRegister(false)).toBe('under_threshold');
    expect(proposeMvaStatusFromVatRegister(undefined)).toBe('under_threshold');
  });

  it('only ever proposes a valid status', () => {
    for (const flag of [true, false, undefined]) {
      expect(MVA_STATUSES).toContain(proposeMvaStatusFromVatRegister(flag));
    }
  });
});
