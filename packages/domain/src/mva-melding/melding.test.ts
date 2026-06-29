import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { øre, sumØre, type Øre } from '../money/ore.js';
import { orgNr } from '../ids/org-nr.js';
import { indexTaxCodes, parseStandardTaxCodes } from '../saft/tax-codes.js';
import type { VatCode } from '../posting/types.js';
import { MVA_STATUSES, type MvaStatus } from '../vat/status.js';
import { ANNUAL_TERM } from './term.js';
import {
  generateMvaMelding,
  isMeldingReportable,
  reportsGrunnlag,
  type MvaMeldingMeta,
  type VatCodeAggregate,
} from './melding.js';
import { validateMvaMelding } from './validate.js';

// The REAL committed SAF-T list — codes are loaded, never hardcoded from memory (hard invariant §4.3).
const csv = readFileSync(
  new URL('../../../../db/reference/saf-t/tax-codes/Standard_Tax_Codes.csv', import.meta.url),
  'utf8',
);
const codeIndex = indexTaxCodes(parseStandardTaxCodes(csv));
const ORG = orgNr('974760673');

const meta = (mvaStatus: MvaStatus): MvaMeldingMeta => ({
  orgNr: ORG,
  year: 2026,
  term: ANNUAL_TERM,
  mvaStatus,
});

const agg = (code: string, grunnlagØre: Øre, merverdiavgiftØre: Øre): VatCodeAggregate => ({
  code: code as VatCode,
  grunnlagØre,
  merverdiavgiftØre,
});

describe('generateMvaMelding — MVA-status fork', () => {
  it.each(['under_threshold', 'unntatt'] as const)('files no melding when %s', (status) => {
    const r = generateMvaMelding(
      [agg('3', øre(20_000_00), øre(5_000_00))],
      meta(status),
      codeIndex,
    );
    expect(r.registered).toBe(false);
  });

  it.each(['registered_standard', 'registered_zero_rated'] as const)(
    'produces a melding when %s',
    (status) => {
      const r = generateMvaMelding([], meta(status), codeIndex);
      expect(r.registered).toBe(true);
    },
  );
});

describe('generateMvaMelding — line shape (the sign rule)', () => {
  it('an output sales code carries grunnlag + sats + positive VAT', () => {
    const r = generateMvaMelding(
      [agg('3', øre(20_000_00), øre(5_000_00))],
      meta('registered_standard'),
      codeIndex,
    );
    if (!r.registered) throw new Error('expected registered');
    expect(r.melding.lines).toEqual([
      { mvaKode: '3', grunnlagØre: øre(20_000_00), sats: '25', merverdiavgiftØre: øre(5_000_00) },
    ]);
    expect(r.melding.fastsattØre).toBe(øre(5_000_00));
  });

  it('a pure input-deduction code carries only a negative VAT (no grunnlag/sats)', () => {
    const r = generateMvaMelding(
      [agg('1', øre(0), øre(-2_500_00))],
      meta('registered_standard'),
      codeIndex,
    );
    if (!r.registered) throw new Error('expected registered');
    expect(r.melding.lines).toEqual([{ mvaKode: '1', merverdiavgiftØre: øre(-2_500_00) }]);
  });

  it('zero-rated / exempt turnover carries grunnlag with sats 0 and VAT 0', () => {
    const r = generateMvaMelding(
      [agg('52', øre(20_000_00), øre(0))],
      meta('registered_standard'),
      codeIndex,
    );
    if (!r.registered) throw new Error('expected registered');
    expect(r.melding.lines).toEqual([
      { mvaKode: '52', grunnlagØre: øre(20_000_00), sats: '0', merverdiavgiftØre: øre(0) },
    ]);
  });

  it('a no-VAT-treatment / outside-scope code (0/6/7/20) emits no line, even with a non-zero basis', () => {
    // These codes carry no VAT and are not return figures — a non-zero acquisition/turnover basis on
    // them must NOT leak a sats-0 grunnlag line (review §5). Note code 6 is outside the VAT Act.
    for (const code of ['0', '6', '7', '20']) {
      const r = generateMvaMelding(
        [agg(code, øre(10_000_00), øre(0))],
        meta('registered_standard'),
        codeIndex,
      );
      if (!r.registered) throw new Error('expected registered');
      expect(r.melding.lines).toEqual([]);
    }
  });

  it('a reverse-charge code reports the import basis (grunnlag) + its deduction leg', () => {
    // Saldo routes the self-account OUTPUT to code 3; the deduction + basis land on code 86.
    const r = generateMvaMelding(
      [agg('3', øre(0), øre(2_500_00)), agg('86', øre(10_000_00), øre(-2_500_00))],
      meta('registered_standard'),
      codeIndex,
    );
    if (!r.registered) throw new Error('expected registered');
    expect(r.melding.lines).toContainEqual({
      mvaKode: '86',
      grunnlagØre: øre(10_000_00),
      sats: '25',
      merverdiavgiftØre: øre(-2_500_00),
    });
    // Both legs land on the melding and the term nets to zero VAT (cash-neutral reverse charge).
    expect(r.melding.fastsattØre).toBe(øre(0));
  });
});

