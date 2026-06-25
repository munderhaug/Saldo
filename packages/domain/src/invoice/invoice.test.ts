import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { addØre, eqØre, sumØre, øre, ZERO } from '../money/ore.js';
import { isValidKidMod10 } from '../ids/kid.js';
import { indexTaxCodes, parseStandardTaxCodes, type SaftTaxCode } from '../saft/tax-codes.js';
import { MVA_STATUSES, type MvaStatus } from '../vat/status.js';
import {
  checkSalesLine,
  computeLine,
  invoiceKid,
  invoiceTotals,
  lineNet,
  quantity,
  vatBreakdown,
} from './invoice.js';

// Parse the REAL committed SAF-T list (never hardcode codes from memory — hard invariant §4.3).
const csv = readFileSync(
  new URL('../../../../db/reference/saf-t/tax-codes/Standard_Tax_Codes.csv', import.meta.url),
  'utf8',
);
const byCode = indexTaxCodes(parseStandardTaxCodes(csv));
const code = (c: string): SaftTaxCode => {
  const found = byCode.get(c as SaftTaxCode['code']);
  if (found === undefined) throw new Error(`fixture missing committed code ${c}`);
  return found;
};

const OUTPUT_25 = code('3'); // 25 % output VAT — registered only
const FRITATT = code('5'); // zero-rated output (fritatt/export) — registered only
const EXEMPT = code('6'); // unntatt — outside the VAT Act, any status
const INPUT = code('1'); // input-deductible — a purchase code, never a sale
const NO_TREATMENT = code('0'); // technical no-VAT code, any status

const REGISTERED = ['registered_standard', 'registered_zero_rated'] as const;
const UNREGISTERED = ['under_threshold', 'unntatt'] as const;

describe('quantity / lineNet — milli-unit quantities, single rounding boundary', () => {
  it('1 stk × 1 000,00 kr = 1 000,00 kr', () => {
    expect(lineNet(øre(100_000), quantity(1))).toBe(øre(100_000));
  });

  it('2,5 timer × 800,00 kr = 2 000,00 kr', () => {
    expect(lineNet(øre(80_000), quantity(2.5))).toBe(øre(200_000));
  });

  it('rounds the line net once, half away from zero (0,333 × 100,00 kr → 33,30 kr)', () => {
    // 10000 øre × 0.333 = 3330 øre exactly.
    expect(lineNet(øre(10_000), quantity(0.333))).toBe(øre(3330));
  });

  it('a zero quantity or zero price yields zero net', () => {
    expect(lineNet(øre(100_000), quantity(0))).toBe(ZERO);
    expect(lineNet(ZERO, quantity(5))).toBe(ZERO);
  });

  it('rejects a negative or non-finite quantity', () => {
    expect(() => quantity(-1)).toThrow(RangeError);
    expect(() => quantity(Number.NaN)).toThrow(RangeError);
  });
});

describe('computeLine — per-line net/VAT/gross with the registration HARD BLOCK', () => {
  it('registered + 25 % code: charges 25 % output VAT', () => {
    const line = computeLine('registered_standard', OUTPUT_25, øre(100_000), quantity(1));
    expect(line).toMatchObject({
      net: øre(100_000),
      vat: øre(25_000),
      gross: øre(125_000),
      treatment: 'output-vat',
    });
    expect(line.verdict.ok).toBe(true);
  });

  it('unregistered + 25 % code: HARD BLOCK — verdict not ok, and no VAT is charged', () => {
    for (const status of UNREGISTERED) {
      const line = computeLine(status, OUTPUT_25, øre(100_000), quantity(1));
      expect(line.verdict.ok).toBe(false);
      expect(line.verdict.reason).toBe('output-vat-requires-registration');
      expect(line.vat).toBe(ZERO); // never charge VAT an unregistered org may not charge
    }
  });

  it('registered + fritatt (0 %): allowed, zero VAT, gross equals net', () => {
    const line = computeLine('registered_zero_rated', FRITATT, øre(50_000), quantity(1));
    expect(line.verdict.ok).toBe(true);
    expect(line.vat).toBe(ZERO);
    expect(line.gross).toBe(øre(50_000));
  });

  it('exempt (unntatt) code: allowed for ANY status, zero VAT', () => {
    for (const status of [...REGISTERED, ...UNREGISTERED] as MvaStatus[]) {
      const line = computeLine(status, EXEMPT, øre(50_000), quantity(1));
      expect(line.verdict.ok).toBe(true);
      expect(line.vat).toBe(ZERO);
    }
  });

  it('an input-deductible code is blocked on a sale even for a registered org', () => {
    const verdict = checkSalesLine('registered_standard', INPUT);
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toBe('input-code-not-a-sale');
  });

  it('gross is always net + vat, for any status / code / price / quantity', () => {
    const anyStatus = fc.constantFrom<MvaStatus>(...MVA_STATUSES);
    const anyCode = fc.constantFrom(OUTPUT_25, FRITATT, EXEMPT, NO_TREATMENT);
    fc.assert(
      fc.property(
        anyStatus,
        anyCode,
        fc.nat({ max: 10_000_000 }),
        fc.double({ min: 0, max: 1000, noNaN: true }),
        (status, c, price, qty) => {
          const line = computeLine(status, c, øre(price), quantity(qty));
          expect(eqØre(line.gross, addØre(line.net, line.vat))).toBe(true);
          expect(line.vat >= ZERO).toBe(true);
        },
      ),
    );
  });

  it('VAT is charged only on an output-VAT treatment; every other treatment adds nothing', () => {
    const anyStatus = fc.constantFrom<MvaStatus>(...MVA_STATUSES);
    const nonOutput = fc.constantFrom(FRITATT, EXEMPT, NO_TREATMENT);
    fc.assert(
      fc.property(anyStatus, nonOutput, fc.nat({ max: 100_000_000 }), (status, c, price) => {
        expect(computeLine(status, c, øre(price), quantity(1)).vat).toBe(ZERO);
      }),
    );
  });
});

