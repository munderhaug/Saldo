/**
 * Owner-equity posting (build-spec §8.5, feat-supplier-invoices) for a sole proprietorship (ENK),
 * where the owner and the business are not separate persons. Two everyday events the supplier-payable
 * path can't express:
 *
 *  - **Owner outlay (utlegg)** — the owner paid a business cost from PRIVATE funds, or the business owes
 *    the owner a tax-free travel allowance (kjøregodtgjørelse / diett) booked as a *deduction, not
 *    payroll* (§8.5). Economically a purchase whose contra is the owner's equity contribution, not a
 *    supplier payable — so it REUSES `derivePurchase` (THE input-VAT fork) with the equity account in
 *    the payable slot. The fork still holds: a registered org reclaims deductible input VAT; an
 *    unregistered one books the gross. Mileage/diett carry no VAT (rate 0), so they post as a plain
 *    cost debit + equity credit.
 *  - **Drawing (privatuttak)** — the owner took cash out: a pure balance-sheet movement (equity down,
 *    bank down), no income/expense and no VAT. derive.ts has no such event, so this is its one new,
 *    minimal two-leg derivation.
 *
 * Pure and always balanced (also enforced by the SQL balance trigger). AI never reaches here — these
 * are human-recorded events posted through the existing append-only ledger path.
 */
import { ZERO, type Øre, type Rate } from '../money/ore.js';
import { type MvaStatus } from '../vat/status.js';
import { derivePurchase } from './derive.js';
import type { AccountNo, VatCode, Voucher } from './types.js';

export interface OwnerOutlayAccounts {
  /** Expense/asset account — booked net (deductible) or gross (not registered / non-deductible). */
  readonly cost: AccountNo;
  /** Deductible input-VAT account — used only when the org deducts input VAT and the line is deductible. */
  readonly inputVat: AccountNo;
  /** The owner-equity contra (e.g. 2062 Innskudd kontanter) — credited the gross the owner funded. */
  readonly equity: AccountNo;
}

export interface OwnerOutlayInput {
  /** Net amount in øre (excl. VAT). Mileage/diett pass the computed allowance with `vatRate` 0. */
  readonly net: Øre;
  /** VAT rate from the line's SAF-T code (0 for a VAT-free allowance). */
  readonly vatRate: Rate;
  readonly status: MvaStatus;
  readonly accounts: OwnerOutlayAccounts;
  /** `false` for the non-deductible-even-when-registered cases — books the gross to cost. Defaults true. */
  readonly deductible?: boolean;
  readonly vatCode?: VatCode;
}

/**
 * Derive an owner-outlay voucher (utlegg / mileage / diett). Delegates to `derivePurchase` with the
 * owner-equity account in the payable slot, so the input-VAT fork is owned in one place; the only thing
 * this changes versus a supplier purchase is the credit side (owner equity, not a supplier payable).
 */
export function deriveOwnerOutlay(input: OwnerOutlayInput): Voucher {
  return derivePurchase({
    net: input.net,
    vatRate: input.vatRate,
    status: input.status,
    accounts: {
      cost: input.accounts.cost,
      inputVat: input.accounts.inputVat,
      payable: input.accounts.equity,
    },
    ...(input.deductible === undefined ? {} : { deductible: input.deductible }),
    ...(input.vatCode === undefined ? {} : { vatCode: input.vatCode }),
  });
}

export interface DrawingAccounts {
  /** Drawings/equity account debited the amount taken out (e.g. 2060 Uttak kontanter). */
  readonly drawings: AccountNo;
  /** Asset account the cash leaves (e.g. 1920 Bankinnskudd). */
  readonly asset: AccountNo;
}

/**
 * Derive a drawing (privatuttak) of cash: debit the drawings/equity account, credit the asset. A pure
 * balance-sheet movement with no income/expense and no VAT — `type: 'manual'` (it is neither a sale nor
 * a purchase). Always balanced by construction.
 */
export function deriveDrawing(amount: Øre, accounts: DrawingAccounts): Voucher {
  return {
    type: 'manual',
    lines: [
      { account: accounts.drawings, debit: amount, credit: ZERO },
      { account: accounts.asset, debit: ZERO, credit: amount },
    ],
  };
}
