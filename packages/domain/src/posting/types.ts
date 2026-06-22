/**
 * Posting types — the shape of a balanced voucher. The posting-derivation functions
 * (sales, purchase with the input-VAT fork, reverse charge) are implemented in Phase 2;
 * this file fixes the contract so the ledger schema and the rules engine agree.
 *
 * Hard invariant: for every voucher, Σ debit = Σ credit (also enforced by a SQL trigger).
 */
import type { Øre } from '../money/ore.js';

export type AccountNo = string & { readonly __brand: 'accountNo' };
export type VatCode = string & { readonly __brand: 'vatCode' };

export type VoucherType = 'sales' | 'purchase' | 'manual' | 'bank' | 'reversal';

export interface PostingLine {
  readonly account: AccountNo;
  readonly vatCode?: VatCode;
  readonly debit: Øre;
  readonly credit: Øre;
}

export interface Voucher {
  readonly type: VoucherType;
  readonly lines: readonly PostingLine[];
  /** Set only for reversal vouchers (motbilag). */
  readonly reversesVoucherId?: string;
}