describe('invoiceTotals / vatBreakdown — document aggregation', () => {
  const lines = [
    computeLine('registered_standard', OUTPUT_25, øre(100_000), quantity(1)), // 1000 net, 250 vat
    computeLine('registered_standard', OUTPUT_25, øre(40_000), quantity(2)), // 800 net, 200 vat
    computeLine('registered_standard', EXEMPT, øre(30_000), quantity(1)), // 300 net, 0 vat
  ];

  it('sums the line nets, VATs and grosses', () => {
    expect(invoiceTotals(lines)).toEqual({
      net: øre(210_000),
      vat: øre(45_000),
      gross: øre(255_000),
    });
  });

  it('totals equal the element-wise sums, for any set of lines', () => {
    const anyCode = fc.constantFrom(OUTPUT_25, FRITATT, EXEMPT);
    const aLine = anyCode.chain((c) =>
      fc
        .nat({ max: 1_000_000 })
        .map((p) => computeLine('registered_standard', c, øre(p), quantity(1))),
    );
    fc.assert(
      fc.property(fc.array(aLine, { maxLength: 20 }), (ls) => {
        const t = invoiceTotals(ls);
        expect(t.net).toBe(sumØre(ls.map((l) => l.net)));
        expect(t.vat).toBe(sumØre(ls.map((l) => l.vat)));
        expect(t.gross).toBe(addØre(t.net, t.vat));
      }),
    );
  });

  it('groups VAT by rate category, omitting empty buckets', () => {
    const breakdown = vatBreakdown(lines);
    expect(breakdown).toEqual([
      { rateCategory: 'regular', base: øre(180_000), vat: øre(45_000) },
      { rateCategory: 'none', base: øre(30_000), vat: ZERO },
    ]);
  });

  it('the breakdown bases sum back to the document net', () => {
    const anyCode = fc.constantFrom(OUTPUT_25, FRITATT, EXEMPT);
    const aLine = anyCode.chain((c) =>
      fc
        .nat({ max: 1_000_000 })
        .map((p) => computeLine('registered_standard', c, øre(p), quantity(1))),
    );
    fc.assert(
      fc.property(fc.array(aLine, { maxLength: 20 }), (ls) => {
        const base = sumØre(vatBreakdown(ls).map((b) => b.base));
        expect(base).toBe(invoiceTotals(ls).net);
      }),
    );
  });
});

describe('invoiceKid — deterministic, valid mod10 KID from the invoice number', () => {
  it('is a valid mod10 KID', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 9_999_999 }), (n) => {
        expect(isValidKidMod10(invoiceKid(n))).toBe(true);
      }),
    );
  });

  it('is deterministic and embeds the zero-padded number', () => {
    const k = invoiceKid(42);
    expect(k).toBe(invoiceKid(42));
    expect(k.startsWith('000042')).toBe(true); // 6-digit body + 1 control digit
    expect(k).toHaveLength(7);
  });

  it('rejects a non-positive number', () => {
    expect(() => invoiceKid(0)).toThrow(RangeError);
    expect(() => invoiceKid(-5)).toThrow(RangeError);
  });
});
