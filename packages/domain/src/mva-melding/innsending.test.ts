import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { ANNUAL_TERM, type MvaTerm } from './term.js';
import { buildMvaMeldingInnsendingXml, MVA_INNSENDING_NAMESPACE } from './innsending.js';

const input = (term: MvaTerm = ANNUAL_TERM) => ({
  orgNr: '974760673',
  year: 2026,
  term,
  opprettetAv: 'Saldo',
});

describe('mvaMeldingInnsending envelope — grounded in the committed v1.0 schema', () => {
  it('serializes the annual term in exact schema sequence', () => {
    const xml = buildMvaMeldingInnsendingXml(input());
    expect(xml).toBe(
      '<?xml version="1.0" encoding="utf-8"?>' +
        `<mvaMeldingInnsending xmlns="${MVA_INNSENDING_NAMESPACE}">` +
        '<norskIdentifikator><organisasjonsnummer>974760673</organisasjonsnummer></norskIdentifikator>' +
        '<skattleggingsperiode>' +
        '<periode><skattleggingsperiodeAar>aarlig</skattleggingsperiodeAar></periode>' +
        '<aar>2026</aar>' +
        '</skattleggingsperiode>' +
        '<meldingskategori>alminnelig</meldingskategori>' +
        '<innsendingstype>komplett</innsendingstype>' +
        '<opprettetAv>Saldo</opprettetAv>' +
        '</mvaMeldingInnsending>',
    );
  });

  it('serializes every bimonthly term under the schema element and enum spelling', () => {
    const expected: Record<number, string> = {
      1: 'januar-februar',
      2: 'mars-april',
      3: 'mai-juni',
      4: 'juli-august',
      5: 'september-oktober',
      6: 'november-desember',
    };
    for (const term of [1, 2, 3, 4, 5, 6] as const) {
      const xml = buildMvaMeldingInnsendingXml(input({ kind: 'bimonthly', term }));
      expect(xml).toContain(
        `<periode><skattleggingsperiodeToMaaneder>${expected[term]}</skattleggingsperiodeToMaaneder></periode>`,
      );
    }
  });

  it('escapes the free-text opprettetAv (property: no raw < or " and no bare & survives)', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary', minLength: 1, maxLength: 40 }), (name) => {
        const xml = buildMvaMeldingInnsendingXml({ ...input(), opprettetAv: name });
        const inner = xml.slice(
          xml.indexOf('<opprettetAv>') + '<opprettetAv>'.length,
          xml.indexOf('</opprettetAv>'),
        );
        expect(inner.includes('<')).toBe(false);
        expect(inner.includes('"')).toBe(false);
        // Every ampersand in the output is the start of one of escapeXml's entities.
        expect(inner.replace(/&(amp|lt|gt|quot);/g, '')).not.toContain('&');
      }),
    );
  });
});
