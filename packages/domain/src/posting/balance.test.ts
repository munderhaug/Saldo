import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { øre } from '../money/ore.js';
import type { AccountNo, PostingLine, Voucher } from './types.js';
import { isBalanced } from './balance.js';

const acc = (s: string) => s as AccountNo;

function line(debit: number, credit: number, account = '3000'): PostingLine {
  return { account: acc(account), debit: øre(debit), credit: øre(credit) };
}

describe('voucher balance invariant', () => {
  it('a simple balanced sales voucher balances', () => {
    const v: Voucher = {
      type: 'sales',
      lines: [line(12500, 0, '1500'), line(0, 10000, '3000'), line(0, 2500, '2700')],
    };
    expect(isBalanced(v)).toBe(true);
  });

  it('an unbalanced voucher does not balance', () => {
    const v: Voucher = { type: 'manual', lines: [line(100, 0), line(0, 99)] };
    expect(isBalanced(v)).toBe(false);
  });

  it('property: mirrored debit/credit pairs always balance', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 1_000_000 }), { minLength: 1, maxLength: 20 }),
        (amounts) => {
          const lines: PostingLine[] = amounts.flatMap((a) => [line(a, 0), line(0, a)]);
          expect(isBalanced({ type: 'manual', lines })).toBe(true);
        },
      ),
    );
  });
});
