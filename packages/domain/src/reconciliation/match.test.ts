import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { øre, type Øre } from '../money/ore.js';
import { isValidKidMod10, isValidKidMod11, withMod10ControlDigit } from '../ids/kid.js';
import {
  DEFAULT_MATCH_CONFIG,
  digitRuns,
  matchBankLine,
  type BankLine,
  type OpenInvoice,
} from './match.js';

// Two distinct, genuinely valid (mod-10) KIDs to anchor the exhaustive cases.
const KID_A = withMod10ControlDigit('100100') as string;
const KID_B = withMod10ControlDigit('200200') as string;

const inv = (over: Partial<OpenInvoice> & Pick<OpenInvoice, 'invoiceId'>): OpenInvoice => ({
  kid: null,
  outstanding: øre(125_00),
  issueDate: '2026-06-01',
  dueDate: '2026-06-15',
  ...over,
});

const line = (over: Partial<BankLine> = {}): BankLine => ({
  amount: øre(125_00),
  bookingDate: '2026-06-16',
  remittanceInfo: null,
  ...over,
});

describe('digitRuns', () => {
  it('returns [] for null', () => {
    expect(digitRuns(null)).toEqual([]);
  });
  it('extracts maximal digit runs from free text', () => {
    expect(digitRuns('Faktura 1001, KID 100100 4')).toEqual(['1001', '100100', '4']);
  });
  it('returns the whole string when it is all digits', () => {
    expect(digitRuns('1001004')).toEqual(['1001004']);
  });
});

describe('matchBankLine — tiers', () => {
  it('kid-exact: KID in message + equal amount → unique auto-match', () => {
    const result = matchBankLine(line({ remittanceInfo: `Betaling ${KID_A}` }), [
      inv({ invoiceId: 'a', kid: KID_A }),
    ]);
    expect(result.candidates).toEqual([{ invoiceId: 'a', tier: 'kid-exact', score: 100 }]);
    expect(result.auto).toEqual({ invoiceId: 'a', tier: 'kid-exact', score: 100 });
  });

  it('kid-exact: a mod-11 KID also auto-matches (issuer-configured scheme; review H4)', () => {
    // '1001000' is a valid mod-11 KID but NOT valid mod-10 — so a mod-10-only check (the old code)
    // would miss it. The matcher must accept either scheme.
    const KID_M11 = '1001000';
    expect(isValidKidMod11(KID_M11)).toBe(true);
    expect(isValidKidMod10(KID_M11)).toBe(false);
    const result = matchBankLine(line({ remittanceInfo: `Betaling ${KID_M11}` }), [
      inv({ invoiceId: 'a', kid: KID_M11 }),
    ]);
    expect(result.auto).toEqual({ invoiceId: 'a', tier: 'kid-exact', score: 100 });
  });

  it('amount-date: equal amount + booking within the window, no KID', () => {
    const result = matchBankLine(line(), [inv({ invoiceId: 'a' })]);
    expect(result.candidates).toEqual([{ invoiceId: 'a', tier: 'amount-date', score: 60 }]);
    expect(result.auto).toBeNull();
  });

  it('amount: equal amount but booking outside the window and no KID', () => {
    const result = matchBankLine(line({ bookingDate: '2026-12-31' }), [inv({ invoiceId: 'a' })]);
    expect(result.candidates).toEqual([{ invoiceId: 'a', tier: 'amount', score: 30 }]);
    expect(result.auto).toBeNull();
  });

  it('no candidate when the amount differs', () => {
    const result = matchBankLine(line({ amount: øre(999_00) }), [inv({ invoiceId: 'a' })]);
    expect(result.candidates).toEqual([]);
    expect(result.auto).toBeNull();
  });

  it('a KID hit with a non-equal amount is NOT proposed (no partial-payment posting)', () => {
    const result = matchBankLine(
      line({ amount: øre(50_00), remittanceInfo: `Delbetaling ${KID_A}` }),
      [inv({ invoiceId: 'a', kid: KID_A, outstanding: øre(125_00) })],
    );
    expect(result.candidates).toEqual([]);
  });
});

