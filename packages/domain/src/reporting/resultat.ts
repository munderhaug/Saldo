/**
 * Resultatregnskap (profit & loss) — derived PURELY from the posted ledger (feat-reporting, build-spec
 * §8.9). Revenue (kontoklasse 3) − costs (4–7) − net finans (8) over the period, grouped by kontoklasse
 * so the everyday "what did the business earn" question is answered without the ledger's debit/credit
 * grammar leaking out.
 *
 * Sign convention, source-grounded in double-entry: a klasse-3/8 account is credit-normal (income is
 * `credit − debit`); a klasse-4..7 cost account is debit-normal (cost is `debit − credit`). The
 * `aarsresultat` (årsresultat) is therefore Σ over every result account of `credit − debit` — exactly
 * the quantity the balanse closes into equity, which is what makes the two reports tie out (proven by
 * the integration test).
 */
import { type Øre, ZERO, addØre, subØre, sumØre } from '../money/ore.js';
import {
  type Kontoklasse,
  type LedgerAccountBalance,
  creditBalance,
  debitBalance,
  isEquityDisposition,
  kontoklasse,
} from './account-balance.js';

/** One account's line in the resultat, at its kontoklasse's natural-positive orientation. */
export interface ResultatLine {
  readonly number: string;
  readonly name: string;
  /** Income lines (klasse 3/8): `credit − debit`. Cost lines (klasse 4–7): `debit − credit`. */
  readonly amountØre: Øre;
}

/** The accounts of one kontoklasse with their subtotal. */
export interface ResultatGroup {
  readonly klasse: Kontoklasse;
  readonly lines: readonly ResultatLine[];
  readonly subtotalØre: Øre;
}

export interface ResultatReport {
  /** Groups for kontoklasse 3–8 that carried activity, in ascending klasse order. */
  readonly groups: readonly ResultatGroup[];
  /** Driftsinntekter — Σ kontoklasse 3 (credit − debit). */
  readonly driftsinntekterØre: Øre;
  /** Driftskostnader — Σ kontoklasse 4–7 (debit − credit). */
  readonly driftskostnaderØre: Øre;
  /** Driftsresultat — driftsinntekter − driftskostnader. */
  readonly driftsresultatØre: Øre;
  /** Finansposter — Σ kontoklasse 8 (credit − debit); negative when finanskostnad dominates. */
  readonly finansposterØre: Øre;
  /** Årsresultat — driftsresultat + finansposter (a loss is negative). */
  readonly aarsresultatØre: Øre;
}

/** Result kontoklasser, with whether the class is credit-normal (income) or debit-normal (cost). */
const RESULT_KLASSER: ReadonlyArray<{ klasse: Kontoklasse; income: boolean }> = [
  { klasse: '3', income: true },
  { klasse: '4', income: false },
  { klasse: '5', income: false },
  { klasse: '6', income: false },
  { klasse: '7', income: false },
  { klasse: '8', income: true },
];

/** Build the resultatregnskap from per-account ledger balances. Pure; accounts outside klasse 3–8 are ignored. */
export function buildResultat(balances: readonly LedgerAccountBalance[]): ResultatReport {
  const groups: ResultatGroup[] = [];
  for (const { klasse, income } of RESULT_KLASSER) {
    // Klasse 8 in the resultat is the finans/skatt band only (< 8800); the disposition/equity accounts
    // (88xx–89xx) are årsresultat/privatuttak and belong on the balanse, so they're excluded here.
    const members = balances.filter(
      (b) => kontoklasse(b.number) === klasse && !isEquityDisposition(b.number),
    );
    if (members.length === 0) continue;
    const lines = members.map((b) => ({
      number: b.number,
      name: b.name,
      amountØre: income ? creditBalance(b) : debitBalance(b),
    }));
    groups.push({ klasse, lines, subtotalØre: sumØre(lines.map((l) => l.amountØre)) });
  }

  const subtotal = (klasse: Kontoklasse): Øre =>
    groups.find((g) => g.klasse === klasse)?.subtotalØre ?? ZERO;

  const driftsinntekterØre = subtotal('3');
  const driftskostnaderØre = sumØre([subtotal('4'), subtotal('5'), subtotal('6'), subtotal('7')]);
  const driftsresultatØre = subØre(driftsinntekterØre, driftskostnaderØre);
  const finansposterØre = subtotal('8');
  const aarsresultatØre = addØre(driftsresultatØre, finansposterØre);

  return {
    groups,
    driftsinntekterØre,
    driftskostnaderØre,
    driftsresultatØre,
    finansposterØre,
    aarsresultatØre,
  };
}
