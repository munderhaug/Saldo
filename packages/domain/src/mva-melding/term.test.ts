import { describe, expect, it } from 'vitest';
import {
  ANNUAL_TERM,
  BIMONTHLY_TERMS,
  periodElementName,
  periodeValue,
  termKey,
  termMonths,
  type MvaTerm,
} from './term.js';

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
    expect(termMonths(ANNUAL_TERM)).toEqual({ fromMonth: 1, toMonth: 12 });
    expect(termKey(ANNUAL_TERM)).toBe('aar');
  });

  it('bimonthly terms cover contiguous, non-overlapping two-month windows spanning the year', () => {
    const windows = BIMONTHLY_TERMS.map(termMonths);
    expect(windows).toEqual([
      { fromMonth: 1, toMonth: 2 },
      { fromMonth: 3, toMonth: 4 },
      { fromMonth: 5, toMonth: 6 },
      { fromMonth: 7, toMonth: 8 },
      { fromMonth: 9, toMonth: 10 },
      { fromMonth: 11, toMonth: 12 },
    ]);
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
