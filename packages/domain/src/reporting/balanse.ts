/**
 * Balanse (balance sheet) — derived PURELY from the posted ledger (feat-reporting, build-spec §8.9).
 * Eiendeler (kontoklasse 1) on one side; egenkapital og gjeld (kontoklasse 2) plus the period's
 * årsresultat on the other.
 *
 * Why it balances: every posted voucher has Σdebit = Σcredit (the SQL balance trigger), so across the
 * whole ledger Σ(debit − credit) = 0. Splitting that by kontoklasse gives
 *   eiendeler(1) − egenkapitalGjeld(2) − (resultatklasser 3–8, credit − debit) = 0,
 * i.e. **eiendeler = egenkapital og gjeld + årsresultat**. The årsresultat is supplied by
 * {@link buildResultat} (the unclosed year's result, which year-end close will post into equity). The
 * tie-out is asserted by the integration test, not assumed.
 */
import { type Øre, ZERO, addØre, subØre, sumØre, eqØre } from '../money/ore.js';
import {
  type LedgerAccountBalance,
  creditBalance,
  debitBalance,
  isEquityDisposition,
  kontoklasse,
} from './account-balance.js';

/** One account's line in the balanse, at its kontoklasse's natural-positive orientation. */
export interface BalanseLine {
  readonly number: string;
  readonly name: string;
  /** Eiendeler (klasse 1): `debit − credit`. Egenkapital og gjeld (klasse 2): `credit − debit`. */
  readonly amountØre: Øre;
}

export interface BalanseReport {
  /** Eiendeler (kontoklasse 1), debit-normal. */
  readonly eiendeler: readonly BalanseLine[];
  readonly eiendelerØre: Øre;
  /** Egenkapital og gjeld (kontoklasse 2), credit-normal — EXCLUDING the årsresultat line. */
  readonly egenkapitalGjeld: readonly BalanseLine[];
  readonly egenkapitalGjeldØre: Øre;
  /** The period's result, closed into equity for the balance to hold (from the resultat). */
  readonly aarsresultatØre: Øre;
  /** Egenkapital og gjeld including the årsresultat — the figure that must equal eiendeler. */
  readonly sumEgenkapitalGjeldØre: Øre;
  /** `eiendeler − sumEgenkapitalGjeld` — ZERO on a healthy ledger. */
  readonly differanseØre: Øre;
  /** Whether the balanse balances (differanse is zero). */
  readonly balanserer: boolean;
}

/** Build the balanse from per-account ledger balances and the period's årsresultat. Pure. */
export function buildBalanse(
  balances: readonly LedgerAccountBalance[],
  aarsresultatØre: Øre,
): BalanseReport {
  const eiendeler = balances
    .filter((b) => kontoklasse(b.number) === '1')
    .map((b) => ({ number: b.number, name: b.name, amountØre: debitBalance(b) }));
  // Egenkapital og gjeld = kontoklasse 2 PLUS the klasse-8 disposition/equity accounts (8800 årsresultat,
  // 89xx overføringer/privatuttak), which are equity movements, not result — so the årsresultat figure
  // stays clean and the two sides still tie out (both partitions cover kontoklasse 3–8 exactly once).
  const egenkapitalGjeld = balances
    .filter((b) => kontoklasse(b.number) === '2' || isEquityDisposition(b.number))
    .map((b) => ({ number: b.number, name: b.name, amountØre: creditBalance(b) }));

  const eiendelerØre = sumØre(eiendeler.map((l) => l.amountØre));
  const egenkapitalGjeldØre = sumØre(egenkapitalGjeld.map((l) => l.amountØre));
  const sumEgenkapitalGjeldØre = addØre(egenkapitalGjeldØre, aarsresultatØre);
  const differanseØre = subØre(eiendelerØre, sumEgenkapitalGjeldØre);

  return {
    eiendeler,
    eiendelerØre,
    egenkapitalGjeld,
    egenkapitalGjeldØre,
    aarsresultatØre,
    sumEgenkapitalGjeldØre,
    differanseØre,
    balanserer: eqØre(differanseØre, ZERO),
  };
}
