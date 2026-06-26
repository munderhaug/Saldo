/**
 * Shared input + classification for the financial reports (feat-reporting, build-spec §8.9). Every
 * report is a PURE read over the posted ledger: the query layer sums one period's activity PER ACCOUNT
 * into gross debit/credit totals (exactly as `aggregateLedger` sums the honest-number scalars), and the
 * domain composes those into resultat / balanse / hovedbok / reskontro / likviditet. No I/O, no clock.
 *
 * The economic role of an account is its Norwegian *kontoklasse* — the leading digit of the account
 * number, which the committed SAF-T standard accounts ARE (1 eiendeler · 2 egenkapital og gjeld ·
 * 3 driftsinntekt · 4 varekostnad · 5 lønn · 6–7 annen driftskostnad · 8 finans/skatt/resultat). It is
 * source-grounded in the kontoplan, never memorised per account.
 */
import { type Øre, subØre } from '../money/ore.js';
import type { AccountNo } from '../posting/types.js';

/**
 * One account's posted activity for a period: the gross debit and credit sums, integer øre. The query
 * layer produces these (Σ per account over POSTED vouchers, RLS-scoped); the domain only reads them.
 */
export interface LedgerAccountBalance {
  readonly number: AccountNo;
  readonly name: string;
  readonly debitØre: Øre;
  readonly creditØre: Øre;
}

/** The kontoklasse — the leading digit (1–8). `null` for an unexpected account number. */
export type Kontoklasse = '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8';

const KONTOKLASSER: ReadonlySet<string> = new Set(['1', '2', '3', '4', '5', '6', '7', '8']);

/** The kontoklasse of an account number, or `null` if the leading digit isn't 1–8. Pure. */
export function kontoklasse(number: AccountNo): Kontoklasse | null {
  const first = number.charAt(0);
  return KONTOKLASSER.has(first) ? (first as Kontoklasse) : null;
}

/**
 * Klasse-8 accounts from 8800 up are result-disposition / equity movements (8800 årsresultat, 89xx
 * overføringer, 8980 privatuttak, 8990 udekket tap) — they belong on the balanse EQUITY side, not the
 * resultat. Below 8800 are finansposter (finansinntekt/-kostnad, skattekostnad) that ARE part of the
 * year's result. Source-grounded in the committed SAF-T kontoplan (kontoklasse 8 layout). Numeric
 * compare (not lexicographic) so a non-4-char number can't slip through.
 */
export function isEquityDisposition(number: AccountNo): boolean {
  return kontoklasse(number) === '8' && Number(number) >= 8800;
}

/** Debit-normal balance (assets, costs): `debit − credit`. */
export function debitBalance(b: LedgerAccountBalance): Øre {
  return subØre(b.debitØre, b.creditØre);
}

/** Credit-normal balance (equity/liabilities, revenue): `credit − debit`. */
export function creditBalance(b: LedgerAccountBalance): Øre {
  return subØre(b.creditØre, b.debitØre);
}
