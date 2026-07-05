import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { sumØre, øre, ZERO, type Øre } from '../money/ore.js';
import { isBalanced, totalCredit, totalDebit } from './balance.js';
import type { AccountNo } from './types.js';
import { deriveOpeningBalance, type OpeningEntry } from './opening.js';

const acc = (s: string): AccountNo => s as AccountNo;
const EQUITY = acc('2050');
const BANK = acc('1920');
const RECEIVABLE = acc('1500');
const PAYABLE = acc('2400');

const own = (account: AccountNo, amount: number): OpeningEntry => ({
  account,
  side: 'own',
  amount: øre(amount),
});
const owe = (account: AccountNo, amount: number): OpeningEntry => ({
  account,
  side: 'owe',
  amount: øre(amount),
});

describe('deriveOpeningBalance — inngående balanse as one balanced voucher', () => {
  it('owns > owes: equity is credited the difference (the owner’s stake)', () => {
    const r = deriveOpeningBalance([own(BANK, 100_000), owe(PAYABLE, 30_000)], EQUITY);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(isBalanced(r.voucher)).toBe(true);
    const equityLeg = r.voucher.lines.find((l) => l.account === EQUITY);
    expect(equityLeg?.credit).toBe(70_000);
    expect(equityLeg?.debit).toBe(ZERO);
  });

  it('owes > owns: equity is debited (negative equity is stated honestly, not blocked)', () => {
    const r = deriveOpeningBalance([own(BANK, 10_000), owe(PAYABLE, 45_000)], EQUITY);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(isBalanced(r.voucher)).toBe(true);
    const equityLeg = r.voucher.lines.find((l) => l.account === EQUITY);
    expect(equityLeg?.debit).toBe(35_000);
  });

  it('exactly balancing entries need no equity leg', () => {
    const r = deriveOpeningBalance([own(BANK, 25_000), owe(PAYABLE, 25_000)], EQUITY);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(isBalanced(r.voucher)).toBe(true);
    expect(r.voucher.lines).toHaveLength(2);
    expect(r.voucher.lines.some((l) => l.account === EQUITY)).toBe(false);
  });

  it('zero entries are skipped; all-zero (or no) entries are `empty`, not a hollow voucher', () => {
    const r = deriveOpeningBalance([own(BANK, 50_000), own(RECEIVABLE, 0)], EQUITY);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.voucher.lines.some((l) => l.account === RECEIVABLE)).toBe(false);

    expect(deriveOpeningBalance([], EQUITY)).toEqual({ ok: false, reason: 'empty' });
    expect(deriveOpeningBalance([own(BANK, 0)], EQUITY)).toEqual({ ok: false, reason: 'empty' });
  });

  it('a negative amount is refused as invalid, never derived', () => {
    const r = deriveOpeningBalance([{ account: BANK, side: 'own', amount: -1 as Øre }], EQUITY);
    expect(r).toEqual({ ok: false, reason: 'invalid-amount' });
  });

  it('no line ever carries a VAT code — positions, not transactions', () => {
    const r = deriveOpeningBalance(
      [own(BANK, 12_345), own(RECEIVABLE, 99), owe(PAYABLE, 1)],
      EQUITY,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.voucher.lines.every((l) => l.vatCode === undefined)).toBe(true);
  });

  it('property: any mix of stated balances derives a balanced voucher with ≥2 lines (posted-completeness), every non-zero entry present on its natural side', () => {
    const entryArb = fc.record({
      account: fc.constantFrom(BANK, RECEIVABLE, PAYABLE),
      side: fc.constantFrom<'own' | 'owe'>('own', 'owe'),
      amount: fc.integer({ min: 0, max: 5_000_000_00 }).map((n) => øre(n)),
    });
    fc.assert(
      fc.property(fc.array(entryArb, { minLength: 1, maxLength: 12 }), (entries) => {
        const r = deriveOpeningBalance(entries, EQUITY);
        const anyNonZero = entries.some((e) => e.amount > 0);
        expect(r.ok).toBe(anyNonZero);
        if (!r.ok) return;
        expect(isBalanced(r.voucher)).toBe(true);
        expect(r.voucher.lines.length).toBeGreaterThanOrEqual(2);
        // The stated totals survive: Σ debit of non-equity lines = Σ stated 'own' amounts, etc.
        const statedOwn = sumØre(entries.filter((e) => e.side === 'own').map((e) => e.amount));
        const statedOwe = sumØre(entries.filter((e) => e.side === 'owe').map((e) => e.amount));
        const nonEquity = {
          ...r.voucher,
          lines: r.voucher.lines.filter((l) => l.account !== EQUITY),
        };
        expect(totalDebit(nonEquity)).toBe(statedOwn);
        expect(totalCredit(nonEquity)).toBe(statedOwe);
      }),
    );
  });
});
