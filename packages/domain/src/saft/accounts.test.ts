import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  classifyAccountType,
  indexAccounts,
  parseStandardAccounts,
  type SaftStandardAccount,
} from './accounts.js';
import type { AccountNo } from '../posting/types.js';

const read = (p: string): string =>
  readFileSync(new URL(`../../../../db/reference/saf-t/accounts/${p}`, import.meta.url), 'utf8');

const twoChar = parseStandardAccounts(read('General_Ledger_Standard_Accounts_2_character.csv'));
const fourChar = parseStandardAccounts(read('General_Ledger_Standard_Accounts_4_character.csv'));

describe('parseStandardAccounts — official lists', () => {
  it('parses every row of both committed lists', () => {
    expect(twoChar).toHaveLength(74);
    expect(fourChar).toHaveLength(745);
  });

  it('handles the quoted 2-character list (descriptions contain commas)', () => {
    const a = indexAccounts(twoChar).get('12' as SaftStandardAccount['id']);
    expect(a?.descriptionNo).toBe('Transportmidler, inventar, maskiner o.l.');
    expect(a?.descriptionEn).toBe('Means of transport, fixtures and fittings, machinery etc.');
  });

  it('handles the unquoted 4-character list (commas, no quotes)', () => {
    const a = indexAccounts(fourChar).get('1000' as SaftStandardAccount['id']);
    expect(a?.descriptionNo).toBe('Utvikling, ervervet');
    expect(a?.descriptionEn).toBe('Development, acquired');
  });

  it('every record has a non-empty id and descriptions', () => {
    for (const a of [...twoChar, ...fourChar]) {
      expect(a.id.length).toBeGreaterThan(0);
      expect(a.descriptionNo.length).toBeGreaterThan(0);
    }
  });
});

describe('classifyAccountType — kontoklasse from the leading digit', () => {
  it('classifies the anchor accounts of each class', () => {
    const cases: ReadonlyArray<[string, ReturnType<typeof classifyAccountType>]> = [
      ['1000', 'asset'], // Utvikling, ervervet — eiendeler
      ['2700', 'equity_liability'], // Utgående mva — skyldige offentlige avgifter
      ['3000', 'revenue'], // Salgsinntekt
      ['4000', 'expense'], // Varekostnad
      ['5000', 'expense'], // Lønn
      ['6000', 'expense'], // Annen driftskostnad
      ['8160', 'financial'], // Finansposter
    ];
    for (const [id, expected] of cases) {
      expect(classifyAccountType(id as AccountNo)).toBe(expected);
    }
  });

  it('classifies every committed standard account into a known class (never "other")', () => {
    for (const a of fourChar) {
      const type = classifyAccountType(a.id);
      expect(type).not.toBe('other');
      // The leading digit and the class must agree.
      expect(type).toBe(classifyAccountType(a.id.charAt(0) as AccountNo));
    }
  });

  it('falls open to "other" for an unexpected leading digit', () => {
    expect(classifyAccountType('9999' as AccountNo)).toBe('other');
  });
});

describe('parseStandardAccounts — parser robustness', () => {
  it('honours quoted fields containing the delimiter and escaped quotes', () => {
    const fixture =
      'AccountID;DescriptionNOB;DescriptionENG\n' +
      '1500;"Kundefordringer; netto";"Trade receivables, ""net"""\n';
    const parsed = parseStandardAccounts(fixture);
    expect(parsed[0]?.id).toBe('1500');
    expect(parsed[0]?.descriptionNo).toBe('Kundefordringer; netto');
    expect(parsed[0]?.descriptionEn).toBe('Trade receivables, "net"');
  });
});
