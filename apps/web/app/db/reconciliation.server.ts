/**
 * Bank reconciliation queries + the settlement mutation (build-spec §8.7, feat-reconciliation).
 *
 * This is the downstream consumer of the append-only banking-import substrate (ADR 0047): it reads the
 * org's UNMATCHED incoming bank transactions and its OPEN invoices, proposes matches with the pure
 * `@saldo/domain` matcher (deterministic, NOT an AI system), and — on a human-confirmed match — posts
 * the settlement voucher and marks the invoice paid, all in one tenant transaction.
 *
 * Invariants honoured here:
 *  - Payment posting happens HERE, not at import. The settlement is a BALANCED `bank` voucher derived
 *    by `deriveSettlement` (debit bank 1920 / credit receivable 1500 for an incoming customer payment).
 *  - The ledger is append-only: a new posted voucher, never an UPDATE of a posted row.
 *  - Setting `bank_transaction.matched_voucher_id` (and stamping the matched `kid` for provenance) is
 *    the ONLY mutation the import row's append-only trigger permits — every other column stays frozen.
 *  - Tenancy: the caller opens the tx via `withUserOrg`, so RLS scopes every statement to the org.
 *
 * Money stays integer øre; account NUMBERS are resolved to the org's provisioned rows by
 * `insertPostedVoucher` (source-grounded, verified by `posting-accounts.test.ts`).
 */
import { and, desc, eq, gt, inArray, isNull } from 'drizzle-orm';
import {
  deriveSettlement,
  matchBankLine,
  øre,
  type AccountNo,
  type BankLine,
  type MatchCandidate,
  type MatchConfig,
  type OpenInvoice,
} from '@saldo/domain';
import type { OrgTx } from '../auth/middleware.js';
import type { ConfirmMatchInput } from '../contracts/reconciliation.js';
import { bankTransaction, invoice } from './schema.js';
import { SETTLEMENT_ACCOUNTS, ensureFiscalPeriod, insertPostedVoucher } from './posting.server.js';
import { transitionInvoice } from './invoices.server.js';

/** The lifecycle states in which an issued invoice is still awaiting payment (can be settled). */
const OPEN_STATUSES = ['issued', 'sent', 'viewed', 'overdue'] as const;

/** An unmatched incoming bank transaction, reduced to what the reconcile screen + matcher need. */
export interface UnmatchedTxRow {
  readonly id: string;
  readonly amountOre: number;
  readonly bookingDate: string | null;
  readonly remittanceInfo: string | null; // personal/financial data
  readonly counterparty: string | null; // personal/financial data
}

/** An open invoice the matcher can settle a payment against. */
export interface OpenInvoiceRow {
  readonly invoiceId: string;
  readonly invoiceNumber: number | null;
  readonly customerName: string; // personal data
  readonly kid: string | null;
  readonly outstandingOre: number;
  readonly issueDate: string | null;
  readonly dueDate: string | null;
}

/** A candidate enriched with the invoice display fields the UI needs (id alone is not legible). */
export interface SuggestedMatch extends MatchCandidate {
  readonly invoiceNumber: number | null;
  readonly customerName: string;
}

/** One bank transaction with its proposed matches (the auto-match, if any, plus the manual list). */
export interface TxSuggestion {
  readonly transaction: UnmatchedTxRow;
  readonly auto: SuggestedMatch | null;
  readonly candidates: readonly SuggestedMatch[];
}

/** Unmatched INCOMING transactions for an account (outgoing has no AP document to settle yet). */
export async function listUnmatchedIncoming(
  tx: OrgTx,
  accountId: string,
): Promise<UnmatchedTxRow[]> {
  return tx
    .select({
      id: bankTransaction.id,
      amountOre: bankTransaction.amountOre,
      bookingDate: bankTransaction.bookingDate,
      remittanceInfo: bankTransaction.remittanceInfo,
      counterparty: bankTransaction.counterparty,
    })
    .from(bankTransaction)
    .where(
      and(
        eq(bankTransaction.bankAccountId, accountId),
        isNull(bankTransaction.matchedVoucherId),
        gt(bankTransaction.amountOre, 0),
      ),
    )
    .orderBy(desc(bankTransaction.bookingDate));
}

/** The org's open (issued, unpaid) invoices — the receivables a payment can settle. */
export async function listOpenInvoices(tx: OrgTx): Promise<OpenInvoiceRow[]> {
  return tx
    .select({
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      customerName: invoice.customerName,
      kid: invoice.kid,
      outstandingOre: invoice.grossOre,
      issueDate: invoice.issueDate,
      dueDate: invoice.dueDate,
    })
    .from(invoice)
    .where(
      and(
        eq(invoice.kind, 'invoice'),
        inArray(invoice.status, [...OPEN_STATUSES]),
        gt(invoice.grossOre, 0),
      ),
    )
    .orderBy(desc(invoice.issueDate));
}

/**
 * Run the pure matcher over each unmatched transaction and enrich the candidates with invoice display
 * fields. Pure with respect to the DB (no queries) — it only transforms the two row lists, so it runs
 * identically in the loader and could run in the browser for optimistic UX.
 */
