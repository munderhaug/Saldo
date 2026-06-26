import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { øre } from '../money/ore.js';
import {
  applyDirection,
  decimalToØre,
  normaliseCamtEntry,
  normaliseGoCardlessTx,
  transactionDedupKey,
  type NormalisedBankTx,
} from './transaction.js';

describe('decimalToØre', () => {
  it.each([
    ['0', 0],
    ['0.00', 0],
    ['45', 4500],
    ['45.0', 4500],
    ['45.00', 4500],
    ['45.5', 4550],
    ['45.50', 4550],
    ['1234.56', 123456],
    ['0.01', 1],
    ['-15.30', -1530],
    ['-0.00', 0], // normalised to +0
    ['45.000', 4500], // trailing zeros beyond 2 places dropped
  ])('parses %s → %i øre', (input, expected) => {
    expect(decimalToØre(input)).toBe(expected);
  });

  it('rejects malformed / sub-øre amounts rather than rounding', () => {
    for (const bad of [
      '',
      'abc',
      '1,50',
      '1.234',
      '45.001',
      '1 234.50',
      '1e3',
      '--5',
      '.5',
      '5.',
    ]) {
      expect(decimalToØre(bad)).toBeNull();
    }
  });

  it('never produces -0', () => {
    expect(Object.is(decimalToØre('-0.00'), -0)).toBe(false);
  });

  it('round-trips: |øre|/100 formatted back parses to the same magnitude', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 9_999_999_999 }), (n) => {
        const decimal = `${Math.floor(n / 100)}.${String(n % 100).padStart(2, '0')}`;
        expect(decimalToØre(decimal)).toBe(n);
      }),
    );
  });
});

describe('applyDirection', () => {
  it('credit keeps a positive magnitude; debit flips to negative', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1_000_000_000 }), (n) => {
        const mag = øre(n);
        expect(applyDirection(mag, 'credit')).toBe(n);
        expect(applyDirection(mag, 'debit')).toBe(n === 0 ? 0 : -n);
      }),
    );
  });

  it('takes the magnitude regardless of the input sign', () => {
    expect(applyDirection(øre(-500), 'credit')).toBe(500);
    expect(applyDirection(øre(-500), 'debit')).toBe(-500);
  });
});

describe('normaliseCamtEntry', () => {
  const base = { amount: '100.00', creditDebit: 'CRDT', currency: 'NOK' };

  it('CRDT → positive, DBIT → negative øre', () => {
    const credit = normaliseCamtEntry({ ...base, creditDebit: 'CRDT' });
    const debit = normaliseCamtEntry({ ...base, creditDebit: 'DBIT' });
    expect(credit.ok && credit.tx.amount).toBe(10000);
    expect(debit.ok && debit.tx.amount).toBe(-10000);
  });

  it('uppercases currency and the credit/debit indicator', () => {
    const r = normaliseCamtEntry({ ...base, creditDebit: 'dbit', currency: 'eur' });
    expect(r.ok && r.tx).toMatchObject({ amount: -10000, currency: 'EUR' });
  });

  it('keeps valid dates, nulls unparseable ones, trims text', () => {
    const r = normaliseCamtEntry({
      ...base,
      bookingDate: '2026-06-01',
      valueDate: 'not-a-date',
      remittanceInfo: '  Faktura 42  ',
      counterparty: '  Kunde AS ',
      externalId: ' ref-1 ',
    });
    expect(r.ok && r.tx).toMatchObject({
      bookingDate: '2026-06-01',
      valueDate: null,
      remittanceInfo: 'Faktura 42',
      counterparty: 'Kunde AS',
      externalId: 'ref-1',
    });
  });

  it('rejects a bad direction, currency, or amount', () => {
    expect(normaliseCamtEntry({ ...base, creditDebit: 'XX' })).toEqual({
      ok: false,
      reason: 'invalid-direction',
    });
    expect(normaliseCamtEntry({ ...base, currency: 'kroner' })).toEqual({
      ok: false,
      reason: 'invalid-currency',
    });
    expect(normaliseCamtEntry({ ...base, amount: '1,50' })).toEqual({
      ok: false,
      reason: 'invalid-amount',
    });
  });
});

describe('normaliseGoCardlessTx', () => {
  it('takes the sign from the amount string', () => {
    const out = normaliseGoCardlessTx({ amount: '-15.30', currency: 'NOK' });
    const inn = normaliseGoCardlessTx({ amount: '45.00', currency: 'NOK' });
    expect(out.ok && out.tx).toMatchObject({ amount: -1530, currency: 'NOK' });
    expect(inn.ok && inn.tx.amount).toBe(4500);
  });

  it('rejects an invalid currency / amount', () => {
    expect(normaliseGoCardlessTx({ amount: '1.00', currency: '' })).toEqual({
      ok: false,
      reason: 'invalid-currency',
    });
    expect(normaliseGoCardlessTx({ amount: 'x', currency: 'NOK' })).toEqual({
      ok: false,
      reason: 'invalid-amount',
    });
  });
});

describe('transactionDedupKey', () => {
  const tx = (over: Partial<NormalisedBankTx>): NormalisedBankTx => ({
    externalId: '',
    amount: øre(100),
    currency: 'NOK',
    bookingDate: null,
    valueDate: null,
    remittanceInfo: null,
    counterparty: null,
    ...over,
  });

  it('uses externalId when present', () => {
    expect(transactionDedupKey(tx({ externalId: 'abc' }))).toBe('abc');
  });

  it('derives a stable content fingerprint when externalId is empty', () => {
    const a = transactionDedupKey(tx({ bookingDate: '2026-06-01', remittanceInfo: 'x' }));
    const b = transactionDedupKey(tx({ bookingDate: '2026-06-01', remittanceInfo: 'x' }));
    expect(a).toBe(b);
    expect(a).toContain('fp|');
  });

  it('different content → different fingerprint', () => {
    const a = transactionDedupKey(tx({ amount: øre(100) }));
    const b = transactionDedupKey(tx({ amount: øre(200) }));
    expect(a).not.toBe(b);
  });
});
