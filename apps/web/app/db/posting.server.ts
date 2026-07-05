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
  deductsInputVat,
  deriveDrawing,
  deriveOwnerOutlay,
  deriveReverseChargePurchase,
  deriveStandardExpense,
  deriveStandardIncome,
  rate,
  rateForCategory,
  reverseChargeInputDeductible,
  reverseChargeKind,
  runRules,
  vatLineRule,
  øre,
  type AccountNo,
  type VatCode,
  type Voucher,
  type VoucherType,
} from '@saldo/domain';
import type { OrgTx } from '../auth/middleware.js';
import type { OwnerEventKind } from '../contracts/owner-event.js';
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
 * Designated accounts for posting a bank-payment SETTLEMENT at reconciliation (feat-reconciliation,
 * §8.7). An incoming customer payment debits the bank asset and credits the receivable (1500, reused
 * from the sales-invoice AR posting so the payment clears the same account the invoice raised); the
 * outgoing case is the inverse against the payable. `bank` is 1920 (Bankinnskudd) — source-grounded in
 * the committed kontoplan and verified by `posting-accounts.test.ts`.
 */
export const SETTLEMENT_ACCOUNTS = { bank: '1920', receivable: '1500', payable: '2400' } as const;

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

/**
 * Designated accounts for posting a reverse-charge (snudd avregning) PURCHASE's dual leg
 * (vat-reverse-charge, build-spec §4.3). The buyer self-accounts VAT, so each kind of reverse charge
 * books to its own pair of VAT accounts, by rate — source-grounded in the committed kontoplan
 * (`db/reference/saf-t` accounts 2704–2709 output / 2714–2718 input) and verified by
 * `posting-accounts.test.ts`. The kind is derived from the SAF-T code (`reverseChargeKind`); the rate
 * category from the code's `rateCategory`. The cost (here a generic deductible-cost account) and the
 * supplier payable reuse the manual-expense designations. A zero-rate code (e.g. 85) has no VAT legs.
 */
export const REVERSE_CHARGE_ACCOUNTS = {
  'foreign-services': {
    output: { regular: '2704', 'reduced-low': '2709' },
    input: { regular: '2714', 'reduced-low': '2718' },
  },
  'import-goods': {
    output: { regular: '2705', 'reduced-middle': '2706' },
    input: { regular: '2715', 'reduced-middle': '2716' },
  },
  domestic: {
    output: { regular: '2707' },
    input: { regular: '2717' },
  },
} as const;

/**
 * Designated rate-matched ordinary OUTPUT codes for the self-account leg (so the MVA basis counts it
 * as output). `reduced-middle`/`reduced-raw-fish` are defensive completeness — no committed
 * reverse-charge code carries those rates today, so they are not exercised by the current list.
 */
export const REVERSE_CHARGE_OUTPUT_CODES = {
  regular: '3',
  'reduced-middle': '31',
  'reduced-low': '33',
  'reduced-raw-fish': '32',
} as const;

/**
 * Designated accounts for posting a SUPPLIER INVOICE's AP voucher (feat-supplier-invoices, §8.5). The
 * supplier payable (Leverandørgjeld 2400) is credited the document gross; deductible input VAT is
 * debited to 2710 (Inngående mva — purchases book all rates to the one input account; the rate lives
 * on the VAT code, not the account). Each line's COST account is the line's own `account_id`. The
 * reverse-charge VAT accounts come from `REVERSE_CHARGE_ACCOUNTS`. Source-grounded in the committed
 * kontoplan and verified by `posting-accounts.test.ts`.
 */
export const SUPPLIER_INVOICE_ACCOUNTS = { payable: '2400', inputVat: '2710' } as const;

/**
 * Designated accounts for the owner-economy events of a sole proprietorship (feat-supplier-invoices,
 * §8.5) — equity movements, NOT payroll. A drawing (privatuttak) debits 2060 (Uttak kontanter) and
 * credits the bank 1920; an outlay (utlegg) and a tax-free travel allowance credit the owner's equity
 * contribution 2062 (Innskudd kontanter) against a cost account: outlay → 7798 (annen kostnad, the
 * manual-expense default), kjøregodtgjørelse → 7100 (Bilgodtgjørelse, opplysningspliktig), diett →
 * 7160 (Diettkostnad, ikke opplysningspliktig). Source-grounded in the committed kontoplan and verified
 * by `posting-accounts.test.ts`.
 */
export const OWNER_ACCOUNTS = {
  drawings: '2060',
  equity: '2062',
  bank: '1920',
  inputVat: '2710',
  cost: { outlay: '7798', mileage: '7100', diett: '7160' },
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
  return insertPostedVoucher(
    tx,
    input.organizationId,
    input.kind === 'income' ? 'sales' : 'purchase',
    periodId,
    proposed,
  );
}

