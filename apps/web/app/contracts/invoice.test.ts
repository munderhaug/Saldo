import { describe, expect, it } from 'vitest';
import { invoiceInput, parseQuantity } from './invoice';

const line = {
  productId: '',
  description: 'Konsulenttime',
  quantity: '1',
  unit: 'time',
  unitPriceKr: '1000',
  accountId: '2b0c8f6e-1111-4111-8111-111111111111',
  vatCodeId: '2b0c8f6e-2222-4222-8222-222222222222',
};

const base = {
  kind: 'invoice',
  customerId: '',
  customerName: 'Kunde AS',
  customerEmail: '',
  customerOrgNr: '',
  customerAddress: '',
  currency: 'NOK',
  language: 'nb',
  issueDate: '',
  dueDate: '',
  creditsInvoiceId: '',
  notes: '',
  lines: [line],
};

describe('invoiceInput — kind ↔ creditsInvoiceId correlation (review 2026-07-03 §9)', () => {
  it('accepts a plain invoice with no credited source', () => {
    expect(invoiceInput.safeParse(base).success).toBe(true);
  });

  it('rejects a credit note WITHOUT a credited invoice', () => {
    const r = invoiceInput.safeParse({ ...base, kind: 'credit_note' });
    expect(r.success).toBe(false);
  });

  it('accepts a credit note WITH a credited invoice', () => {
    const r = invoiceInput.safeParse({
      ...base,
      kind: 'credit_note',
      creditsInvoiceId: '2b0c8f6e-3333-4333-8333-333333333333',
    });
    expect(r.success).toBe(true);
  });

  it('rejects a non-credit-note that names a credited invoice', () => {
    for (const kind of ['invoice', 'quote']) {
      const r = invoiceInput.safeParse({
        ...base,
        kind,
        creditsInvoiceId: '2b0c8f6e-3333-4333-8333-333333333333',
      });
      expect(r.success).toBe(false);
    }
  });
});

describe('parseQuantity — bounded integer digits (review 2026-07-03 §9)', () => {
  it('parses ordinary quantities, comma or dot decimal', () => {
    expect(parseQuantity('2')).toBe(2);
    expect(parseQuantity('2,5')).toBe(2.5);
    expect(parseQuantity('0.75')).toBe(0.75);
    expect(parseQuantity('1 000')).toBe(1000);
  });

  it('accepts up to 9 integer digits and rejects a 10th', () => {
    expect(parseQuantity('999999999')).toBe(999_999_999);
    expect(parseQuantity('1000000000')).toBeNull();
  });

  it('rejects malformed input', () => {
    expect(parseQuantity('')).toBeNull();
    expect(parseQuantity('-1')).toBeNull();
    expect(parseQuantity('1,2345')).toBeNull();
    expect(parseQuantity('1e6')).toBeNull();
  });
});
