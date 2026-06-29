import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { NON_DEDUCTIBLE_REASONS, isLineInputVatDeductible } from './expense-deductibility.js';

describe('isLineInputVatDeductible — the encoded non-deductible rule', () => {
  it('no recorded reason ⇒ deductible (subject to the MVA-status fork downstream)', () => {
    expect(isLineInputVatDeductible(null)).toBe(true);
    expect(isLineInputVatDeductible(undefined)).toBe(true);
  });

  it.each(NON_DEDUCTIBLE_REASONS)('reason %s ⇒ NON-deductible (gross to cost)', (reason) => {
    expect(isLineInputVatDeductible(reason)).toBe(false);
  });

  it('covers exactly representasjon, restricted_vehicle, private_use', () => {
    expect([...NON_DEDUCTIBLE_REASONS]).toStrictEqual([
      'representasjon',
      'restricted_vehicle',
      'private_use',
    ]);
  });

  it('property: any recorded reason is non-deductible; absence is deductible', () => {
    fc.assert(
      fc.property(
        fc.option(fc.constantFrom(...NON_DEDUCTIBLE_REASONS), { nil: null }),
        (reason) => {
          expect(isLineInputVatDeductible(reason)).toBe(reason === null);
        },
      ),
    );
  });
});
