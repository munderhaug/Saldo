import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  indexTaxCodes,
  parseStandardTaxCodes,
  type SaftTaxCode,
  type VatDirection,
} from './tax-codes.js';

// Parse the REAL committed SAF-T list — proving the parser works on the official data, and that
// codes are loaded from the list rather than hardcoded from memory (hard invariant §4.3).
const csv = readFileSync(
  new URL('../../../../db/reference/saf-t/tax-codes/Standard_Tax_Codes.csv', import.meta.url),
  'utf8',
);
const codes = parseStandardTaxCodes(csv);
const byCode = indexTaxCodes(codes);

describe('parseStandardTaxCodes — official list', () => {
  it('parses every row of the committed list', () => {
    expect(codes).toHaveLength(30);
  });

  it('codes are unique and every record is fully classified', () => {
    const seen = new Set<string>();
    for (const c of codes) {
      expect(seen.has(c.code)).toBe(false);
      seen.add(c.code);
      expect(c.descriptionNo.length).toBeGreaterThan(0);
      expect(c.rateCategory).toBeDefined();
      expect(c.direction).toBeDefined();
    }
  });

  it.each<[string, VatDirection, SaftTaxCode['rateCategory']]>([
    ['3', 'output', 'regular'],
    ['31', 'output', 'reduced-middle'],
    ['33', 'output', 'reduced-low'],
    ['5', 'output', 'zero'],
    ['51', 'output', 'zero'],
    ['1', 'input', 'regular'],
    ['11', 'input', 'reduced-middle'],
    ['12', 'input', 'reduced-raw-fish'],
    ['14', 'input', 'regular'],
    ['13', 'input', 'reduced-low'],
    ['86', 'input', 'regular'], // foreign service, deductible
    ['87', 'none', 'regular'], // foreign service, NOT deductible
    ['88', 'input', 'reduced-low'], // foreign service, deductible
    ['89', 'none', 'reduced-low'], // foreign service, NOT deductible
    ['81', 'input', 'regular'], // import basis, deductible
    ['82', 'none', 'regular'], // import basis, NOT deductible
    ['91', 'input', 'regular'], // emission allowances/gold, deductible
    ['92', 'none', 'regular'], // emission allowances/gold, NOT deductible
    ['52', 'output', 'zero'], // export
    ['6', 'none', 'none'], // outside the VAT Act
    ['7', 'none', 'none'], // no VAT treatment (income)
    ['0', 'none', 'none'], // no VAT treatment (acquisitions)
  ])('code %s → direction %s, category %s', (code, direction, category) => {
    const c = byCode.get(code as SaftTaxCode['code']);
    expect(c).toBeDefined();
    expect(c?.direction).toBe(direction);
    expect(c?.rateCategory).toBe(category);
  });

  it.each<[string, boolean]>([
    ['51', true], // domestic reverse charge
    ['86', true], // services from abroad
    ['87', true],
    ['81', true], // import of goods (basis)
    ['82', true],
    ['91', true], // emission allowances / gold
    ['92', true],
    ['1', false], // ordinary domestic input
    ['3', false], // ordinary domestic output
    ['5', false], // zero-rated domestic
    ['52', false], // export (utførsel ≠ innførsel)
    ['14', false], // plain deductible import VAT, not a basis/self-account code
  ])('code %s reverseCharge = %s', (code, expected) => {
    expect(byCode.get(code as SaftTaxCode['code'])?.reverseCharge).toBe(expected);
  });

  it('parses the Compensation flag', () => {
    expect(byCode.get('0' as SaftTaxCode['code'])?.compensation).toBe(true);
    expect(byCode.get('1' as SaftTaxCode['code'])?.compensation).toBe(true);
    expect(byCode.get('3' as SaftTaxCode['code'])?.compensation).toBe(false);
  });

  it('no "uten fradragsrett" (non-deductible) code is classified as input', () => {
    for (const c of codes) {
      if (c.descriptionNo.toLowerCase().includes('uten fradragsrett')) {
        expect(c.direction).not.toBe('input');
      }
    }
  });
});

describe('parseStandardTaxCodes — parser robustness', () => {
  it('tolerates CRLF and trailing blank lines', () => {
    const fixture =
      'Code;DescriptionNOB;DescriptionENG;TaxRate;Compensation\r\n' +
      '3;Utgående merverdiavgift;Output VAT;Regular rate;\r\n' +
      '\r\n';
    const parsed = parseStandardTaxCodes(fixture);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.code).toBe('3');
    expect(parsed[0]?.direction).toBe('output');
  });

  it('rejects an unknown rate category', () => {
    expect(() =>
      parseStandardTaxCodes(
        'Code;DescriptionNOB;DescriptionENG;TaxRate;Compensation\n9;x;x;Bogus rate;',
      ),
    ).toThrow(/Unknown SAF-T tax-rate category/);
  });
});
