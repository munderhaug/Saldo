import { describe, expect, it } from 'vitest';
import { formatIsoDate, isoDayOrdinal } from './iso-date.js';

describe('formatIsoDate — Norwegian day form', () => {
  it('formats a strict ISO date', () => {
    expect(formatIsoDate('2026-06-01')).toBe('01.06.2026');
  });
  it('returns malformed input unchanged (visible, never a crash)', () => {
    expect(formatIsoDate('not-a-date')).toBe('not-a-date');
    expect(formatIsoDate('')).toBe('');
  });
});

describe('isoDayOrdinal — the shared day arithmetic', () => {
  it('parses strict dates and rejects calendar overflow', () => {
    expect(isoDayOrdinal('1970-01-01')).toBe(0);
    expect(isoDayOrdinal('1970-01-02')).toBe(1);
    expect(isoDayOrdinal('2026-02-31')).toBeNull();
    expect(isoDayOrdinal(null)).toBeNull();
  });
});