describe('matchBankLine — direction & ambiguity', () => {
  it('outgoing (negative) lines never match a receivable', () => {
    expect(matchBankLine(line({ amount: øre(-125_00) }), [inv({ invoiceId: 'a' })])).toEqual({
      auto: null,
      candidates: [],
    });
  });

  it('zero-amount lines never match', () => {
    expect(matchBankLine(line({ amount: øre(0) }), [inv({ invoiceId: 'a' })])).toEqual({
      auto: null,
      candidates: [],
    });
  });

  it('two equal-amount KID-exact hits → ambiguous, no auto, both surfaced', () => {
    const result = matchBankLine(line({ remittanceInfo: `${KID_A} ${KID_B}` }), [
      inv({ invoiceId: 'a', kid: KID_A }),
      inv({ invoiceId: 'b', kid: KID_B }),
    ]);
    expect(result.auto).toBeNull();
    expect(result.candidates.map((c) => c.invoiceId)).toEqual(['a', 'b']);
    expect(result.candidates.every((c) => c.tier === 'kid-exact')).toBe(true);
  });

  it('orders kid-exact ahead of amount-date ahead of amount', () => {
    const result = matchBankLine(line({ remittanceInfo: `${KID_B}`, bookingDate: '2026-06-16' }), [
      inv({ invoiceId: 'amt', dueDate: '2025-01-01', issueDate: '2025-01-01' }),
      inv({ invoiceId: 'date' }),
      inv({ invoiceId: 'kid', kid: KID_B }),
    ]);
    expect(result.candidates.map((c) => c.tier)).toEqual(['kid-exact', 'amount-date', 'amount']);
  });

  it('an invalid-control-digit KID in the message is not treated as a KID hit', () => {
    // KID_A with its last digit corrupted → must fail BOTH schemes (now that either is accepted) →
    // falls back to a date/amount tier.
    const broken = KID_A.slice(0, -1) + ((Number(KID_A.slice(-1)) + 1) % 10);
    expect(isValidKidMod10(broken)).toBe(false);
    expect(isValidKidMod11(broken)).toBe(false);
    const result = matchBankLine(line({ remittanceInfo: broken }), [
      inv({ invoiceId: 'a', kid: broken }),
    ]);
    expect(result.candidates[0]?.tier).not.toBe('kid-exact');
  });
});

const safePositiveØre = (): fc.Arbitrary<Øre> =>
  fc.integer({ min: 1, max: 1_000_000_00 }).map((n) => øre(n));

describe('matchBankLine — properties', () => {
  it('every candidate has outstanding equal to the line amount', () => {
    fc.assert(
      fc.property(
        safePositiveØre(),
        fc.array(fc.tuple(fc.string(), fc.integer({ min: 1, max: 1_000_000_00 })), {
          maxLength: 8,
        }),
        (amount, raw) => {
          const invoices = raw.map(([id, out], i): OpenInvoice => ({
            invoiceId: `${id}-${i}`,
            kid: null,
            outstanding: øre(out),
            issueDate: '2026-06-01',
            dueDate: '2026-06-15',
          }));
          const result = matchBankLine(line({ amount }), invoices);
          return result.candidates.every((c) => {
            const matched = invoices.find((v) => v.invoiceId === c.invoiceId)!;
            return matched.outstanding === amount;
          });
        },
      ),
    );
  });

  it('auto is non-null ⇒ it is a unique kid-exact candidate', () => {
    fc.assert(
      fc.property(safePositiveØre(), fc.array(fc.string(), { maxLength: 6 }), (amount, ids) => {
        const kid = withMod10ControlDigit('5005') as string;
        const invoices = ids.map((id, i): OpenInvoice => ({
          invoiceId: `${id}-${i}`,
          kid,
          outstanding: amount,
          issueDate: null,
          dueDate: null,
        }));
        const result = matchBankLine(line({ amount, remittanceInfo: kid }), invoices);
        if (result.auto === null) return true;
        const kidExact = result.candidates.filter((c) => c.tier === 'kid-exact');
        return (
          result.auto.tier === 'kid-exact' &&
          kidExact.length === 1 &&
          result.auto.invoiceId === kidExact[0]!.invoiceId
        );
      }),
    );
  });

  it('candidates are sorted by descending score', () => {
    fc.assert(
      fc.property(safePositiveØre(), (amount) => {
        const result = matchBankLine(
          line({ amount, remittanceInfo: KID_A, bookingDate: '2026-06-16' }),
          [
            inv({ invoiceId: 'k', kid: KID_A, outstanding: amount }),
            inv({ invoiceId: 'd', outstanding: amount }),
            inv({ invoiceId: 'a', outstanding: amount, dueDate: '2020-01-01', issueDate: null }),
          ],
        );
        const scores = result.candidates.map((c) => c.score);
        return scores.every((s, i) => i === 0 || scores[i - 1]! >= s);
      }),
    );
  });

  it('is deterministic — same inputs, same output', () => {
    fc.assert(
      fc.property(safePositiveØre(), (amount) => {
        const invoices = [inv({ invoiceId: 'a', kid: KID_A, outstanding: amount })];
        const l = line({ amount, remittanceInfo: KID_A });
        return (
          JSON.stringify(matchBankLine(l, invoices)) === JSON.stringify(matchBankLine(l, invoices))
        );
      }),
    );
  });

  it('non-positive amounts always yield an empty result', () => {
    fc.assert(
      fc.property(fc.integer({ min: -1_000_000_00, max: 0 }), (n) => {
        const result = matchBankLine(line({ amount: øre(n) }), [inv({ invoiceId: 'a' })]);
        return result.auto === null && result.candidates.length === 0;
      }),
    );
  });

  it('respects the configurable date window', () => {
    const result = matchBankLine(
      line({ bookingDate: '2026-07-15' }),
      [inv({ invoiceId: 'a', dueDate: '2026-06-15' })],
      { ...DEFAULT_MATCH_CONFIG, dateWindowDays: 90 },
    );
    expect(result.candidates[0]?.tier).toBe('amount-date');
  });
});
