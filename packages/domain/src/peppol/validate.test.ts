import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { mulRate, rate, øre } from '../money/ore.js';
import { orgNr } from '../ids/org-nr.js';
import type { EhfInvoiceModel } from './ubl.js';
import { validateEhf } from './validate.js';

const SELLER = {
  orgNr: orgNr('974760673'),
  name: 'Selger ENK',
  city: 'Oslo',
  countryCode: 'NO',
} as const;
const BUYER = {
  orgNr: orgNr('923609016'),
  name: 'Kjøper AS',
  city: 'Bergen',
  countryCode: 'NO',
} as const;

function valid(): EhfInvoiceModel {
  return {
    kind: 'invoice',
    number: '10001',
    issueDate: '2026-06-26',
    currency: 'NOK',
    seller: SELLER,
    buyer: BUYER,
    lines: [
      {
        id: '1',
        description: 'Tjeneste',
        quantity: '1',
        unit: 'stk',
        unitPriceOre: øre(100_000),
        netOre: øre(100_000),
        vatCategory: 'S',
        vatPercent: 25,
      },
    ],
    taxSubtotals: [{ category: 'S', percent: 25, baseOre: øre(100_000), vatOre: øre(25_000) }],
    netOre: øre(100_000),
    vatOre: øre(25_000),
    grossOre: øre(125_000),
  };
}

/** Rule ids present in a validation result (handy for assertions). */
const rules = (m: EhfInvoiceModel): string[] => validateEhf(m).violations.map((x) => x.rule);

describe('validateEhf — the enforced BIS Billing 3.0 subset', () => {
  it('a complete, tied-out standard invoice passes with no violations', () => {
    expect(validateEhf(valid())).toEqual({ ok: true, violations: [] });
  });

  it('flags a missing seller country code (BR-09) and missing buyer name (BR-07)', () => {
    const m: EhfInvoiceModel = {
      ...valid(),
      seller: { ...SELLER, countryCode: '' },
      buyer: { ...BUYER, name: '  ' },
    };
    const found = rules(m);
    expect(found).toContain('BR-09');
    expect(found).toContain('BR-07');
    expect(validateEhf(m).ok).toBe(false);
  });

  it('flags a line-sum that does not tie to the document net (BR-CO-10)', () => {
    const m: EhfInvoiceModel = { ...valid(), netOre: øre(99_999) };
    expect(rules(m)).toContain('BR-CO-10');
  });

  it('flags a tax-inclusive total that is not net + VAT (BR-CO-15)', () => {
    const m: EhfInvoiceModel = { ...valid(), grossOre: øre(130_000) };
    expect(rules(m)).toContain('BR-CO-15');
  });

  it('flags a per-category taxable base that does not match its lines (BR-S-08)', () => {
    const m: EhfInvoiceModel = {
      ...valid(),
      taxSubtotals: [{ category: 'S', percent: 25, baseOre: øre(90_000), vatOre: øre(25_000) }],
      netOre: øre(100_000),
    };
    // The S base (90 000) ≠ Σ S line nets (100 000): BR-S-08 fires (BR-CO-14 too, since VAT still ties).
    expect(rules(m)).toContain('BR-S-08');
  });

  it('flags a standard-rated subtotal with no VAT (BR-S-09)', () => {
    const m: EhfInvoiceModel = {
      ...valid(),
      taxSubtotals: [{ category: 'S', percent: 25, baseOre: øre(100_000), vatOre: øre(0) }],
      vatOre: øre(0),
      grossOre: øre(100_000),
    };
    expect(rules(m)).toContain('BR-S-09');
  });

  it('flags a zero-rated subtotal that wrongly carries VAT (BR-Z-09)', () => {
    const m: EhfInvoiceModel = {
      ...valid(),
      lines: [{ ...valid().lines[0]!, vatCategory: 'Z', vatPercent: 0 }],
      taxSubtotals: [{ category: 'Z', percent: 0, baseOre: øre(100_000), vatOre: øre(5_000) }],
      vatOre: øre(5_000),
      grossOre: øre(105_000),
    };
    expect(rules(m)).toContain('BR-Z-09');
  });

  it('flags a VAT amount that is not base × rate (BR-CO-17), even when non-zero', () => {
    // A 25 % base of 100 000 declaring only 1 øre VAT passes BR-S-09 (direction: non-zero) but is the
    // wrong magnitude — BR-CO-17 catches it.
    const m: EhfInvoiceModel = {
      ...valid(),
      taxSubtotals: [{ category: 'S', percent: 25, baseOre: øre(100_000), vatOre: øre(1) }],
      vatOre: øre(1),
      grossOre: øre(100_001),
    };
    const found = rules(m);
    expect(found).toContain('BR-CO-17');
    expect(found).not.toContain('BR-S-09');
  });

  it('BR-CO-17 ties a half-øre product via round-half-away-from-zero', () => {
    // 100 002 øre × 25 % = 25 000.5 → 25 001 (away from zero).
    const line = { ...valid().lines[0]!, unitPriceOre: øre(100_002), netOre: øre(100_002) };
    const okModel: EhfInvoiceModel = {
      ...valid(),
      lines: [line],
      taxSubtotals: [{ category: 'S', percent: 25, baseOre: øre(100_002), vatOre: øre(25_001) }],
      netOre: øre(100_002),
      vatOre: øre(25_001),
      grossOre: øre(125_003),
    };
    expect(validateEhf(okModel).ok).toBe(true);
    // The down-rounded 25 000 must be rejected.
    const wrong: EhfInvoiceModel = {
      ...okModel,
      taxSubtotals: [{ category: 'S', percent: 25, baseOre: øre(100_002), vatOre: øre(25_000) }],
      vatOre: øre(25_000),
      grossOre: øre(125_002),
    };
    expect(rules(wrong)).toContain('BR-CO-17');
  });

  it('a 0 % category (Z) with zero VAT does not trip BR-CO-17', () => {
    const m: EhfInvoiceModel = {
      ...valid(),
      lines: [{ ...valid().lines[0]!, vatCategory: 'Z', vatPercent: 0 }],
      taxSubtotals: [{ category: 'Z', percent: 0, baseOre: øre(100_000), vatOre: øre(0) }],
      vatOre: øre(0),
      grossOre: øre(100_000),
    };
    expect(rules(m)).not.toContain('BR-CO-17');
    expect(validateEhf(m).ok).toBe(true);
  });

  it('property: only round(base × 25 %) passes BR-CO-17 for a single standard-rated category', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100_000_000 }), (base) => {
        const expected = Number(mulRate(øre(base), rate(0.25)));
        const m: EhfInvoiceModel = {
          ...valid(),
          lines: [{ ...valid().lines[0]!, unitPriceOre: øre(base), netOre: øre(base) }],
          taxSubtotals: [{ category: 'S', percent: 25, baseOre: øre(base), vatOre: øre(expected) }],
          netOre: øre(base),
          vatOre: øre(expected),
          grossOre: øre(base + expected),
        };
        return !validateEhf(m).violations.some((x) => x.rule === 'BR-CO-17');
      }),
    );
  });

  it('flags an empty document (no lines) — BR-16', () => {
    const m: EhfInvoiceModel = {
      ...valid(),
      lines: [],
      taxSubtotals: [],
      netOre: øre(0),
      vatOre: øre(0),
      grossOre: øre(0),
    };
    expect(rules(m)).toContain('BR-16');
  });
});