/**
 * Resolve a derived voucher's account NUMBERS and VAT CODES to this org's provisioned row ids and
 * insert it POSTED (voucher + postings) in the caller's transaction — so the deferred balance and
 * posted-completeness triggers (≥2 postings, Σ debit = Σ credit) verify the entry at COMMIT. Returns
 * `chart-incomplete` when a designated account/code is missing from the org's kontoplan; the leg
 * layout itself is never assembled here — it comes from the pure `@saldo/domain` derivation.
 */
export async function insertPostedVoucher(
  tx: OrgTx,
  organizationId: string,
  type: VoucherType,
  periodId: string,
  proposed: Voucher,
): Promise<{ ok: true; voucherId: string } | { ok: false; reason: 'chart-incomplete' }> {
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

  const [created] = await tx
    .insert(voucher)
    .values({ organizationId, type, periodId, postedAt: sql`now()` })
    .returning({ id: voucher.id });
  const voucherId = created!.id;

  await tx.insert(posting).values(
    proposed.lines.map((leg) => ({
      organizationId,
      voucherId,
      accountId: accountIdByNumber.get(leg.account as string)!,
      vatCodeId: leg.vatCode ? vatCodeIdByCode.get(leg.vatCode as string)! : null,
      debitOre: leg.debit,
      creditOre: leg.credit,
    })),
  );

  return { ok: true, voucherId };
}

export type RecordReverseChargeResult =
  | { ok: true; voucherId: string }
  | {
      ok: false;
      reason: 'not-reverse-charge' | 'unsupported-rate' | 'rule-violation' | 'chart-incomplete';
    };

interface RecordReverseChargeInput {
  readonly organizationId: string;
  /** A reverse-charge SAF-T purchase code (e.g. 86 foreign service / 81 import goods / 91 gold). */
  readonly vatCode: string;
  /** Net amount in øre (the supplier's invoice — there is no VAT on a reverse-charge purchase). */
  readonly net: number;
  readonly year: number;
  /**
   * Business override for the non-deductible-even-when-registered cases (representasjon, restricted
   * vehicle costs, the private-use portion). Defaults to the SAF-T classification
   * (`reverseChargeInputDeductible`); pass `false` to force the self-accounted VAT into cost.
   */
  readonly deductible?: boolean;
}

/**
 * Record a reverse-charge (snudd avregning) PURCHASE as a posted dual-leg voucher — the buyer
 * self-accounts VAT (output + input legs), so both land on the MVA-melding even though net cash is
 * just the supplier's net (vat-reverse-charge, build-spec §4.3). The leg layout is the pure
 * `deriveReverseChargePurchase`; deductibility and the VAT accounts are decided from the committed
 * SAF-T classification (`reverseChargeKind` / `reverseChargeInputDeductible`), never from memory. The
 * same derive → rules → posted chain as the manual path; a blocked combination is a typed result.
 */
export async function recordReverseChargePurchase(
  tx: OrgTx,
  input: RecordReverseChargeInput,
): Promise<RecordReverseChargeResult> {
  const [org] = await tx
    .select({ mvaStatus: organization.mvaStatus })
    .from(organization)
    .where(eq(organization.id, input.organizationId))
    .limit(1);
  if (!org) return { ok: false, reason: 'chart-incomplete' };
  const status = asMvaStatus(org.mvaStatus);

  const saft = STANDARD_TAX_CODE_INDEX.get(input.vatCode as VatCode);
  // Only a buyer-self-account purchase code belongs here — the domestic RC SALE (51, direction
  // 'output') posts as an ordinary net sale through the invoice path, not this dual leg.
  if (!saft || !saft.reverseCharge || saft.direction === 'output') {
    return { ok: false, reason: 'not-reverse-charge' };
  }

  const kind = reverseChargeKind(saft);
  const rateCat = saft.rateCategory;
  const hasVat = rateCat !== 'zero' && rateCat !== 'none';
  const deductible = reverseChargeInputDeductible(saft) && input.deductible !== false;

  const kindAccounts = REVERSE_CHARGE_ACCOUNTS[kind];
  const outputByRate = kindAccounts.output as Record<string, string | undefined>;
  const inputByRate = kindAccounts.input as Record<string, string | undefined>;
  const outputNo = outputByRate[rateCat];
  const inputNo = inputByRate[rateCat];
  const outputCode = (REVERSE_CHARGE_OUTPUT_CODES as Record<string, string | undefined>)[rateCat];
  // A VAT-bearing reverse charge must have designated accounts + an output code for its kind/rate.
  if (hasVat && (!outputNo || !inputNo || !outputCode)) {
    return { ok: false, reason: 'unsupported-rate' };
  }

  const proposed = deriveReverseChargePurchase({
    net: øre(input.net),
    vatRate: rateForCategory(rateCat),
    status,
    deductible,
    accounts: {
      cost: POSTING_ACCOUNTS.expense.cost as AccountNo,
      payable: POSTING_ACCOUNTS.expense.payable as AccountNo,
      // Placeholders for a zero-rate code (no VAT legs are emitted, so they never post).
      outputVat: (outputNo ?? POSTING_ACCOUNTS.expense.cost) as AccountNo,
      inputVat: (inputNo ?? POSTING_ACCOUNTS.expense.cost) as AccountNo,
    },
    ...(outputCode ? { outputVatCode: outputCode as VatCode } : {}),
    inputVatCode: input.vatCode as VatCode,
  });

  // The rules gate (ADR 0002): validate the proposed voucher's coded lines before it touches the ledger.
  const verdict = runRules([vatLineRule({ status, codes: STANDARD_TAX_CODE_INDEX })], proposed);
  if (!verdict.ok) return { ok: false, reason: 'rule-violation' };

  const periodId = await ensureFiscalPeriod(tx, input.organizationId, input.year);
  return insertPostedVoucher(tx, input.organizationId, 'purchase', periodId, proposed);
}

