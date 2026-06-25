/**
 * Manual voucher entry (ADR 0034) — the first posting surface, which turns an everyday economic event
 * (income or an expense) into a BALANCED, POSTED voucher so the ledger stops being empty and the
 * honest-number reveal shows real figures. Mirrors `organizations.server.ts`: pure-ish functions that
 * take a tenant-scoped `OrgTx` (the caller opens it via `withUserOrg`, which proves membership and
 * sets the RLS context). Server-only.
 *
 * The chain is the invariant one — **derive (propose) → rules engine (validate) → posted (commit)**:
 *  1. read the org's `mva_status` (the hard invariant: status drives all posting);
 *  2. ensure a `fiscal_period` for the year;
 *  3. derive a balanced voucher with the pure `@saldo/domain` posting functions, at the org's standard
 *     VAT treatment (status-driven — no SAF-T code jargon on the surface);
 *  4. gate it through `runRules` (the line-level VAT rule) — a server-authoritative block, not UX;
 *  5. insert the voucher + its postings POSTED, in the caller's transaction, so the deferred SQL
 *     integrity triggers (balance, posted-completeness) verify the whole entry at COMMIT.
 *
 * Accounts and VAT codes are resolved from the org's own provisioned rows by the designated SAF-T
 * numbers/codes below — source-grounded (verified against the committed lists in
 * `posting-accounts.test.ts`), never hand-built from memory. This is a manual voucher, NOT an issued
 * sales invoice, so no gapless `invoice_counter` is allocated (that belongs to invoice issuance).
 */
import { and, eq, inArray, sql } from 'drizzle-orm';
import {
  deriveStandardExpense,
  deriveStandardIncome,
  runRules,
  vatLineRule,
  øre,
  type AccountNo,
  type VatCode,
} from '@saldo/domain';
import type { OrgTx } from '../auth/middleware.js';
import type { VoucherKind } from '../contracts/voucher.js';
import { asMvaStatus } from '../lib/org-format.js';
import { account, fiscalPeriod, organization, posting, vatCode, voucher } from './schema.js';
import { STANDARD_TAX_CODE_INDEX } from './provisioning.server.js';

/**
 * Designated standard posting accounts per event, by SAF-T account number. These are the bookkeeping
 * plumbing the user never sees (experience §4.2): receivable/payable and the MVA liability legs, plus
 * one default revenue / "other deductible cost" account for this first slice. Verified to exist in the
 * committed kontoplan by `posting-accounts.test.ts`. Choosing the income/expense *category* per entry
 * is a sequenced refinement (`feat-account-chart-curation`).
 */
export const POSTING_ACCOUNTS = {
  income: { receivable: '1500', revenue: '3000', outputVat: '2700' },
  expense: { cost: '7798', inputVat: '2710', payable: '2400' },
} as const;

/** Designated domestic regular-rate SAF-T VAT codes (output for a sale, input for a purchase). */
export const POSTING_VAT_CODES = { output: '3', input: '1' } as const;

/**
 * Designated accounts for posting an ISSUED sales document's AR voucher (feat-invoice-ledger-posting,
 * §8.4). The receivable (Kundefordringer) is debited the document gross; the output VAT is credited to
 * the account for the line's rate — `regular` 25 % → 2700, `reduced-middle` 15 % → 2701, `reduced-raw-
 * fish` → 2702, `reduced-low` 12 % → 2703. Zero-rated / out-of-scope lines charge no VAT, so they need
 * no VAT account. Each line's REVENUE account is the line's own `account_id`, not designated here.
 * Verified against the committed kontoplan by `posting-accounts.test.ts` (source-grounded, not memory).
 */
export const SALES_INVOICE_ACCOUNTS = {
  receivable: '1500',
  outputVatByRate: {
    regular: '2700',
    'reduced-middle': '2701',
    'reduced-raw-fish': '2702',
    'reduced-low': '2703',
  },
} as const;

/** The designated accounts as the branded `AccountNo` shapes the domain derivation expects. */
const INCOME_ACCOUNTS = {
  receivable: POSTING_ACCOUNTS.income.receivable as AccountNo,
  revenue: POSTING_ACCOUNTS.income.revenue as AccountNo,
  outputVat: POSTING_ACCOUNTS.income.outputVat as AccountNo,
};
const EXPENSE_ACCOUNTS = {
  cost: POSTING_ACCOUNTS.expense.cost as AccountNo,
  inputVat: POSTING_ACCOUNTS.expense.inputVat as AccountNo,
  payable: POSTING_ACCOUNTS.expense.payable as AccountNo,
};

export type RecordVoucherResult =
  | { ok: true; voucherId: string }
  | { ok: false; reason: 'vat-not-registered' | 'rule-violation' | 'chart-incomplete' };

