/**
 * Reporting aggregation queries (feat-reporting, build-spec §8.9). Every report is a READ-ONLY
 * aggregation over the POSTED ledger, read through `withUserOrg` (membership proven) + FORCE-RLS —
 * exactly like `aggregateLedger` / `aggregateVatByCode`. The unfiltered reads return only the current
 * tenant's rows because every table here is scoped to `app.current_org`. The reports book NOTHING; they
 * never touch the append-only ledger except to read it. Server-only.
 *
 * HOW the sums are taken carries the correctness, so it lives here (the query layer) and the pure
 * `@saldo/domain` reporting functions only compose the results:
 *  - `aggregateAccountBalances` sums Σdebit / Σcredit PER ACCOUNT over one fiscal year's posted
 *    vouchers — the input to resultat / balanse / likviditet.
 *  - `listOpenReceivables` reads the org's OPEN invoices (issued, not yet paid) reusing the invoice
 *    lifecycle, signed + for an invoice / − for a credit note — the input to reskontro aging.
 *  - `readAccountLedger` reads one account's posted entries for the year plus its incoming balance from
 *    prior periods — the hovedbok drill-down.
 */
import { and, asc, eq, inArray, isNotNull, lt, lte, ne, sql } from 'drizzle-orm';
import {
  type HovedbokEntry,
  type LedgerAccountBalance,
  type OpenReceivable,
  type AccountNo,
  øre,
} from '@saldo/domain';
import type { OrgTx } from '../auth/middleware.js';
import { account, fiscalPeriod, invoice, posting, voucher } from './schema.js';

/** SUM(bigint) returns numeric; postgres.js hands it back as a string. Parse to a plain number of øre. */
const toNum = (value: string | null): number => Number(value ?? 0);

/** The invoice lifecycle states in which an issued document is still outstanding (open AR). */
const OPEN_STATUSES = ['issued', 'sent', 'viewed', 'overdue'] as const;

/**
 * Per-account debit/credit totals over POSTED vouchers only (drafts excluded). Only accounts that
 * carried activity appear. Feeds resultat, balanse, and likviditet.
 *
 * Two dimensions (ADR 0064):
 *  - `excludeYearEnd` drops the closing voucher: the resultat report (and the close derivation
 *    itself) must read the year's REAL activity even after the close has emptied the result
 *    accounts.
 *  - `cumulative` sums every fiscal year up to AND including `year` — the POSITION view the balanse
 *    and likviditet need in a continuous ledger, where balance-sheet accounts carry across years by
 *    sum (no yearly opening voucher exists). Closed years' result accounts net zero inside the
 *    cumulative sum, so the derived årsresultat computes to exactly the UNCLOSED remainder — no
 *    special-casing, no double count against the equity the close posted.
 */
export async function aggregateAccountBalances(
  tx: OrgTx,
  year: number,
  opts: { readonly excludeYearEnd?: boolean; readonly cumulative?: boolean } = {},
): Promise<LedgerAccountBalance[]> {
  const rows = await tx
    .select({
      number: account.number,
      name: account.name,
      debit: sql<string>`coalesce(sum(${posting.debitOre}), 0)::bigint`,
      credit: sql<string>`coalesce(sum(${posting.creditOre}), 0)::bigint`,
    })
    .from(posting)
    .innerJoin(voucher, eq(voucher.id, posting.voucherId))
    .innerJoin(fiscalPeriod, eq(fiscalPeriod.id, voucher.periodId))
    .innerJoin(account, eq(account.id, posting.accountId))
    .where(
      and(
        isNotNull(voucher.postedAt),
        opts.cumulative ? lte(fiscalPeriod.year, year) : eq(fiscalPeriod.year, year),
        ...(opts.excludeYearEnd ? [ne(voucher.type, 'year_end')] : []),
      ),
    )
    .groupBy(account.number, account.name);

  return rows.map((r) => ({
    number: r.number as AccountNo,
    name: r.name,
    debitØre: øre(toNum(r.debit)),
    creditØre: øre(toNum(r.credit)),
  }));
}

