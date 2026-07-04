/**
 * Likviditet — a simple cash-position view (feat-reporting, build-spec §8.9; NOT budgeting/forecasting,
 * which §3 holds out of scope). PURE: the cash on hand is the balance of the liquid accounts
 * (kontoklasse 19 — bankinnskudd, kontanter og lignende, source-grounded in the kontoplan); the
 * forward view adds open receivables and subtracts open payables (both from the reskontro totals).
 */
import { type Øre, addØre, subØre, sumØre } from '../money/ore.js';
import { type LedgerAccountBalance, debitBalance } from './account-balance.js';

/** Kontoklasse 19 — bankinnskudd, kontanter og lignende (the liquid asset group). */
const LIQUID_ACCOUNT_PREFIX = '19';

/**
 * Konto 1950 — Bankinnskudd for skattetrekk — is withheld-tax money the business holds in trust and may
 * NOT freely dispose of (skattebetalingsloven § 5-12), so it is excluded from available cash. Source-
 * grounded in the SAF-T kontoplan.
 */
const RESTRICTED_LIQUID_ACCOUNT = '1950';

/** One liquid account's contribution to the cash position. */
export interface LiquidLine {
  readonly number: string;
  readonly name: string;
  readonly amountØre: Øre;
}

export interface LiquidityReport {
  /** The liquid (konto 19xx) accounts and their balances. */
  readonly cashAccounts: readonly LiquidLine[];
  /** Cash on hand — Σ liquid account balances (debit − credit). */
  readonly cashØre: Øre;
  /** Open AR coming in (from the reskontro total). */
  readonly outstandingReceivablesØre: Øre;
  /** Open AP going out. */
  readonly outstandingPayablesØre: Øre;
  /** Projected position — cash + receivables − payables. */
  readonly projectedØre: Øre;
}

/** Whether an account number is a freely-disposable liquid (konto 19xx, excluding 1950) account. */
export function isLiquidAccount(number: string): boolean {
  return number.startsWith(LIQUID_ACCOUNT_PREFIX) && number !== RESTRICTED_LIQUID_ACCOUNT;
}

/** Build the liquidity view from per-account balances and the open AR/AP totals. Pure. */
export function buildLiquidity(input: {
  readonly balances: readonly LedgerAccountBalance[];
  readonly outstandingReceivablesØre: Øre;
  readonly outstandingPayablesØre: Øre;
}): LiquidityReport {
  const cashAccounts = input.balances
    .filter((b) => isLiquidAccount(b.number))
    .map((b) => ({ number: b.number, name: b.name, amountØre: debitBalance(b) }));
  const cashØre = sumØre(cashAccounts.map((l) => l.amountØre));
  const projectedØre = subØre(
    addØre(cashØre, input.outstandingReceivablesØre),
    input.outstandingPayablesØre,
  );
  return {
    cashAccounts,
    cashØre,
    outstandingReceivablesØre: input.outstandingReceivablesØre,
    outstandingPayablesØre: input.outstandingPayablesØre,
    projectedØre,
  };
}