export type RecordOwnerEventResult =
  { ok: true; voucherId: string } | { ok: false; reason: 'rule-violation' | 'chart-incomplete' };

interface RecordOwnerEventInput {
  readonly organizationId: string;
  readonly kind: OwnerEventKind;
  /** Net amount in øre (excl. MVA when registered, for an outlay). Integer-validated at the boundary. */
  readonly net: number;
  readonly year: number;
}

/**
 * Record one owner-economy event (drawing / outlay / mileage / diett) as a posted voucher — the
 * sole-proprietor equity movements that post through the ledger, NOT payroll (build-spec §8.5). The leg
 * layout is the pure `deriveDrawing` / `deriveOwnerOutlay`; an outlay applies the org's STANDARD
 * input-VAT fork (status-driven, like the manual expense), while mileage/diett carry no VAT. Same
 * derive → rules → posted chain as the manual path; a blocked combination is a typed result.
 */
export async function recordOwnerEvent(
  tx: OrgTx,
  input: RecordOwnerEventInput,
): Promise<RecordOwnerEventResult> {
  const [org] = await tx
    .select({ mvaStatus: organization.mvaStatus })
    .from(organization)
    .where(eq(organization.id, input.organizationId))
    .limit(1);
  if (!org) return { ok: false, reason: 'chart-incomplete' };
  const status = asMvaStatus(org.mvaStatus);
  const net = øre(input.net);

  let proposed: Voucher;
  if (input.kind === 'drawing') {
    proposed = deriveDrawing(net, {
      drawings: OWNER_ACCOUNTS.drawings as AccountNo,
      asset: OWNER_ACCOUNTS.bank as AccountNo,
    });
  } else {
    // outlay applies the standard input-VAT fork (25 % when registered, else gross); mileage/diett have
    // no VAT (rate 0). The cost account is the event's designated kontoplan line; the contra is owner
    // equity (Innskudd kontanter). The MVA-status fork lives in derivePurchase via deriveOwnerOutlay.
    const registered = deductsInputVat(status);
    const isOutlay = input.kind === 'outlay';
    const vatRate = isOutlay && registered ? rateForCategory('regular') : rate(0);
    proposed = deriveOwnerOutlay({
      net,
      vatRate,
      status,
      accounts: {
        cost: OWNER_ACCOUNTS.cost[input.kind] as AccountNo,
        inputVat: OWNER_ACCOUNTS.inputVat as AccountNo,
        equity: OWNER_ACCOUNTS.equity as AccountNo,
      },
      ...(isOutlay && registered ? { vatCode: POSTING_VAT_CODES.input as VatCode } : {}),
    });
  }

  // The rules gate (ADR 0002): validate any coded lines before the post (a drawing has none → passes).
  const verdict = runRules([vatLineRule({ status, codes: STANDARD_TAX_CODE_INDEX })], proposed);
  if (!verdict.ok) return { ok: false, reason: 'rule-violation' };

  const periodId = await ensureFiscalPeriod(tx, input.organizationId, input.year);
  return insertPostedVoucher(tx, input.organizationId, proposed.type, periodId, proposed);
}
