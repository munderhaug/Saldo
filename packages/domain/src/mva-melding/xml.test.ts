import { describe, expect, it } from 'vitest';
import { øre, øreToKroner } from '../money/ore.js';
import { orgNr } from '../ids/org-nr.js';
import type { VatCode } from '../posting/types.js';
import { ANNUAL_TERM, type MvaTerm } from './term.js';
import type { MvaMelding } from './melding.js';
import { buildMvaMeldingXml, MVA_MELDING_NAMESPACE } from './xml.js';

const code = (c: string): VatCode => c as VatCode;

const SYSTEM = {
  regnskapssystemsreferanse: 'saldo-1',
  systemnavn: 'Saldo',
  systemversjon: '0.0.0',
};

const melding = (over: Partial<MvaMelding> = {}): MvaMelding => ({
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

describe('øreToKroner — whole-kroner reporting boundary', () => {
  it('rounds half away from zero, both signs', () => {
    expect(øreToKroner(øre(2_500_00))).toBe(2500);
    expect(øreToKroner(øre(-2_500_00))).toBe(-2500);
    expect(øreToKroner(øre(150))).toBe(2); // 1.50 kr → 2
    expect(øreToKroner(øre(149))).toBe(1);
    expect(øreToKroner(øre(-150))).toBe(-2);
    expect(øreToKroner(øre(0))).toBe(0);
  });
});

describe('buildMvaMeldingXml', () => {
  it('emits the namespace, the annual period, and one line per spec line', () => {
    const xml = buildMvaMeldingXml(melding(), SYSTEM);
    expect(xml).toContain(`<mvaMeldingDto xmlns="${MVA_MELDING_NAMESPACE}">`);
    expect(xml).toContain('<skattleggingsperiodeAar>aarlig</skattleggingsperiodeAar>');
    expect(xml).toContain('<aar>2026</aar>');
    expect(xml).toContain('<meldingskategori>alminnelig</meldingskategori>');
    expect(xml).toContain(
      '<skattepliktig><organisasjonsnummer>974760673</organisasjonsnummer></skattepliktig>',
    );
    expect(xml.match(/<mvaSpesifikasjonslinje>/g)).toHaveLength(2);
    // Output line: kode + grunnlag + sats + positive VAT.
    expect(xml).toContain(
      '<mvaSpesifikasjonslinje><mvaKode>3</mvaKode><grunnlag>20000</grunnlag><sats>25</sats><merverdiavgift>5000</merverdiavgift></mvaSpesifikasjonslinje>',
    );
    // Input line: only the negative VAT.
    expect(xml).toContain(
      '<mvaSpesifikasjonslinje><mvaKode>1</mvaKode><merverdiavgift>-2500</merverdiavgift></mvaSpesifikasjonslinje>',
    );
  });

  it('fastsattMerverdiavgift in the XML equals the sum of the rounded line amounts (kroner tie-out)', () => {
    // Lines that each round but whose øre total would round differently — the document must tie out in kroner.
    const m = melding({
      lines: [
        { mvaKode: code('3'), grunnlagØre: øre(40), sats: '25', merverdiavgiftØre: øre(150) }, // → 2
        { mvaKode: code('31'), grunnlagØre: øre(40), sats: '15', merverdiavgiftØre: øre(150) }, // → 2
      ],
      fastsattØre: øre(300),
    });
    const xml = buildMvaMeldingXml(m, SYSTEM);
    expect(xml).toContain('<fastsattMerverdiavgift>4</fastsattMerverdiavgift>'); // 2 + 2, not round(300/100)=3
  });

  it('includes the KID only when present', () => {
    expect(buildMvaMeldingXml(melding({ kid: '12345678' }), SYSTEM)).toContain(
      '<kundeIdentifikasjonsnummer>12345678</kundeIdentifikasjonsnummer>',
    );
    expect(buildMvaMeldingXml(melding(), SYSTEM)).toContain(
      '<betalingsinformasjon></betalingsinformasjon>',
    );
  });

  it('escapes XML metacharacters in the system reference', () => {
    const xml = buildMvaMeldingXml(melding(), { ...SYSTEM, systemnavn: 'A & B <Co>' });
    expect(xml).toContain('<systemnavn>A &amp; B &lt;Co&gt;</systemnavn>');
  });

  it('emits the bimonthly period element for a bimonthly term', () => {
    const term: MvaTerm = { kind: 'bimonthly', term: 2 };
    const xml = buildMvaMeldingXml(melding({ term }), SYSTEM);
    expect(xml).toContain(
      '<skattleggingsperiodeToMaaneder>mars-april</skattleggingsperiodeToMaaneder>',
    );
  });
});
