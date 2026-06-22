import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { indexAccounts, parseStandardAccounts, type SaftStandardAccount } from './accounts.js';

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