interface RecordVoucherInput {
  readonly organizationId: string;
  readonly kind: VoucherKind;
  /** Net amount in øre (excl. MVA when the org is registered). Already integer-validated at the boundary. */
  readonly net: number;
  readonly year: number;
}

/** Find the org's open fiscal period for `year`, creating a Jan–Dec one if it doesn't exist yet. */
export async function ensureFiscalPeriod(
  tx: OrgTx,
  organizationId: string,
  year: number,
): Promise<string> {
  const existing = await tx
    .select({ id: fiscalPeriod.id })
    .from(fiscalPeriod)
    .where(and(eq(fiscalPeriod.organizationId, organizationId), eq(fiscalPeriod.year, year)))
    .limit(1);
  if (existing[0]) return existing[0].id;

  const [created] = await tx
    .insert(fiscalPeriod)
    .values({
      organizationId,
      year,
      startsOn: `${year}-01-01`,
      endsOn: `${year}-12-31`,
    })
    .returning({ id: fiscalPeriod.id });
  return created!.id;
}

/**
 * Record one manual income/expense event as a posted voucher. Returns a typed result: a blocked VAT
 * combination or a rules violation is an expected outcome (surfaced to the user), not a thrown 500.
 */
export async function recordManualVoucher(
  tx: OrgTx,
  input: RecordVoucherInput,
): Promise<RecordVoucherResult> {
  const [org] = await tx
    .select({ mvaStatus: organization.mvaStatus })
    .from(organization)
    .where(eq(organization.id, input.organizationId))
    .limit(1);
  if (!org) return { ok: false, reason: 'chart-incomplete' };
  const status = asMvaStatus(org.mvaStatus);

  const net = øre(input.net); // integer-validated at the boundary; brand it for the domain
  const derived =
    input.kind === 'income'
      ? deriveStandardIncome(net, status, INCOME_ACCOUNTS, POSTING_VAT_CODES.output as VatCode)
      : {
          ok: true as const,
          voucher: deriveStandardExpense(
            net,
            status,
            EXPENSE_ACCOUNTS,
            POSTING_VAT_CODES.input as VatCode,
          ),
        };
  if (!derived.ok) return { ok: false, reason: 'vat-not-registered' };
  const proposed = derived.voucher;

  // The rules gate (ADR 0002): validate the proposed voucher's coded lines against the org status
  // before anything touches the ledger. Server-authoritative — a violation blocks the post.
  const verdict = runRules([vatLineRule({ status, codes: STANDARD_TAX_CODE_INDEX })], proposed);
  if (!verdict.ok) return { ok: false, reason: 'rule-violation' };

  const periodId = await ensureFiscalPeriod(tx, input.organizationId, input.year);

  // Resolve the proposed lines' account NUMBERS and VAT CODES to this org's row ids.
  const accountNumbers = [...new Set(proposed.lines.map((l) => l.account as string))];
  const accountRows = await tx
    .select({ id: account.id, number: account.number })
    .from(account)
    .where(inArray(account.number, accountNumbers));
  const accountIdByNumber = new Map(accountRows.map((a) => [a.number, a.id]));
  if (accountIdByNumber.size !== accountNumbers.length) {
    return { ok: false, reason: 'chart-incomplete' };
  }

  const codes = [
    ...new Set(proposed.lines.flatMap((l) => (l.vatCode ? [l.vatCode as string] : []))),
  ];
  const vatRows = codes.length
    ? await tx
        .select({ id: vatCode.id, code: vatCode.code })
        .from(vatCode)
        .where(inArray(vatCode.code, codes))
    : [];
  const vatCodeIdByCode = new Map(vatRows.map((c) => [c.code, c.id]));
  if (vatCodeIdByCode.size !== codes.length) return { ok: false, reason: 'chart-incomplete' };

  // Insert the voucher POSTED + its postings in the caller's transaction; the deferred balance and
  // posted-completeness triggers (≥2 postings, Σ debit = Σ credit) verify the entry at COMMIT.
  const [created] = await tx
    .insert(voucher)
    .values({
      organizationId: input.organizationId,
      type: input.kind === 'income' ? 'sales' : 'purchase',
      periodId,
      postedAt: sql`now()`,
    })
    .returning({ id: voucher.id });
  const voucherId = created!.id;

  await tx.insert(posting).values(
    proposed.lines.map((leg) => ({
      organizationId: input.organizationId,
      voucherId,
      accountId: accountIdByNumber.get(leg.account as string)!,
      vatCodeId: leg.vatCode ? vatCodeIdByCode.get(leg.vatCode as string)! : null,
      debitOre: leg.debit,
      creditOre: leg.credit,
    })),
  );

  return { ok: true, voucherId };
}
