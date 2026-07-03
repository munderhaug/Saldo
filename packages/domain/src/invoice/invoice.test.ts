import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { addØre, eqØre, mulRate, sumØre, øre, ZERO } from '../money/ore.js';
import { isValidKidMod10 } from '../ids/kid.js';
import { indexTaxCodes, parseStandardTaxCodes, type SaftTaxCode } from '../saft/tax-codes.js';
import { MVA_STATUSES, type MvaStatus } from '../vat/status.js';
import {
  checkSalesLine,
  computeLine,
  formatVatRate,
  frozenVatBreakdown,
  invoiceKid,
  invoiceTotals,
  lineNet,
  quantity,
  vatBreakdown,
  type FrozenLine,
} from './invoice.js';
import { rate } from '../money/ore.js';

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
const RC_DOMESTIC_SALE = code('51'); // domestic reverse-charge SALE (omvendt avgiftsplikt) — revenue at net
const RC_FOREIGN_DEDUCT = code('86'); // services bought from abroad, deductible — a PURCHASE code
const RC_FOREIGN_NONDEDUCT = code('87'); // services bought from abroad, non-deductible — a PURCHASE code
const RC_IMPORT_GOODS = code('81'); // import of goods (basis) — a PURCHASE code

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

  describe('checkSalesLine — the reverse-charge gate (vat-reverse-charge)', () => {
    it('allows the domestic reverse-charge SALE code (51): a sale, posted at net', () => {
      for (const status of [...REGISTERED, ...UNREGISTERED] as MvaStatus[]) {
        const verdict = checkSalesLine(status, RC_DOMESTIC_SALE);
        expect(verdict.ok).toBe(true);
        expect(verdict.treatment).toBe('reverse-charge');
        expect(verdict.reason).toBeUndefined();
        // Revenue at net: a reverse-charge sale charges NO output VAT (the buyer self-accounts).
        expect(computeLine(status, RC_DOMESTIC_SALE, øre(100_000), quantity(1)).vat).toBe(ZERO);
      }
    });

    it.each([
      ['86 foreign service, deductible', RC_FOREIGN_DEDUCT],
      ['87 foreign service, non-deductible', RC_FOREIGN_NONDEDUCT],
      ['81 import of goods', RC_IMPORT_GOODS],
    ])('blocks the buyer-self-account purchase code %s on a sale', (_label, c) => {
      for (const status of [...REGISTERED, ...UNREGISTERED] as MvaStatus[]) {
        const verdict = checkSalesLine(status, c);
        expect(verdict.ok).toBe(false);
        expect(verdict.reason).toBe('reverse-charge-not-a-sale');
        // A blocked line never charges VAT (the caller refuses to issue it).
        expect(computeLine(status, c, øre(100_000), quantity(1)).vat).toBe(ZERO);
      }
    });

    it('never returns the reverse-charge advisory reason (the sales gate decides every RC code)', () => {
      for (const c of [
        RC_DOMESTIC_SALE,
        RC_FOREIGN_DEDUCT,
        RC_FOREIGN_NONDEDUCT,
        RC_IMPORT_GOODS,
      ]) {
        for (const status of MVA_STATUSES) {
          expect(checkSalesLine(status, c).reason).not.toBe('reverse-charge-deferred');
        }
      }
    });
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

  it('net sums the lines; VAT is category-level (Σ breakdown), gross = net + vat — any lines', () => {
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
        expect(t.vat).toBe(sumØre(vatBreakdown(ls).map((b) => b.vat)));
        expect(t.gross).toBe(addØre(t.net, t.vat));
        // Category-level never drifts more than ½ øre per charging line from the per-line sum.
        const perLine = sumØre(ls.map((l) => l.vat));
        expect(Math.abs((t.vat as number) - (perLine as number))).toBeLessThanOrEqual(
          Math.ceil(ls.length / 2),
        );
      }),
    );
  });

  it('VAT is rounded ONCE per category, not per line (BR-CO-17 / ADR 0054 regression)', () => {
    // Three 6-øre lines at 25 %: per-line rounding gives 2+2+2 = 6 øre (each 1,5 rounds up half
    // away from zero); the category computation gives roundØre(18 × 0,25) = roundØre(4,5) = 5 øre.
    const tiny = Array.from({ length: 3 }, () =>
      computeLine('registered_standard', OUTPUT_25, øre(6), quantity(1)),
    );
    expect(sumØre(tiny.map((l) => l.vat))).toBe(øre(6)); // the per-line sum (what we must NOT use)
    expect(invoiceTotals(tiny).vat).toBe(øre(5)); // the category-level document VAT
    expect(vatBreakdown(tiny)).toEqual([{ rateCategory: 'regular', base: øre(18), vat: øre(5) }]);
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

describe('frozenVatBreakdown — per-rate MVA-grunnlag from FROZEN amounts (no recompute)', () => {
  const frozen: FrozenLine[] = [
    { net: øre(180_000), vat: øre(45_000), rateCategory: 'regular' },
    { net: øre(30_000), vat: ZERO, rateCategory: 'none' },
  ];

  it('groups the stored net/VAT by rate category, carrying the rate, omitting empty buckets', () => {
    expect(frozenVatBreakdown(frozen)).toEqual([
      { rateCategory: 'regular', vatRate: rate(0.25), base: øre(180_000), vat: øre(45_000) },
      { rateCategory: 'none', vatRate: rate(0), base: øre(30_000), vat: ZERO },
    ]);
  });

  it('recomputes each bucket VAT category-level from the frozen NETS (ADR 0054), never Σ line VATs', () => {
    // Two regular-rate lines whose stored per-line VATs (7 + 3 øre) do not sum to 25 % of the base:
    // the bucket must carry roundØre(0,25 × 20 000) = 5 000 øre — the same category-level figure the
    // document froze at issue — not the 10-øre per-line sum.
    const lines: FrozenLine[] = [
      { net: øre(100_00), vat: øre(7), rateCategory: 'regular' },
      { net: øre(100_00), vat: øre(3), rateCategory: 'regular' },
    ];
    expect(frozenVatBreakdown(lines)).toEqual([
      { rateCategory: 'regular', vatRate: rate(0.25), base: øre(200_00), vat: øre(50_00) },
    ]);
  });

  it('a non-charging frozen line (stored VAT 0) contributes to the base but never the VAT', () => {
    const lines: FrozenLine[] = [
      { net: øre(100_00), vat: øre(25_00), rateCategory: 'regular' },
      { net: øre(100_00), vat: ZERO, rateCategory: 'regular' }, // e.g. issued before registration
    ];
    expect(frozenVatBreakdown(lines)).toEqual([
      { rateCategory: 'regular', vatRate: rate(0.25), base: øre(200_00), vat: øre(25_00) },
    ]);
  });

  it('bucket bases sum to the whole and VAT is the charging base × rate, for any frozen lines', () => {
    const cat = fc.constantFrom<FrozenLine['rateCategory']>(
      'regular',
      'reduced-low',
      'zero',
      'none',
    );
    const aLine: fc.Arbitrary<FrozenLine> = fc.record({
      net: fc.nat({ max: 1_000_000 }).map((n) => øre(n)),
      vat: fc.nat({ max: 250_000 }).map((n) => øre(n)),
      rateCategory: cat,
    });
    fc.assert(
      fc.property(fc.array(aLine, { maxLength: 20 }), (ls) => {
        for (const bucket of frozenVatBreakdown(ls)) {
          const inCat = ls.filter((l) => l.rateCategory === bucket.rateCategory);
          expect(bucket.base).toBe(sumØre(inCat.map((l) => l.net)));
          const chargingBase = sumØre(inCat.filter((l) => l.vat !== ZERO).map((l) => l.net));
          expect(bucket.vat).toBe(mulRate(chargingBase, bucket.vatRate));
        }
        // The bucket bases sum back to the whole — nothing dropped, nothing double-counted.
        expect(sumØre(frozenVatBreakdown(ls).map((b) => b.base))).toBe(
          sumØre(ls.map((l) => l.net)),
        );
      }),
    );
  });
});

describe('formatVatRate — Norwegian percentage for the document VAT column', () => {
  it('renders whole and fractional percentages without trailing zeros', () => {
    expect(formatVatRate(rate(0.25))).toBe('25\u00A0%');
    expect(formatVatRate(rate(0.15))).toBe('15\u00A0%');
    expect(formatVatRate(rate(0))).toBe('0\u00A0%');
    expect(formatVatRate(rate(0.1111))).toBe('11,11\u00A0%');
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
