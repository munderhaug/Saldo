import { describe, expect, it } from 'vitest';
import { contactInput, roleFromFlags, rolesFromValue, type ContactRole } from './contact.js';

/**
 * The contact form submits an all-string FormData payload; the action parses it with `contactInput`.
 * These lock the boundary — especially the `role` field, whose mis-wiring (the action reading
 * `isCustomer`/`isSupplier` instead of `role`) would have made every create/edit silently fail.
 */
const base = {
  name: 'Eksempel AS',
  role: 'customer',
  orgNr: '',
  email: '',
  phone: '',
  addressLine: '',
  postalCode: '',
  city: '',
  countryCode: 'NO',
  mvaStatus: 'under_threshold',
  paymentTermsDays: '14',
  defaultAccountId: '',
  defaultVatCodeId: '',
  currency: 'NOK',
  language: 'nb',
  notes: '',
};

describe('contactInput (the form ↔ action boundary)', () => {
  it('parses a minimal valid payload', () => {
    const parsed = contactInput.safeParse(base);
    expect(parsed.success).toBe(true);
  });

  it('requires a role — a missing/blank role is rejected (the wiring regression)', () => {
    expect(contactInput.safeParse({ ...base, role: '' }).success).toBe(false);
    const withoutRole = { ...base, role: undefined };
    expect(contactInput.safeParse(withoutRole).success).toBe(false);
  });

  it('accepts each role value', () => {
    for (const role of ['customer', 'supplier', 'both'] satisfies ContactRole[]) {
      expect(contactInput.safeParse({ ...base, role }).success).toBe(true);
    }
  });

  it('rejects a malformed org number but accepts blank (private person) and 9 digits', () => {
    expect(contactInput.safeParse({ ...base, orgNr: '12345' }).success).toBe(false);
    expect(contactInput.safeParse({ ...base, orgNr: '' }).success).toBe(true);
    expect(contactInput.safeParse({ ...base, orgNr: '974760673' }).success).toBe(true);
  });

  it('rejects payment terms that are not 0–365 whole days', () => {
    expect(contactInput.safeParse({ ...base, paymentTermsDays: '-1' }).success).toBe(false);
    expect(contactInput.safeParse({ ...base, paymentTermsDays: '400' }).success).toBe(false);
    expect(contactInput.safeParse({ ...base, paymentTermsDays: '30' }).success).toBe(true);
  });

  it('uppercases the country and currency codes', () => {
    const parsed = contactInput.parse({ ...base, countryCode: 'no', currency: 'nok' });
    expect(parsed.countryCode).toBe('NO');
    expect(parsed.currency).toBe('NOK');
  });
});

describe('role ↔ flags mapping', () => {
  it('round-trips every role through the storage flags', () => {
    for (const role of ['customer', 'supplier', 'both'] satisfies ContactRole[]) {
      const { isCustomer, isSupplier } = rolesFromValue(role);
      expect(roleFromFlags(isCustomer, isSupplier)).toBe(role);
    }
  });

  it('maps the flags as expected', () => {
    expect(rolesFromValue('customer')).toEqual({ isCustomer: true, isSupplier: false });
    expect(rolesFromValue('supplier')).toEqual({ isCustomer: false, isSupplier: true });
    expect(rolesFromValue('both')).toEqual({ isCustomer: true, isSupplier: true });
  });
});
