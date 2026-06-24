/**
 * Manual voucher entry (ADR 0034) — the status-driven *standard-rate* fork for a hand-entered income
 * or expense event. The everyday surface records an event (income / expense) + a net amount and never
 * asks for a VAT code; this pure function turns that, plus the org's `mva_status`, into the voucher the
 * ledger stores — at the org's STANDARD treatment. It composes the already-tested `deriveSales` /
 * `derivePurchase` (the legs) with the registration predicates (`./vat/status`), so the only new
 * behavior is *which* rate/code the standard event applies per status — and that is what this module's
 * exhaustive test pins.
 *
 * Standard treatment, per the hard invariant that status drives all posting:
 *  - **income** charges 25 % output VAT ONLY when `registered_standard`. `registered_zero_rated` sells
 *    at 0 % (fritatt), and below-threshold / unntatt charge no VAT — so all three book a plain sale.
 *  - **expense** deducts 25 % input VAT whenever the org deducts input VAT (`deductsInputVat` — i.e.
 *    BOTH registered states, including zero-rated, which still reclaims input VAT); otherwise the gross
 *    is booked to cost (the input-VAT fork in `derivePurchase`).
 *
 * Reduced rates, zero-rated/reverse-charge codes, and non-deductible cases are deferred (ADR 0034 §
 * scope cuts); this is the standard-rate slice only.
 */
import { rate, type Øre, type Rate } from '../money/ore.js';
import { deductsInputVat, type MvaStatus } from '../vat/status.js';
import { rateForCategory } from '../saft/rates.js';
import {
  derivePurchase,
  deriveSales,
  type PurchaseAccounts,
  type SalesAccounts,
} from './derive.js';
import type { DeriveResult } from './derive.js';
import type { VatCode, Voucher } from './types.js';

/** The standard MVA rate (25 %), resolved from the cited rate table — never a memorised literal. */
const STANDARD_RATE: Rate = rateForCategory('regular');
const NO_RATE: Rate = rate(0);

/**
 * A standard-rate income event. Charges output VAT (with the output code) only when
 * `registered_standard`; every other status books a plain sale at net. Returns `deriveSales`'
 * `DeriveResult` (the unregistered-but-charging case is impossible here, but the type is preserved).
 */
export function deriveStandardIncome(
  net: Øre,
  status: MvaStatus,
  accounts: SalesAccounts,
  outputCode: VatCode,
): DeriveResult {
  return status === 'registered_standard'
    ? deriveSales({ net, vatRate: STANDARD_RATE, status, accounts, vatCode: outputCode })
    : deriveSales({ net, vatRate: NO_RATE, status, accounts });
}

/**
 * A standard-rate expense event. Deducts 25 % input VAT (with the input code) whenever the org deducts
 * input VAT; otherwise books the gross to cost. `derivePurchase` owns the input-VAT fork.
 */
export function deriveStandardExpense(
  net: Øre,
  status: MvaStatus,
  accounts: PurchaseAccounts,
  inputCode: VatCode,
): Voucher {
  return deductsInputVat(status)
    ? derivePurchase({ net, vatRate: STANDARD_RATE, status, accounts, vatCode: inputCode })
    : derivePurchase({ net, vatRate: NO_RATE, status, accounts });
}
