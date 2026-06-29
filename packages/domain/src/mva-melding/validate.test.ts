import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { øre } from '../money/ore.js';
import { orgNr, type OrgNr } from '../ids/org-nr.js';
import { indexTaxCodes, parseStandardTaxCodes } from '../saft/tax-codes.js';
import type { VatCode } from '../posting/types.js';
import { ANNUAL_TERM } from './term.js';
import type { MvaMelding } from './melding.js';
import { validateMvaMelding } from './validate.js';

const codeIndex = indexTaxCodes(
  parseStandardTaxCodes(
    readFileSync(
      new URL('../../../../db/reference/saf-t/tax-codes/Standard_Tax_Codes.csv', import.meta.url),
      'utf8',
    ),
  ),
);
const code = (c: string): VatCode => c as VatCode;

const valid = (over: Partial<MvaMelding> = {}): MvaMelding => ({
  orgNr: orgNr('974760673'),
  year: 2026,
  term: ANNUAL_TERM,
  kategori: 'alminnelig',
  lines: [
    {
      mvaKode: code('3'),
      grunnlagØre: øre(20_000_00),
      sats: '25',
      merverdiavgiftØre: øre(5_000_00),
    },
    { mvaKode: code('1'), merverdiavgiftØre: øre(-2_500_00) },
  ],
  fastsattØre: øre(2_500_00),
  ...over,
});

const rules = (m: MvaMelding): string[] =>
  validateMvaMelding(m, codeIndex).violations.map((v) => v.rule);

describe('validateMvaMelding', () => {
  it('passes a well-formed, tied-out melding', () => {
    expect(validateMvaMelding(valid(), codeIndex).ok).toBe(true);
  });

  it('flags a broken tie-out (fastsatt ≠ Σ line VAT)', () => {
    expect(rules(valid({ fastsattØre: øre(9_999_00) }))).toContain('MVA-TIEOUT');
  });

  it('flags an org number that is not 9 digits', () => {
    expect(rules(valid({ orgNr: '12345' as OrgNr }))).toContain('MVA-ORG');
  });

  it('flags an unknown VAT code', () => {
    expect(
      rules(
        valid({
          lines: [{ mvaKode: code('999'), merverdiavgiftØre: øre(0) }],
          fastsattØre: øre(0),
        }),
      ),
    ).toContain('MVA-KODE');
  });

  it('flags a sats outside the committed code list', () => {
    expect(
      rules(
        valid({
          lines: [
            { mvaKode: code('3'), grunnlagØre: øre(100_00), sats: '23', merverdiavgiftØre: øre(0) },
          ],
          fastsattØre: øre(0),
        }),
      ),
    ).toContain('MVA-SATS');
  });

  it('flags a basis-reporting code missing its grunnlag', () => {
    expect(
      rules(
        valid({ lines: [{ mvaKode: code('3'), merverdiavgiftØre: øre(0) }], fastsattØre: øre(0) }),
      ),
    ).toContain('MVA-GRUNNLAG');
  });

  it('flags a pure input-deduction code that wrongly carries a grunnlag', () => {
    expect(
      rules(
        valid({
          lines: [
            { mvaKode: code('1'), grunnlagØre: øre(100_00), sats: '25', merverdiavgiftØre: øre(0) },
          ],
          fastsattØre: øre(0),
        }),
      ),
    ).toContain('MVA-GRUNNLAG');
  });

  it('flags a non-digit KID', () => {
    expect(rules(valid({ kid: 'abc' }))).toContain('MVA-KID');
  });

  it('flags a no-VAT-treatment / outside-scope code on the melding (MVA-KODE-SCOPE)', () => {
    // Code 6 is outside the VAT Act — it must not appear on the melding at all (review §5).
    expect(
      rules(
        valid({
          lines: [
            {
              mvaKode: code('6'),
              grunnlagØre: øre(10_000_00),
              sats: '0',
              merverdiavgiftØre: øre(0),
            },
          ],
          fastsattØre: øre(0),
        }),
      ),
    ).toContain('MVA-KODE-SCOPE');
  });
});
