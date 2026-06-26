/**
 * MVA-melding aggregation query (feat-mva-melding, build-spec §8.8). Sums one fiscal year's posted
 * ledger PER SAF-T VAT code into the per-code aggregates the pure `@saldo/domain` generator composes
 * (`generateMvaMelding`). Read through `withUserOrg` (membership proven) + RLS, exactly like
 * `aggregateLedger` — the unfiltered read returns only the current tenant's rows because every table
 * here is FORCE-RLS scoped to `app.current_org`. The melding only READS the ledger; it books nothing.
 * Server-only.
 *
 * The economic role of a posting is its account's *kontoklasse* (`account.type`), source-grounded in
 * the committed kontoplan, NOT a hardcoded account number:
 *  - `grunnlag` (basis) = the net on the revenue (klasse 3, credit−debit) and cost (klasse 4–7,
 *    debit−credit) lines carrying the code — the natural-positive turnover/basis;
 *  - `merverdiavgift` = the signed VAT on the code's klasse-2 (`equity_liability`) legs (output
 *    credited → +, deductible input debited → −).
 * Only POSTED vouchers count (drafts excluded). The annual term aggregates the whole fiscal year (the
 * ledger's period is year-level); bimonthly terms await a per-voucher document date.
 */
import { and, eq, isNotNull, sql } from 'drizzle-orm';
import { type VatCodeAggregate, øre } from '@saldo/domain';
import type { VatCode } from '@saldo/domain';
import type { OrgTx } from '../auth/middleware.js';
import { account, fiscalPeriod, posting, vatCode, voucher } from './schema.js';

/** SUM(bigint) returns numeric; postgres.js hands it back as a string. */
const toNum = (value: string | null): number => Number(value ?? 0);

/**
 * Aggregate the current tenant's posted ledger for `year` into one {@link VatCodeAggregate} per SAF-T
 * VAT code (only codes that appear on a posted, coded line). Returns `[]` for an empty ledger.
 */
export async function aggregateVatByCode(tx: OrgTx, year: number): Promise<VatCodeAggregate[]> {
  const rows = await tx
    .select({
      code: vatCode.code,
      grunnlag: sql<string>`coalesce(sum(
        case
          when ${account.type} = 'revenue' then ${posting.creditOre} - ${posting.debitOre}
          when ${account.type} = 'expense' then ${posting.debitOre} - ${posting.creditOre}
          else 0
        end
      ), 0)::bigint`,
      merverdiavgift: sql<string>`coalesce(sum(
        case when ${account.type} = 'equity_liability' then ${posting.creditOre} - ${posting.debitOre} else 0 end
      ), 0)::bigint`,
    })
    .from(posting)
    .innerJoin(voucher, eq(voucher.id, posting.voucherId))
    .innerJoin(fiscalPeriod, eq(fiscalPeriod.id, voucher.periodId))
    .innerJoin(account, eq(account.id, posting.accountId))
    .innerJoin(vatCode, eq(vatCode.id, posting.vatCodeId))
    .where(and(isNotNull(voucher.postedAt), eq(fiscalPeriod.year, year)))
    .groupBy(vatCode.code);

  return rows.map((r) => ({
    code: r.code as VatCode,
    grunnlagØre: øre(toNum(r.grunnlag)),
    merverdiavgiftØre: øre(toNum(r.merverdiavgift)),
  }));
}
