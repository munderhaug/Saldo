/**
 * Posting derivation — turning an economic event into a balanced voucher. The MVA status drives
 * everything (hard invariant §4.2.6). These are the single, status-branching functions the
 * build-spec demands (§4.3) — not scattered conditionals. They are pure and run identically in
 * the browser (instant preview) and in the server action (the truth).
 *
 * The rules engine (src/rules) validates a proposed voucher before it is committed; these
 * functions produce the proposal. AI never bypasses them (ADR 0002).
 */
import { addØre, isZeroØre, mulRate, ZERO, type Øre, type Rate } from '../money/ore.js';
import { chargesOutputVat, deductsInputVat, type MvaStatus } from '../vat/status.js';
import type { AccountNo, PostingLine, VatCode, Voucher } from './types.js';

/** Construct a posting line, omitting `vatCode` entirely when none applies (exact-optional). */
function line(account: AccountNo, debit: Øre, credit: Øre, vatCode?: VatCode): PostingLine {
  return vatCode === undefined ? { account, debit, credit } : { account, vatCode, debit, credit };
}

export interface PurchaseAccounts {
  /** Expense/asset account — booked net (registered) or gross (not registered). */
  readonly cost: AccountNo;
  /** Deductible input-VAT account — used only when the org deducts input VAT. */
  readonly inputVat: AccountNo;
  /** Credit side: supplier payable or bank. */
  readonly payable: AccountNo;
}

export interface PurchaseInput {
  /** Net amount excluding VAT, in øre. */
  readonly net: Øre;
  /** VAT rate from the purchase's SAF-T code (0 when none). */
  readonly vatRate: Rate;
  readonly status: MvaStatus;
  readonly accounts: PurchaseAccounts;
  readonly vatCode?: VatCode;
  /**
   * Whether the input VAT on this line is deductible. Defaults to `true`. Pass `false` for the
   * non-deductible-even-when-registered cases (representasjon, restricted vehicle costs, the
   * private-use portion, and `uten fradragsrett` SAF-T codes, §4.3) so the gross is booked to
   * cost rather than split — the fork must not infer deductibility from MVA status alone.
   */
  readonly deductible?: boolean;
}

/**
 * THE input-VAT fork. The *same* purchase posts differently based on MVA status AND whether the
 * line is deductible:
 * - registered AND deductible → split deductible input VAT to the input-VAT account; cost is net.
 * - registered BUT non-deductible, or `under_threshold` / `unntatt` → no deduction; the whole
 *   gross is booked to the cost account.
 *
 * Always balanced (Σ debit = Σ credit), which the SQL trigger also guarantees. Reverse-charge
 * (snudd avregning) purchases need BOTH legs and are NOT handled here — branch on the SAF-T code's
 * `reverseCharge` flag before calling this; the dual-leg derivation lands in Phase 2.
 */
export function derivePurchase(input: PurchaseInput): Voucher {
  const { net, vatRate, status, accounts, vatCode } = input;
  const vat = mulRate(net, vatRate);
  const gross = addØre(net, vat);

  if (deductsInputVat(status) && input.deductible !== false) {
    const lines: PostingLine[] = [line(accounts.cost, net, ZERO, vatCode)];
    if (!isZeroØre(vat)) {
      lines.push(line(accounts.inputVat, vat, ZERO, vatCode));
    }
    lines.push(line(accounts.payable, ZERO, gross));
    return { type: 'purchase', lines };
  }

  // Not registered: VAT is not reclaimable — it becomes part of the cost (book gross).
  return {
    type: 'purchase',
    lines: [line(accounts.cost, gross, ZERO, vatCode), line(accounts.payable, ZERO, gross)],
  };
}

export interface SalesAccounts {
  /** Customer receivable — debited gross. */
  readonly receivable: AccountNo;
  /** Revenue account — credited net. */
  readonly revenue: AccountNo;
  /** Output-VAT account — credited the VAT, only when registered and the rate is non-zero. */
  readonly outputVat: AccountNo;
}

export interface SalesInput {
  readonly net: Øre;
  readonly vatRate: Rate;
  readonly status: MvaStatus;
  readonly accounts: SalesAccounts;
  readonly vatCode?: VatCode;
}

export type DeriveResult =
  | { readonly ok: true; readonly voucher: Voucher }
  | { readonly ok: false; readonly error: string };

/**
 * Derive a sales voucher. Output VAT is charged ONLY when the org is VAT-registered; attempting to
 * charge VAT while `under_threshold`/`unntatt` is a hard block (§4.3), not a silent default — the
 * caller must surface the error rather than issue an invoice showing MVA it may not charge.
 */
export function deriveSales(input: SalesInput): DeriveResult {
  const { net, vatRate, status, accounts, vatCode } = input;
  const vat = mulRate(net, vatRate);

  if (!chargesOutputVat(status)) {
    if (!isZeroØre(vat)) {
      return {
        ok: false,
        error: 'Cannot charge output VAT: organization is not VAT-registered',
      };
    }
    return {
      ok: true,
      voucher: {
        type: 'sales',
        lines: [line(accounts.receivable, net, ZERO), line(accounts.revenue, ZERO, net, vatCode)],
      },
    };
  }

  const gross = addØre(net, vat);
  const lines: PostingLine[] = [
    line(accounts.receivable, gross, ZERO),
    line(accounts.revenue, ZERO, net, vatCode),
  ];
  if (!isZeroØre(vat)) {
    lines.push(line(accounts.outputVat, ZERO, vat, vatCode));
  }
  return { ok: true, voucher: { type: 'sales', lines } };
}
