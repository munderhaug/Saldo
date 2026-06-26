/**
 * Hovedbok / kontospesifikasjon — the per-account drill-down (feat-reporting, build-spec §8.9). This is
 * the explicit **depth-on-demand** exception (experience-principles §4.2): the everyday surface never
 * shows konto/debit/credit, but the accountant/auditor view here does. PURE: the query returns one
 * account's posted entries (and its incoming balance from prior periods); this folds them into a
 * running balance.
 *
 * The running balance is debit-normal (`debit − credit`): for a balance-sheet account it is the
 * account's standing balance; for a result account it is the accumulated movement. Closing balance =
 * opening + Σ(debit − credit), so it ties out to the same account's figure in balanse/resultat.
 */
import { type Øre, addØre, subØre, sumØre } from '../money/ore.js';

/** One posted entry on the account, as the query layer reads it (no running balance yet). */
export interface HovedbokEntry {
  readonly voucherId: string;
  readonly voucherType: string;
  /** Posting date (the voucher's `posted_at` day, ISO `YYYY-MM-DD`), or null if absent. */
  readonly date: string | null;
  readonly debitØre: Øre;
  readonly creditØre: Øre;
}

/** An entry with the running balance after it is applied. */
export interface HovedbokRow extends HovedbokEntry {
  readonly balanceØre: Øre;
}

export interface HovedbokReport {
  /** Incoming balance from prior periods (debit − credit), the running balance's starting point. */
  readonly openingØre: Øre;
  readonly rows: readonly HovedbokRow[];
  readonly debitTotalØre: Øre;
  readonly creditTotalØre: Øre;
  /** Opening + Σ(debit − credit). */
  readonly closingØre: Øre;
}

/** Fold one account's entries into a running balance. `entries` are pre-ordered by the query. Pure. */
export function buildHovedbok(openingØre: Øre, entries: readonly HovedbokEntry[]): HovedbokReport {
  let balance = openingØre;
  const rows: HovedbokRow[] = entries.map((e) => {
    balance = addØre(balance, subØre(e.debitØre, e.creditØre));
    return { ...e, balanceØre: balance };
  });
  return {
    openingØre,
    rows,
    debitTotalØre: sumØre(entries.map((e) => e.debitØre)),
    creditTotalØre: sumØre(entries.map((e) => e.creditØre)),
    closingØre: balance,
  };
}
