/**
 * The balance invariant, in the pure core. This is the SAME rule the SQL constraint trigger
 * enforces — having it here gives instant client/server feedback; having it in SQL makes it
 * impossible to violate. Both must agree.
 */
import { eqØre, sumØre, type Øre } from '../money/ore.js';
import type { Voucher } from './types.js';

export function totalDebit(voucher: Voucher): Øre {
  return sumØre(voucher.lines.map((l) => l.debit));
}

export function totalCredit(voucher: Voucher): Øre {
  return sumØre(voucher.lines.map((l) => l.credit));
}

/** A voucher balances iff Σ debit = Σ credit. */
export function isBalanced(voucher: Voucher): boolean {
  return eqØre(totalDebit(voucher), totalCredit(voucher));
}
