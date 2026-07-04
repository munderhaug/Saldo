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
  // A negative net would silently flip the voucher's economic direction (postings are sign-checked
  // in SQL, but the flip would surface as a confusing balance error, not the real cause). A
  // correction is a motbilag, never a negative amount (review 2026-07-03 §10).
  if (net < ZERO) throw new RangeError(`purchase net must be non-negative, got ${net}`);
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

export interface ReverseChargePurchaseAccounts {
  /** Expense/asset account — booked net (deductible) or gross incl. self-accounted VAT (non-deductible). */
  readonly cost: AccountNo;
  /** Credit side: supplier payable or bank (always the NET — the supplier never invoices the VAT). */
  readonly payable: AccountNo;
  /** Self-accounted OUTPUT-VAT account for the kind+rate (2704–2709). Always credited when VAT applies. */
  readonly outputVat: AccountNo;
  /** Deductible INPUT-VAT account for the kind+rate (2714–2718). Debited only when deductible. */
  readonly inputVat: AccountNo;
}

export interface ReverseChargePurchaseInput {
  /** Net amount (the supplier's invoice, excl. VAT — there is none on a reverse-charge purchase). */
  readonly net: Øre;
  /** VAT rate from the reverse-charge SAF-T code's category (0 ⇒ no VAT legs, e.g. code 85). */
  readonly vatRate: Rate;
  readonly status: MvaStatus;
  readonly accounts: ReverseChargePurchaseAccounts;
  /**
   * Whether the self-accounted input VAT is deductible. Decide it from the committed SAF-T
   * classification (`reverseChargeInputDeductible`) AND the non-deductible business rules
   * (representasjon / vehicle / private-use) — never infer it from MVA status alone.
   */
  readonly deductible: boolean;
  /** Output-direction SAF-T code for the self-account (output) leg — so the MVA basis counts it as output. */
  readonly outputVatCode?: VatCode;
  /**
   * The reverse-charge basis code (e.g. 86 deductible / 87 non-deductible). Tags the cost line always,
   * and — when deductible — the input (deduction) leg too, so the MVA basis counts that leg as input.
   */
  readonly inputVatCode?: VatCode;
}

/**
 * Reverse-charge (snudd avregning) purchase — import of goods, services bought from abroad, or
 * gold/emission-allowance trading: the BUYER self-accounts VAT. Unlike `derivePurchase`, this posts
 * BOTH a self-accounted **output** leg (the VAT the buyer owes) and, when deductible, an **input**
 * leg (the VAT it reclaims) — so both land on the MVA-melding even though net cash is only the
 * supplier's net (ADR — `.claude/rules/vat.md`). Branch here on the SAF-T code's `reverseCharge`
 * flag; NEVER treat such a code as an ordinary single-leg input/output.
 *
 * The MVA-status fork (the hard invariant):
 *  - registered (`chargesOutputVat`) → self-account. Deductible: net→cost, output VAT credited,
 *    input VAT debited (net cash = net). Non-deductible: the self-accounted VAT becomes cost, output
 *    VAT still credited, no input leg (net cash = net + the VAT owed). The cost is split into the NET
 *    on the code-bearing line (so the MVA-melding basis stays the net supply value) plus the
 *    irrecoverable VAT on a separate UNCODED cost line — never folded into the coded basis.
 *  - not registered (`under_threshold`/`unntatt`) → outside the VAT system in this slice; book the
 *    net to cost with no melding legs. (Below-threshold § 3-30 self-accounting is sequenced to
 *    `vat-threshold-watcher`.)
 * Always balanced (Σ debit = Σ credit), which the SQL trigger also guarantees.
 */
export function deriveReverseChargePurchase(input: ReverseChargePurchaseInput): Voucher {
  const { net, vatRate, status, accounts, deductible, outputVatCode, inputVatCode } = input;
  const vat = mulRate(net, vatRate);

  // Outside the VAT system, or a zero-rate code (no VAT to self-account): a plain net purchase.
  if (!chargesOutputVat(status) || isZeroØre(vat)) {
    return {
      type: 'purchase',
      lines: [line(accounts.cost, net, ZERO, inputVatCode), line(accounts.payable, ZERO, net)],
    };
  }

  // Self-account the output leg ALWAYS (it lands on the melding). Deductible: net to cost + input
  // deduction. Non-deductible: the VAT is irrecoverable, so it joins the cost — but as a SEPARATE
  // uncoded line, leaving the code-bearing cost line at the NET so the melding basis (grunnlag) is the
  // net supply value, not net+VAT. Both branches debit the cost account net+VAT in total.
  const lines: PostingLine[] = deductible
    ? [
        line(accounts.cost, net, ZERO, inputVatCode),
        line(accounts.inputVat, vat, ZERO, inputVatCode),
        line(accounts.payable, ZERO, net),
        line(accounts.outputVat, ZERO, vat, outputVatCode),
      ]
    : [
        line(accounts.cost, net, ZERO, inputVatCode),
        line(accounts.cost, vat, ZERO),
        line(accounts.payable, ZERO, net),
        line(accounts.outputVat, ZERO, vat, outputVatCode),
      ];
  return { type: 'purchase', lines };
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
  // Typed refusal (not a throw — this runs on user input at issue time): a negative line never
  // posts; a correction is a motbilag / kreditnota (review 2026-07-03 §10).
  if (net < ZERO) {
    return { ok: false, error: 'Amounts must be non-negative: correct with a credit note' };
  }
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
