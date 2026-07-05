/**
 * Opening balances (inngående balanse, feat-opening-balances / build-spec §8.1) — the migration
 * entry for a business that already has books elsewhere. The user states what the business OWNS and
 * OWES at the switch date; this pure function turns those statements into one balanced voucher, with
 * the difference plugged to the owner's equity account (what's left after debts IS the owner's stake
 * — the plug is not a trick, it is the definition of equity for an ENK).
 *
 * An opening balance is still an append-only voucher through the ordinary posting path — never a
 * ledger bypass (ledger-integrity rule). No line carries a VAT code: opening balances state
 * POSITIONS (including any VAT settlement owed as a liability), not new taxable transactions, so
 * nothing here may land on an MVA-melding. Corrections afterwards are motbilag, like any voucher.
 */
import { addØre, isZeroØre, negØre, subØre, ZERO, type Øre } from '../money/ore.js';
import type { AccountNo, PostingLine, Voucher } from './types.js';

/** Which side a stated positive balance naturally sits on: what you OWN debits, what you OWE credits. */
export type OpeningSide = 'own' | 'owe';

export interface OpeningEntry {
  readonly account: AccountNo;
  readonly side: OpeningSide;
  /** The stated positive balance in øre. Zero entries are simply skipped. */
  readonly amount: Øre;
}

export type OpeningResult =
  | { readonly ok: true; readonly voucher: Voucher }
  | { readonly ok: false; readonly reason: 'empty' | 'invalid-amount' };

/**
 * Derive the balanced opening voucher. Every non-zero entry becomes one line on its natural side;
 * the debit−credit difference is plugged to `equityAccount` (credit when the business owns more than
 * it owes, debit when the other way; omitted when the entries balance exactly). `empty` when nothing
 * non-zero was stated; `invalid-amount` on any negative amount (the boundary should prevent it —
 * refusing here keeps the derivation total instead of emitting an unbalanced or nonsense voucher).
 */
export function deriveOpeningBalance(
  entries: readonly OpeningEntry[],
  equityAccount: AccountNo,
): OpeningResult {
  if (entries.some((entry) => entry.amount < ZERO)) return { ok: false, reason: 'invalid-amount' };

  const stated = entries.filter((entry) => !isZeroØre(entry.amount));
  if (stated.length === 0) return { ok: false, reason: 'empty' };

  const lines: PostingLine[] = stated.map((entry) =>
    entry.side === 'own'
      ? { account: entry.account, debit: entry.amount, credit: ZERO }
      : { account: entry.account, debit: ZERO, credit: entry.amount },
  );

  let diff: Øre = ZERO; // Σ debit − Σ credit over the stated lines
  for (const line of lines) diff = addØre(diff, subØre(line.debit, line.credit));

  if (!isZeroØre(diff)) {
    lines.push(
      diff > ZERO
        ? { account: equityAccount, debit: ZERO, credit: diff }
        : { account: equityAccount, debit: negØre(diff), credit: ZERO },
    );
  }

  return { ok: true, voucher: { type: 'manual', lines } };
}
