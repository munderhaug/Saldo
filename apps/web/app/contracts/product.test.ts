import { describe, expect, it } from 'vitest';
import { parseKroner } from '@saldo/domain';
import { productInput, PRODUCT_KINDS, type ProductKind } from './product.js';

/**
 * The product form submits an all-string FormData payload; the action parses it with `productInput`.
 * These lock the boundary — the `kind` enum, the required unit, and the kroner→øre price parse that
 * the db layer relies on (an unparseable price must be rejected here, not silently coerced to 0).
 */
const base = {
  name: 'Konsulenttime',
  kind: 'service',
  description: '',
  unit: 'time',
  unitPriceKr: '1 250,00',
  defaultAccountId: '',
  defaultVatCodeId: '',
};

describe('productInput (the form ↔ action boundary)', () => {
  it('parses a minimal valid payload', () => {
    expect(productInput.safeParse(base).success).toBe(true);
  });

  it('accepts each kind, and rejects a missing/blank one', () => {
    for (const kind of PRODUCT_KINDS satisfies readonly ProductKind[]) {
      expect(productInput.safeParse({ ...base, kind }).success).toBe(true);
    }
    expect(productInput.safeParse({ ...base, kind: '' }).success).toBe(false);
    expect(productInput.safeParse({ ...base, kind: 'widget' }).success).toBe(false);
  });

  it('requires a name and a unit', () => {
    expect(productInput.safeParse({ ...base, name: '' }).success).toBe(false);
    expect(productInput.safeParse({ ...base, unit: '' }).success).toBe(false);
  });

  it('accepts a blank price (means 0) but rejects an unparseable one', () => {
    expect(productInput.safeParse({ ...base, unitPriceKr: '' }).success).toBe(true);
    expect(productInput.safeParse({ ...base, unitPriceKr: 'gratis' }).success).toBe(false);
    expect(productInput.safeParse({ ...base, unitPriceKr: '1.2.3' }).success).toBe(false);
    expect(productInput.safeParse({ ...base, unitPriceKr: '0' }).success).toBe(true);
  });

  it('rejects a non-uuid default account / VAT code but accepts blank', () => {
    expect(productInput.safeParse({ ...base, defaultAccountId: 'not-a-uuid' }).success).toBe(false);
    expect(productInput.safeParse({ ...base, defaultVatCodeId: 'nope' }).success).toBe(false);
    expect(
      productInput.safeParse({
        ...base,
        defaultAccountId: '00000000-0000-4000-8000-000000000000',
      }).success,
    ).toBe(true);
  });

  it('every price the contract accepts parses to non-negative øre in the db layer', () => {
    for (const v of ['1 250,00', '0', '99,90', '1000000']) {
      const parsed = parseKroner(v);
      expect(parsed).not.toBeNull();
      expect(parsed!).toBeGreaterThanOrEqual(0);
    }
  });
});
