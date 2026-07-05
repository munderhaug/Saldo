/**
 * Year-end close persistence (feat-year-end-close, ADR 0064). One call closes an org's fiscal year:
 * the pure `deriveYearEndClose` empties every result-side account into equity (2050 — the same plug
 * account as the opening balance, ADR 0061), the voucher posts through the ORDINARY rules→post
 * chain (type `year_end`), and the fiscal period is LOCKED in the same tenant transaction — after
 * commit, the period-lock triggers (ADR 0018) refuse any further posting into the closed year.
 *
 * Closing is a §5.5 consequential act: the caller gates it behind an explicit confirm and records
 * the `voucher.posted` audit attribution (ADR 0062) in the same transaction. A close is not
 * reversible in place — like everything on the ledger, a wrong close is corrected forward (the
 * period would need an explicit reopen surface, deliberately not built). Server-only.
 */
import { and, eq, isNotNull, sql } from 'drizzle-orm';
import { deriveYearEndClose, runRules, vatLineRule, type AccountNo } from '@saldo/domain';
import type { OrgTx } from '../auth/middleware.js';
import { asMvaStatus } from '../lib/org-format.js';
import { fiscalPeriod, organization, voucher } from './schema.js';
import { ensureFiscalPeriod, insertPostedVoucher, OPENING_ACCOUNTS } from './posting.server.js';
import { aggregateAccountBalances } from './reporting.server.js';
import { STANDARD_TAX_CODE_INDEX } from './provisioning.server.js';

export type CloseYearResult =
  | { readonly ok: true; readonly voucherId: string }
  | {
      readonly ok: false;
      readonly reason:
        'already-closed' | 'nothing-to-close' | 'rule-violation' | 'chart-incomplete';
    };

/** Whether the org's `year` is closed (its period is locked). */
export async function isYearClosed(tx: OrgTx, year: number): Promise<boolean> {
  const [row] = await tx
    .select({ id: fiscalPeriod.id })
    .from(fiscalPeriod)
    .where(and(eq(fiscalPeriod.year, year), isNotNull(fiscalPeriod.lockedAt)))
    .limit(1);
  return row !== undefined;
}

/**
 * Close `year`: derive the carry-forward voucher from the year's activity, post it, lock the
 * period — one transaction. `already-closed` when the period is locked or a `year_end` voucher
 * exists; `nothing-to-close` when no result-side account carried activity.
 */
export async function closeYear(
  tx: OrgTx,
  organizationId: string,
  year: number,
): Promise<CloseYearResult> {
  // Serialize concurrent closes of the same org+year (the mva_filing precedent): a double-click's
  // second transaction blocks here until the first commits, then reads the lock and answers
  // `already-closed` — two closing vouchers can never both post (vat-review 2026-07-05 #2).
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${`year-end:${organizationId}:${String(year)}`}, 0))`,
  );
  if (await isYearClosed(tx, year)) return { ok: false, reason: 'already-closed' };
  const [existing] = await tx
    .select({ id: voucher.id })
    .from(voucher)
    .innerJoin(fiscalPeriod, eq(fiscalPeriod.id, voucher.periodId))
    .where(
      and(eq(voucher.type, 'year_end'), isNotNull(voucher.postedAt), eq(fiscalPeriod.year, year)),
    )
    .limit(1);
  if (existing) return { ok: false, reason: 'already-closed' };

  const balances = await aggregateAccountBalances(tx, year, { excludeYearEnd: true });
  const derived = deriveYearEndClose(balances, OPENING_ACCOUNTS.equity as AccountNo);
  if (!derived.ok) return { ok: false, reason: derived.reason };

  // The rules gate (ADR 0002), kept for chain uniformity — closing lines carry no VAT code.
  const [org] = await tx
    .select({ mvaStatus: organization.mvaStatus })
    .from(organization)
    .where(eq(organization.id, organizationId))
    .limit(1);
  if (!org) return { ok: false, reason: 'chart-incomplete' };
  const verdict = runRules(
    [vatLineRule({ status: asMvaStatus(org.mvaStatus), codes: STANDARD_TAX_CODE_INDEX })],
    derived.voucher,
  );
  if (!verdict.ok) return { ok: false, reason: 'rule-violation' };

  const periodId = await ensureFiscalPeriod(tx, organizationId, year);
  const posted = await insertPostedVoucher(
    tx,
    organizationId,
    derived.voucher.type,
    periodId,
    derived.voucher,
  );
  if (!posted.ok) return posted;

  // Lock the year — the voucher above is already in, so the period-lock triggers only bite AFTER
  // this transaction commits. From then on the closed year is immutable like the ledger itself.
  // The guarded UPDATE must hit exactly the still-unlocked row; anything else aborts the whole tx.
  const locked = await tx
    .update(fiscalPeriod)
    .set({ lockedAt: sql`now()` })
    .where(and(eq(fiscalPeriod.id, periodId), sql`${fiscalPeriod.lockedAt} IS NULL`))
    .returning({ id: fiscalPeriod.id });
  if (locked.length !== 1) throw new Error('year-end close: period lock did not apply');

  return { ok: true, voucherId: posted.voucherId };
}