describe('generateMvaMelding — composition', () => {
  it('drops fully-zero aggregates and sorts lines by numeric code', () => {
    const r = generateMvaMelding(
      [
        agg('33', øre(8_000_00), øre(960_00)),
        agg('7', øre(0), øre(0)), // dropped
        agg('1', øre(0), øre(-400_00)),
        agg('3', øre(20_000_00), øre(5_000_00)),
      ],
      meta('registered_standard'),
      codeIndex,
    );
    if (!r.registered) throw new Error('expected registered');
    expect(r.melding.lines.map((l) => l.mvaKode)).toEqual(['1', '3', '33']);
  });

  it('throws on an aggregate carrying a code absent from the SAF-T list', () => {
    expect(() =>
      generateMvaMelding(
        [agg('999', øre(100_00), øre(25_00))],
        meta('registered_standard'),
        codeIndex,
      ),
    ).toThrow(/unknown SAF-T VAT code/);
  });

  it('an empty ledger yields a zero (nil) return for a registered org', () => {
    const r = generateMvaMelding([], meta('registered_zero_rated'), codeIndex);
    if (!r.registered) throw new Error('expected registered');
    expect(r.melding.lines).toEqual([]);
    expect(r.melding.fastsattØre).toBe(øre(0));
  });
});

// A code arbitrary drawn from the real list, with random øre figures (basis ≥ 0, VAT any sign).
const aggArb = fc
  .tuple(
    fc.constantFrom(...[...codeIndex.keys()]),
    fc.integer({ min: 0, max: 5_000_000 }),
    fc.integer({ min: -1_000_000, max: 1_000_000 }),
  )
  .map(([code, g, m]) => agg(code, øre(g), øre(m)));

describe('generateMvaMelding — properties', () => {
  it('fastsatt always equals the signed sum of line VAT (the tie-out), and is valid', () => {
    fc.assert(
      fc.property(fc.array(aggArb, { maxLength: 30 }), (aggs) => {
        // Dedupe by code (the query layer yields one row per code).
        const byCode = new Map(aggs.map((a) => [a.code, a]));
        const r = generateMvaMelding([...byCode.values()], meta('registered_standard'), codeIndex);
        if (!r.registered) throw new Error('expected registered');
        const sum = sumØre(r.melding.lines.map((l) => l.merverdiavgiftØre));
        expect(r.melding.fastsattØre).toBe(sum);
        expect(validateMvaMelding(r.melding, codeIndex).ok).toBe(true);
      }),
    );
  });

  it('grunnlag/sats presence matches each code basis-reporting nature', () => {
    fc.assert(
      fc.property(fc.array(aggArb, { minLength: 1, maxLength: 30 }), (aggs) => {
        const byCode = new Map(aggs.map((a) => [a.code, a]));
        const r = generateMvaMelding([...byCode.values()], meta('registered_standard'), codeIndex);
        if (!r.registered) throw new Error('expected registered');
        for (const line of r.melding.lines) {
          const saft = codeIndex.get(line.mvaKode)!;
          // No no-treatment/outside-scope code ever reaches a line (it is dropped upstream).
          expect(isMeldingReportable(saft)).toBe(true);
          if (reportsGrunnlag(saft)) {
            expect(line.grunnlagØre).toBeDefined();
            expect(line.sats).toBeDefined();
          } else {
            expect(line.grunnlagØre).toBeUndefined();
            expect(line.sats).toBeUndefined();
          }
        }
      }),
    );
  });

  it('an unregistered org never gets a melding, whatever the ledger', () => {
    const unreg = MVA_STATUSES.filter((s) => s === 'under_threshold' || s === 'unntatt');
    fc.assert(
      fc.property(
        fc.array(aggArb, { maxLength: 10 }),
        fc.constantFrom(...unreg),
        (aggs, status) => {
          expect(generateMvaMelding(aggs, meta(status), codeIndex).registered).toBe(false);
        },
      ),
    );
  });
});
