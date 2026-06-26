import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { øre, type Øre } from '../money/ore.js';
import { isBalanced, totalCredit, totalDebit } from '../posting/balance.js';
import type { AccountNo } from '../posting/types.js';
import { deriveSettlement } from './settlement.js';

const BANK = '1920' as AccountNo;
const AR = '1500' as AccountNo;
const AP = '2400' as AccountNo;

describe('deriveSettlement', () => {
  it('incoming customer payment debits bank, credits the receivable', () => {
    const v = deriveSettlement({
      amount: øre(125_00),
      direction: 'incoming',
      bankAccount: BANK,
      counterAccount: AR,
    });
    expect(v.type).toBe('bank');
    expect(v.lines).toEqual([
      { account: BANK, debit: øre(125_00), credit: øre(0) },
      { account: AR, debit: øre(0), credit: øre(125_00) },
    ]);
    expect(isBalanced(v)).toBe(true);
  });

  it('outgoing supplier payment is the exact inverse', () => {
    const v = deriveSettlement({
      amount: øre(80_00),
      direction: 'outgoing',
      bankAccount: BANK,
      counterAccount: AP,
    });
    expect(v.lines).toEqual([
      { account: BANK, debit: øre(0), credit: øre(80_00) },
      { account: AP, debit: øre(80_00), credit: øre(0) },
    ]);
    expect(isBalanced(v)).toBe(true);
  });

  it('rejects a non-positive amount', () => {
    expect(() =>
      deriveSettlement({
        amount: øre(0),
        direction: 'incoming',
        bankAccount: BANK,
        counterAccount: AR,
      }),
    ).toThrow(RangeError);
    expect(() =>
      deriveSettlement({
        amount: øre(-1),
        direction: 'incoming',
        bankAccount: BANK,
        counterAccount: AR,
      }),
    ).toThrow(RangeError);
  });
});

const positiveØre = (): fc.Arbitrary<Øre> =>
  fc.integer({ min: 1, max: 1_000_000_000 }).map((n) => øre(n));

describe('deriveSettlement — properties', () => {
  it('always balances and moves exactly the amount, both directions', () => {
    fc.assert(
      fc.property(
        positiveØre(),
        fc.constantFrom('incoming' as const, 'outgoing' as const),
        (amount, direction) => {
          const v = deriveSettlement({ amount, direction, bankAccount: BANK, counterAccount: AR });
          return (
            v.type === 'bank' &&
            isBalanced(v) &&
            totalDebit(v) === amount &&
            totalCredit(v) === amount &&
            v.lines.length === 2
          );
        },
      ),
    );
  });
});
