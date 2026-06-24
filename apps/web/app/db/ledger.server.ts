/**
 * Ledger-aggregation query for the honest-number reveal (experience-principles §6). Sums one fiscal
 * year's posted activity into the four totals the pure `@saldo/domain` bridge composes
 * (`honestNumberFromLedger`). Read through `withUserOrg` (membership proven) + RLS, exactly like
 * `readOrgOverview` — the unfiltered reads return only the current tenant's rows because every table
 * here is FORCE-RLS scoped to `app.current_org`. Server-only.
 *
 * The economic role of a posting is its account's *kontoklasse* (`account.type`), source-grounded in
 * the committed kontoplan, NOT a hardcoded account number:
 *  - revenue (klasse 3) and expense (klasse 4–7) lines give net revenue / net cost;
 *  - the VAT amount sits on its own liability account (klasse 2), split output vs input by the SAF-T
 *    `vat_code.direction`. We must restrict the VAT sums to those liability legs: a sales line's
 *    revenue posting ALSO carries the line's output SAF-T code (`posting/derive.ts`), so keying VAT off
 *    `direction` alone would double-count the net revenue.
 * Only POSTED vouchers count (drafts are excluded); reverse-charge contributes both legs symmetrically
 * once that derivation lands (`.claude/rules/vat.md`).
 */
import { and, eq, isNotNull, sql } from 'drizzle-orm';
import { type LedgerTotals, type Øre, øre } from '@saldo/domain';
import type { OrgTx } from '../auth/middleware.js';
import { account, fiscalPeriod, posting, vatCode, voucher } from './schema.js';

/** SUM(bigint) returns numeric; postgres.js hands it back as a string. Parse to branded øre. */
function toØre(value: string | null): Øre {
  return øre(Number(value ?? 0));
}

/**
 * Aggregate the current tenant's posted ledger for `year` into the honest-number totals. Returns all
 * zeros when there's no posted activity (the "you're caught up" state) — `COALESCE` keeps the sums at 0
 * rather than null on an empty ledger.
 */
export async function aggregateLedger(tx: OrgTx, year: number): Promise<LedgerTotals> {
  const [row] = await tx
    .select({
      revenueNet: sql<string>`coalesce(sum(${posting.creditOre} - ${posting.debitOre}) filter (where ${account.type} = 'revenue'), 0)::bigint`,
      expenseNet: sql<string>`coalesce(sum(${posting.debitOre} - ${posting.creditOre}) filter (where ${account.type} = 'expense'), 0)::bigint`,
      outputVatCollected: sql<string>`coalesce(sum(${posting.creditOre} - ${posting.debitOre}) filter (where ${account.type} = 'equity_liability' and ${vatCode.direction} = 'output'), 0)::bigint`,
      deductibleInputVat: sql<string>`coalesce(sum(${posting.debitOre} - ${posting.creditOre}) filter (where ${account.type} = 'equity_liability' and ${vatCode.direction} = 'input'), 0)::bigint`,
    })
    .from(posting)
    .innerJoin(voucher, eq(voucher.id, posting.voucherId))
    .innerJoin(fiscalPeriod, eq(fiscalPeriod.id, voucher.periodId))
    .innerJoin(account, eq(account.id, posting.accountId))
    .leftJoin(vatCode, eq(vatCode.id, posting.vatCodeId))
    .where(and(isNotNull(voucher.postedAt), eq(fiscalPeriod.year, year)));

  return {
    revenueNet: toØre(row?.revenueNet ?? null),
    expenseNet: toØre(row?.expenseNet ?? null),
    outputVatCollected: toØre(row?.outputVatCollected ?? null),
    deductibleInputVat: toØre(row?.deductibleInputVat ?? null),
  };
}
