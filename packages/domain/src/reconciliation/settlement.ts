/**
 * Bank reconciliation — the pure settlement-voucher derivation (build-spec §8.7).
 *
 * When a bank payment is matched to an invoice, posting the SETTLEMENT happens HERE (at reconciliation),
 * not at import. An incoming customer payment debits the bank (asset up) and credits the receivable
 * (the AR raised when the invoice was issued is cleared); an outgoing supplier payment is the exact
 * inverse. Two legs, no VAT — the VAT was settled on the invoice's AR voucher (ADR 0043); a payment is
 * a pure balance-sheet movement.
 *
 * Append-only: this derives a NEW balanced voucher to POST; corrections are motbilag, never an UPDATE
 * of a posted row. Money is integer `Øre`. The leg layout is assembled only here (pure), then the DB
 * layer resolves the account numbers to the org's provisioned rows and inserts it posted.
 */
import type { Øre } from '../money/ore.js';
import { ZERO } from '../money/ore.js';
import type { AccountNo, Voucher } from '../posting/types.js';

/** The direction of the settled cash flow. */
export type SettlementDirection = 'incoming' | 'outgoing';

export interface SettlementInput {
  /** The settled amount as a positive magnitude in øre (the bank line's absolute amount). */
  readonly amount: Øre;
  readonly direction: SettlementDirection;
  /** The bank/cash asset account the money moved through (e.g. 1920 Bankinnskudd). */
  readonly bankAccount: AccountNo;
  /** The counter account: a receivable (1500) for incoming, a payable (2400) for outgoing. */
  readonly counterAccount: AccountNo;
}

/**
 * Derive the BALANCED settlement voucher for a matched bank payment. Incoming → debit bank / credit
 * the counter (receivable); outgoing → the inverse. Throws on a non-positive amount: a settlement is
 * always a positive movement, and the caller passes the bank line's magnitude.
 */
export function deriveSettlement(input: SettlementInput): Voucher {
  const { amount, direction, bankAccount, counterAccount } = input;
  if (!(amount > 0)) {
    throw new RangeError(`settlement amount must be a positive number of øre, got ${amount}`);
  }
  const bankLeg =
    direction === 'incoming'
      ? { account: bankAccount, debit: amount, credit: ZERO }
      : { account: bankAccount, debit: ZERO, credit: amount };
  const counterLeg =
    direction === 'incoming'
      ? { account: counterAccount, debit: ZERO, credit: amount }
      : { account: counterAccount, debit: amount, credit: ZERO };
  return { type: 'bank', lines: [bankLeg, counterLeg] };
}