export function buildSuggestions(
  transactions: readonly UnmatchedTxRow[],
  openInvoices: readonly OpenInvoiceRow[],
  config?: MatchConfig,
): TxSuggestion[] {
  const display = new Map(
    openInvoices.map((o) => [
      o.invoiceId,
      { invoiceNumber: o.invoiceNumber, customerName: o.customerName },
    ]),
  );
  const domainInvoices: OpenInvoice[] = openInvoices.map((o) => ({
    invoiceId: o.invoiceId,
    kid: o.kid,
    outstanding: øre(o.outstandingOre),
    issueDate: o.issueDate,
    dueDate: o.dueDate,
  }));

  const enrich = (c: MatchCandidate): SuggestedMatch => ({
    ...c,
    invoiceNumber: display.get(c.invoiceId)?.invoiceNumber ?? null,
    customerName: display.get(c.invoiceId)?.customerName ?? '',
  });

  return transactions.map((transaction): TxSuggestion => {
    const line: BankLine = {
      amount: øre(transaction.amountOre),
      bookingDate: transaction.bookingDate,
      remittanceInfo: transaction.remittanceInfo,
    };
    const result = config
      ? matchBankLine(line, domainInvoices, config)
      : matchBankLine(line, domainInvoices);
    return {
      transaction,
      auto: result.auto ? enrich(result.auto) : null,
      candidates: result.candidates.map(enrich),
    };
  });
}

export type ReconcileResult =
  | { readonly ok: true; readonly voucherId: string; readonly invoiceId: string }
  | {
      readonly ok: false;
      readonly reason:
        | 'tx-not-found'
        | 'tx-already-matched'
        | 'tx-not-incoming'
        | 'invoice-not-open'
        | 'amount-mismatch'
        | 'undated'
        | 'chart-incomplete';
    };

/**
 * Confirm a human-chosen match: post the settlement voucher, link the bank transaction to it, and mark
 * the invoice paid — atomically in the caller's transaction. All validation runs BEFORE any mutation,
 * so an expected rejection (already matched, amount mismatch, …) never leaves a half-written ledger.
 * Requires an EXACT settlement (amount == outstanding); partial / over-payments are a later refinement.
 */
export async function reconcileMatch(
  tx: OrgTx,
  organizationId: string,
  input: ConfirmMatchInput,
): Promise<ReconcileResult> {
  // Lock BOTH rows for the duration of this transaction (FOR UPDATE): two concurrent confirms of the
  // same transaction/invoice serialize here, and the loser re-reads the winner's committed state —
  // matched / paid — and takes the typed rejection below instead of posting a second settlement.
  const [btx] = await tx
    .select({
      id: bankTransaction.id,
      amountOre: bankTransaction.amountOre,
      bookingDate: bankTransaction.bookingDate,
      matchedVoucherId: bankTransaction.matchedVoucherId,
    })
    .from(bankTransaction)
    .where(eq(bankTransaction.id, input.bankTransactionId))
    .limit(1)
    .for('update');
  if (!btx) return { ok: false, reason: 'tx-not-found' };
  if (btx.matchedVoucherId !== null) return { ok: false, reason: 'tx-already-matched' };
  if (!(btx.amountOre > 0)) return { ok: false, reason: 'tx-not-incoming' };

  const [inv] = await tx
    .select({
      id: invoice.id,
      status: invoice.status,
      kind: invoice.kind,
      grossOre: invoice.grossOre,
      kid: invoice.kid,
      issueDate: invoice.issueDate,
    })
    .from(invoice)
    .where(eq(invoice.id, input.invoiceId))
    .limit(1)
    .for('update');
  if (
    !inv ||
    inv.kind !== 'invoice' ||
    !(OPEN_STATUSES as readonly string[]).includes(inv.status)
  ) {
    return { ok: false, reason: 'invoice-not-open' };
  }
  if (btx.amountOre !== inv.grossOre) return { ok: false, reason: 'amount-mismatch' };

  // Post the settlement in the period the payment cleared (its booking date), falling back to the
  // invoice's issue year if the source omitted a booking date. An issued invoice always carries an
  // issue date, so this resolves in practice; the guard keeps the "validate before mutating" contract
  // (a missing/garbled year returns a typed reason instead of throwing on a NaN period insert).
  const year = Number((btx.bookingDate ?? inv.issueDate ?? '').slice(0, 4));
  if (!Number.isInteger(year) || year < 1000 || year > 9999) {
    return { ok: false, reason: 'undated' };
  }
  const periodId = await ensureFiscalPeriod(tx, organizationId, year);

  const settlement = deriveSettlement({
    amount: øre(btx.amountOre),
    direction: 'incoming',
    bankAccount: SETTLEMENT_ACCOUNTS.bank as AccountNo,
    counterAccount: SETTLEMENT_ACCOUNTS.receivable as AccountNo,
  });
  const inserted = await insertPostedVoucher(tx, organizationId, 'bank', periodId, settlement);
  if (!inserted.ok) return { ok: false, reason: 'chart-incomplete' };

  // The ONLY mutations the imported row's append-only trigger permits: link the settlement voucher and
  // stamp the KID that matched (provenance for the reconciliation). Guarded (matched_voucher_id must
  // still be NULL) + row-count checked as a backstop to the FOR UPDATE lock: if this ever misses, the
  // settlement voucher above must NOT commit, so throw to roll the whole confirm back.
  const linked = await tx
    .update(bankTransaction)
    .set({ matchedVoucherId: inserted.voucherId, kid: inv.kid })
    .where(and(eq(bankTransaction.id, btx.id), isNull(bankTransaction.matchedVoucherId)))
    .returning({ id: bankTransaction.id });
  if (linked.length === 0) {
    throw new Error(`bank transaction ${btx.id} was matched concurrently during reconcile`);
  }

  // The open-status guard above guarantees `→ paid` is a legal move, so this cannot fail here; throw if
  // that ever stops holding so the whole transaction rolls back rather than committing a half-match.
  const transitioned = await transitionInvoice(tx, inv.id, 'paid');
  if (!transitioned)
    throw new Error(`invoice ${inv.id} could not transition to paid during reconcile`);

  return { ok: true, voucherId: inserted.voucherId, invoiceId: inv.id };
}
