/**
 * Year-end close (årsavslutning, feat-year-end-close / build-spec §8.6 + §8.10) — the carry-forward
 * voucher. At year end every result-side account (kontoklasse 3–8, including the ≥8800 equity
 * dispositions like privatuttak that accumulated during the year) is emptied, and the net lands on
 * the owner's equity account: the year's result and drawings become opening equity for the next
 * year. In a continuous ledger this closing voucher IS the carry-forward — balance-sheet accounts
 * (klasse 1–2) carry across years by cumulative sum, so no separate opening voucher exists (posting
 * one would double-count them; ADR 0061's opening voucher is for MIGRATION, not year rollover).
 *
 * Same shape and discipline as {@link deriveOpeningBalance}: pure derivation → the ordinary rules
 * gate → one balanced, append-only voucher (type `year_end`); the equity plug is the definition of
 * an ENK owner's stake. No line carries a VAT code — the close moves POSITIONS, not new taxable
 * activity, so nothing here may land on an MVA-melding. The `year_end` type is load-bearing for the
 * reports: the closed year's resultat EXCLUDES it (the P&L stays readable), and the balanse stops
 * injecting a derived årsresultat once it is posted.
 */
import { addØre, isZeroØre, negØre, subØre, ZERO, type Øre } from '../money/ore.js';
import { kontoklasse, type LedgerAccountBalance } from '../reporting/account-balance.js';
import type { AccountNo, PostingLine, Voucher } from './types.js';

/** A result-side account the close empties: kontoklasse 3–8 (finans AND ≥8800 dispositions). */
export function isClosedByYearEnd(number: AccountNo): boolean {
  const klasse = kontoklasse(number);
  return klasse !== null && klasse >= '3';
}

export type YearEndResult =
  | { readonly ok: true; readonly voucher: Voucher }
  | { readonly ok: false; readonly reason: 'nothing-to-close' };

/**
 * Derive the closing voucher from the year's per-account activity (the same shape the reports read).
 * Every result-side account with a non-zero net gets one line REVERSING that net; the debit−credit
 * difference of those reversals is plugged to `equityAccount`. `nothing-to-close` when every
 * result-side account already nets zero (an empty year, or a year closed already — the caller
 * guards re-closing separately with the period lock).
 */
export function deriveYearEndClose(
  balances: readonly LedgerAccountBalance[],
  equityAccount: AccountNo,
): YearEndResult {
  const lines: PostingLine[] = [];
  for (const balance of balances) {
    if (!isClosedByYearEnd(balance.number)) continue;
    const net = subØre(balance.debitØre, balance.creditØre); // debit-normal net for the year
    if (isZeroØre(net)) continue;
    lines.push(
      net > ZERO
        ? { account: balance.number, debit: ZERO, credit: net }
        : { account: balance.number, debit: negØre(net), credit: ZERO },
    );
  }
  if (lines.length === 0) return { ok: false, reason: 'nothing-to-close' };

  let diff: Øre = ZERO; // Σ debit − Σ credit over the reversal lines
  for (const line of lines) diff = addØre(diff, subØre(line.debit, line.credit));
  if (!isZeroØre(diff)) {
    lines.push(
      diff > ZERO
        ? { account: equityAccount, debit: ZERO, credit: diff }
        : { account: equityAccount, debit: negØre(diff), credit: ZERO },
    );
  }

  return { ok: true, voucher: { type: 'year_end', lines } };
}
