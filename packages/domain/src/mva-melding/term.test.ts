import { describe, expect, it } from 'vitest';
import { ANNUAL_TERM, periodElementName, periodeValue, termKey, type MvaTerm } from './term.js';

// Local fixture: the six bimonthly terms, in order (the runtime model keeps only the mapping —
// review 2026-07-03 §6 pruned the unused exported list + month-window helper as speculative).
const BIMONTHLY_TERMS: readonly MvaTerm[] = ([1, 2, 3, 4, 5, 6] as const).map((t) => ({
  kind: 'bimonthly',
  term: t,
}));

describe('MVA term model', () => {
  it('has six bimonthly terms in order', () => {
    expect(BIMONTHLY_TERMS).toHaveLength(6);
    expect(BIMONTHLY_TERMS.map(periodeValue)).toEqual([
      'januar-februar',
      'mars-april',
      'mai-juni',
      'juli-august',
      'september-oktober',
      'november-desember',
    ]);
  });

  it('the annual term maps to the schema aarlig value + element', () => {
    expect(periodeValue(ANNUAL_TERM)).toBe('aarlig');
    expect(periodElementName(ANNUAL_TERM)).toBe('skattleggingsperiodeAar');
    expect(termKey(ANNUAL_TERM)).toBe('aar');
  });

  it('every bimonthly term maps to the two-month schema element', () => {
    for (const t of BIMONTHLY_TERMS) {
      expect(periodElementName(t)).toBe('skattleggingsperiodeToMaaneder');
    }
  });

  it('term keys are unique per year', () => {
    const keys = [ANNUAL_TERM, ...BIMONTHLY_TERMS].map(termKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('termKey is stable for a bimonthly term', () => {
    const t: MvaTerm = { kind: 'bimonthly', term: 3 };
    expect(termKey(t)).toBe('T3');
  });
});
