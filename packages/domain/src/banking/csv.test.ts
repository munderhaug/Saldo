import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { inferCsvColumnMap, parseBankCsv, parseCsvStatement } from './csv.js';

describe('inferCsvColumnMap', () => {
  it('maps common Norwegian bank headers', () => {
    const map = inferCsvColumnMap(['Bokføringsdato', 'Beskrivelse', 'Beløp', 'Valuta']);
    expect(map).toEqual({
      bookingDate: 'Bokføringsdato',
      remittanceInfo: 'Beskrivelse',
      amount: 'Beløp',
      currency: 'Valuta',
    });
  });

  it('maps an in/out pair and English headers', () => {
    const map = inferCsvColumnMap(['Date', 'Text', 'Inn', 'Ut']);
    expect(map).toEqual({
      bookingDate: 'Date',
      remittanceInfo: 'Text',
      amountIn: 'Inn',
      amountOut: 'Ut',
    });
  });

  it('prefers a single signed amount over an in/out pair', () => {
    const map = inferCsvColumnMap(['Beløp', 'Inn', 'Ut']);
    expect(map.amount).toBe('Beløp');
    expect(map.amountIn).toBeUndefined();
    expect(map.amountOut).toBeUndefined();
  });

  it('leaves unknown headers unmapped', () => {
    expect(inferCsvColumnMap(['Foo', 'Bar'])).toEqual({});
  });
});

describe('parseCsvStatement — single signed amount', () => {
  const csv = [
    'Bokføringsdato;Beskrivelse;Beløp;Valuta',
    '2026-06-01;Faktura 42;1 234,50;NOK',
    '2026-06-02;Kjøp;-99,90;NOK',
  ].join('\n');

  it('auto-detects the ; delimiter and parses signed øre', () => {
    const result = parseCsvStatement(csv, {
      map: {
        bookingDate: 'Bokføringsdato',
        remittanceInfo: 'Beskrivelse',
        amount: 'Beløp',
        currency: 'Valuta',
      },
      defaultCurrency: 'NOK',
    });
    expect(result.errors).toEqual([]);
    expect(result.transactions).toEqual([
      {
        externalId: '',
        amount: 123450,
        currency: 'NOK',
        bookingDate: '2026-06-01',
        valueDate: null,
        remittanceInfo: 'Faktura 42',
        counterparty: null,
      },
      {
        externalId: '',
        amount: -9990,
        currency: 'NOK',
        bookingDate: '2026-06-02',
        valueDate: null,
        remittanceInfo: 'Kjøp',
        counterparty: null,
      },
    ]);
  });

  it('falls back to the default currency when no currency column maps', () => {
    const result = parseCsvStatement('Beløp\n100,00', {
      map: { amount: 'Beløp' },
      defaultCurrency: 'EUR',
    });
    expect(result.transactions[0]?.currency).toBe('EUR');
    expect(result.transactions[0]?.amount).toBe(10000);
  });
});

describe('parseCsvStatement — in/out columns', () => {
  it('credit column positive, debit column negative', () => {
    const csv = 'Dato,Inn,Ut\n2026-06-01,500.00,\n2026-06-02,,120.50';
    const result = parseCsvStatement(csv, {
      map: { bookingDate: 'Dato', amountIn: 'Inn', amountOut: 'Ut' },
      defaultCurrency: 'NOK',
    });
    expect(result.errors).toEqual([]);
    expect(result.transactions.map((t) => t.amount)).toEqual([50000, -12050]);
  });
});

describe('parseCsvStatement — robustness', () => {
  it('handles quoted fields containing the delimiter and quotes', () => {
    const csv = 'Beløp;Beskrivelse\n100,00;"Hansen; Olsen ""AS"""';
    const result = parseCsvStatement(csv, {
      map: { amount: 'Beløp', remittanceInfo: 'Beskrivelse' },
      defaultCurrency: 'NOK',
    });
    expect(result.transactions[0]?.remittanceInfo).toBe('Hansen; Olsen "AS"');
  });

  it('strips a BOM and tolerates a trailing newline + CRLF', () => {
    const csv = '﻿Beløp\r\n100,00\r\n';
    const result = parseCsvStatement(csv, { map: { amount: 'Beløp' }, defaultCurrency: 'NOK' });
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0]?.amount).toBe(10000);
  });

  it('collects unparseable rows as errors with their line number, not silently dropped', () => {
    const csv = 'Beløp\n100,00\nrubbish\n50,00';
    const result = parseCsvStatement(csv, { map: { amount: 'Beløp' }, defaultCurrency: 'NOK' });
    expect(result.transactions.map((t) => t.amount)).toEqual([10000, 5000]);
    expect(result.errors).toEqual([{ line: 3, reason: 'invalid-amount' }]);
  });

  it('returns nothing for a header-only or empty file', () => {
    expect(
      parseCsvStatement('Beløp', { map: { amount: 'Beløp' }, defaultCurrency: 'NOK' }),
    ).toEqual({
      transactions: [],
      errors: [],
    });
    expect(parseCsvStatement('', { map: { amount: 'Beløp' }, defaultCurrency: 'NOK' })).toEqual({
      transactions: [],
      errors: [],
    });
  });
});

describe('parseBankCsv — zero-config inference', () => {
  it('infers the column map + delimiter and parses a Norwegian statement', () => {
    const csv = 'Bokføringsdato;Beskrivelse;Beløp\n2026-06-01;Faktura;1 234,50';
    const result = parseBankCsv(csv, 'NOK');
    expect(result.mapped).toBe(true);
    expect(result.transactions).toEqual([
      {
        externalId: '',
        amount: 123450,
        currency: 'NOK',
        bookingDate: '2026-06-01',
        valueDate: null,
        remittanceInfo: 'Faktura',
        counterparty: null,
      },
    ]);
  });

  it('reports mapped: false when no amount column is recognised', () => {
    const result = parseBankCsv('Foo,Bar\n1,2', 'NOK');
    expect(result).toEqual({ transactions: [], errors: [], mapped: false });
  });
});

describe('parseCsvStatement — property: signed amounts are exact integer øre', () => {
  it('a single signed-amount column round-trips øre with no float drift', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: -9_999_999, max: 9_999_999 }), { minLength: 1, maxLength: 30 }),
        (ores) => {
          const lines = ['Beløp'];
          for (const n of ores) {
            const sign = n < 0 ? '-' : '';
            const abs = Math.abs(n);
            lines.push(`${sign}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`);
          }
          // Explicit ';' delimiter: a single comma-decimal column would otherwise collide with the
          // ',' delimiter (exactly why Norwegian CSVs use ';') — this property tests amount parsing.
          const result = parseCsvStatement(lines.join('\n'), {
            map: { amount: 'Beløp' },
            defaultCurrency: 'NOK',
            delimiter: ';',
          });
          expect(result.errors).toEqual([]);
          expect(result.transactions.map((t) => t.amount)).toEqual(ores);
        },
      ),
    );
  });
});