/**
 * The org's OPEN receivables: every issued, not-yet-paid invoice and credit note. A credit note is
 * signed negative so the per-contact sum reconciles to the kundefordringer control account. Quotes and
 * drafts are excluded (they have no ledger entry).
 */
export async function listOpenReceivables(tx: OrgTx): Promise<OpenReceivable[]> {
  const rows = await tx
    .select({
      kind: invoice.kind,
      customerId: invoice.customerId,
      customerName: invoice.customerName, // personal: a customer name may be a natural person (ENK)
      grossOre: invoice.grossOre,
      dueDate: invoice.dueDate,
    })
    .from(invoice)
    .where(
      and(
        inArray(invoice.kind, ['invoice', 'credit_note']),
        inArray(invoice.status, [...OPEN_STATUSES]),
      ),
    );

  return rows.map((r) => ({
    contactId: r.customerId,
    contactName: r.customerName,
    amountØre: øre(r.kind === 'credit_note' ? -r.grossOre : r.grossOre),
    dueDate: r.dueDate,
  }));
}

/** An account identified for the hovedbok drill-down (id is needed to scope the entries). */
export interface AccountRef {
  readonly id: string;
  readonly number: string;
  readonly name: string;
}

/** The accounts that carried posted activity in `year`, for the hovedbok account picker. */
export async function listActiveAccounts(tx: OrgTx, year: number): Promise<AccountRef[]> {
  const rows = await tx
    .selectDistinct({ id: account.id, number: account.number, name: account.name })
    .from(posting)
    .innerJoin(voucher, eq(voucher.id, posting.voucherId))
    .innerJoin(fiscalPeriod, eq(fiscalPeriod.id, voucher.periodId))
    .innerJoin(account, eq(account.id, posting.accountId))
    .where(and(isNotNull(voucher.postedAt), eq(fiscalPeriod.year, year)))
    .orderBy(asc(account.number));
  return rows;
}

/** One account's hovedbok: its incoming balance (prior periods) and its posted entries for `year`. */
export interface AccountLedger {
  readonly account: AccountRef;
  readonly openingØre: number;
  readonly entries: HovedbokEntry[];
}

/**
 * Read one account's hovedbok for `year`: the incoming balance (Σ debit − credit over POSTED vouchers
 * in prior fiscal years) and each posted entry in the year, ordered chronologically. Returns null when
 * the account doesn't belong to the tenant (RLS makes it invisible).
 */
export async function readAccountLedger(
  tx: OrgTx,
  accountId: string,
  year: number,
): Promise<AccountLedger | null> {
  const [acc] = await tx
    .select({ id: account.id, number: account.number, name: account.name })
    .from(account)
    .where(eq(account.id, accountId));
  if (!acc) return null;

  const [openingRow] = await tx
    .select({
      opening: sql<string>`coalesce(sum(${posting.debitOre} - ${posting.creditOre}), 0)::bigint`,
    })
    .from(posting)
    .innerJoin(voucher, eq(voucher.id, posting.voucherId))
    .innerJoin(fiscalPeriod, eq(fiscalPeriod.id, voucher.periodId))
    .where(
      and(
        eq(posting.accountId, accountId),
        isNotNull(voucher.postedAt),
        lt(fiscalPeriod.year, year),
      ),
    );

  const rows = await tx
    .select({
      voucherId: posting.voucherId,
      voucherType: voucher.type,
      date: voucher.postedAt,
      debit: posting.debitOre,
      credit: posting.creditOre,
    })
    .from(posting)
    .innerJoin(voucher, eq(voucher.id, posting.voucherId))
    .innerJoin(fiscalPeriod, eq(fiscalPeriod.id, voucher.periodId))
    .where(
      and(
        eq(posting.accountId, accountId),
        isNotNull(voucher.postedAt),
        eq(fiscalPeriod.year, year),
      ),
    )
    .orderBy(asc(voucher.postedAt), asc(voucher.createdAt));

  return {
    account: acc,
    openingØre: toNum(openingRow?.opening ?? null),
    entries: rows.map((r) => ({
      voucherId: r.voucherId,
      voucherType: r.voucherType,
      date: r.date ? r.date.slice(0, 10) : null,
      debitØre: øre(r.debit),
      creditØre: øre(r.credit),
    })),
  };
}
