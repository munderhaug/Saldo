/**
 * SAF-T **Financial** export model — PURE. Composes the posted ledger (already aggregated by the query
 * layer into account masters, per-voucher transactions, and the parties register) into the Norwegian
 * SAF-T Financial document model the serializer (`./financial-xml.ts`) renders to XSD-valid XML.
 *
 * Read-only over the ledger — it books nothing. Every figure traces to a posting:
 *  - an account master's closing balance = Σdebit−Σcredit on its postings through the export year;
 *  - a journal line's amount = the posting's debit/credit (the natural ledger figure);
 *  - the document `TotalDebit`/`TotalCredit` = Σ of all line debits/credits — equal because every
 *    voucher balances (the hard ledger invariant), which is the tie-out the export asserts.
 *
 * Money stays integer **øre** here; rounding to the schema's 2-decimal monetary form happens only at
 * the XML boundary. Account numbers, VAT codes and rates come from the committed SAF-T reference lists
 * (`db/reference/saf-t/`) passed in as indices — never memorised (hard invariant §4.3).
 */
import { type Øre, ZERO, negØre, sumØre, eqØre } from '../money/ore.js';
import type { AccountNo, VatCode } from '../posting/types.js';
import type { OrgNr } from '../ids/org-nr.js';
import type { AccountType } from './accounts.js';
import type { SaftStandardAccount } from './accounts.js';
import type { SaftTaxCode } from './tax-codes.js';
import { satsForCategory } from './rates.js';

/** Debit / credit — the side a ledger amount or balance sits on. */
export type SaftEntrySide = 'debit' | 'credit';

// ───────────────────────── Inputs (produced by the query layer) ─────────────────────────

/** One chart-of-accounts row with its period-boundary balances (signed net = Σdebit−Σcredit). */
export interface SaftAccountInput {
  readonly number: AccountNo;
  readonly name: string;
  /** Net of postings BEFORE the export year (prior-year cumulative; 0 for a fresh ledger). */
  readonly openingØre: Øre;
  /** Net of postings THROUGH the export year end. */
  readonly closingØre: Øre;
}

/** A customer or supplier — personal/financial data, kept minimal (anti-lock-in SAF-T register). */
export interface SaftPartyInput {
  readonly id: string;
  readonly name: string;
  readonly orgNr?: OrgNr;
  readonly addressLine?: string;
  readonly postalCode?: string;
  readonly city?: string;
  /** ISO 3166-1 alpha-2; the ledger defaults to `NO`. */
  readonly countryCode: string;
}

/** One posting line of a posted voucher. `amountØre` is the natural-positive debit OR credit. */
export interface SaftLineInput {
  readonly accountNumber: AccountNo;
  /** The account's kontoklasse (`account.type`) — decides which leg carries TaxInformation. */
  readonly accountType: AccountType;
  readonly side: SaftEntrySide;
  readonly amountØre: Øre;
  readonly description: string;
  /** Present when the line carries a SAF-T VAT code (both the basis leg and the MVA-account leg do). */
  readonly vatCode?: VatCode;
  /** Customer/supplier subledger reference, when the line is an AR/AP control-account leg. */
  readonly customerId?: string;
  readonly supplierId?: string;
}

/** One posted voucher = one SAF-T Transaction. `date` is the posting date `YYYY-MM-DD`. */
export interface SaftTransactionInput {
  readonly voucherId: string;
  readonly voucherType: string;
  readonly date: string;
  readonly lines: readonly SaftLineInput[];
}

/** Everything the query layer reads for the export year (read-only over the posted ledger). */
export interface SaftFinancialInput {
  readonly accounts: readonly SaftAccountInput[];
  readonly customers: readonly SaftPartyInput[];
  readonly suppliers: readonly SaftPartyInput[];
  readonly transactions: readonly SaftTransactionInput[];
}

/** Constant metadata the ledger can't supply — the filing org and the fiscal year. */
export interface SaftCompanyMeta {
  readonly orgNr: OrgNr;
  readonly name: string;
  readonly year: number;
}

// ───────────────────────── Output model (the document) ─────────────────────────

/** A signed balance resolved onto a SAF-T debit/credit side; `amountØre` is always ≥ 0. */
export interface SaftBalance {
  readonly side: SaftEntrySide;
  readonly amountØre: Øre;
}

export interface SaftAccountMaster {
  readonly id: AccountNo;
  readonly description: string;
  /** SAF-T StandardAccountID when the account number is a standard-kontoplan id; else omitted. */
  readonly standardId?: AccountNo;
  readonly opening: SaftBalance;
  readonly closing: SaftBalance;
}

export interface SaftTaxCodeMaster {
  readonly code: VatCode;
  readonly description: string;
  readonly standardCode: VatCode;
  /** Percentage as a dot-decimal string (`25`, `12`, `11.11`, `0`) for the schema's xs:decimal. */
  readonly percent: string;
}

export interface SaftEntryTax {
  readonly code: VatCode;
  readonly percent: string;
  readonly amountØre: Øre;
}

export interface SaftEntryLine {
  readonly recordId: string;
  readonly accountId: AccountNo;
  readonly description: string;
  readonly side: SaftEntrySide;
  readonly amountØre: Øre;
  readonly customerId?: string;
  readonly supplierId?: string;
  readonly tax?: SaftEntryTax;
}

export interface SaftTransaction {
  readonly id: string;
  /** Calendar month 1–12 (SAF-T `Period`). */
  readonly period: number;
  readonly periodYear: number;
  readonly date: string;
  readonly description: string;
  readonly lines: readonly SaftEntryLine[];
}

export interface SaftJournal {
  readonly id: string;
  readonly description: string;
  readonly type: string;
  readonly transactions: readonly SaftTransaction[];
}

export interface SaftFinancial {
  readonly company: SaftCompanyMeta;
  readonly accounts: readonly SaftAccountMaster[];
  readonly customers: readonly SaftPartyInput[];
  readonly suppliers: readonly SaftPartyInput[];
  readonly taxCodes: readonly SaftTaxCodeMaster[];
  readonly journals: readonly SaftJournal[];
  readonly numberOfEntries: number;
  readonly totalDebitØre: Øre;
  readonly totalCreditØre: Øre;
}

/** Human description per voucher type (Norwegian), for the Journal + Transaction descriptions. */
const VOUCHER_TYPE_DESCRIPTION: Record<string, string> = {
  sales: 'Salg',
  purchase: 'Kjøp',
  manual: 'Manuelt bilag',
  bank: 'Bank',
  reversal: 'Reversering',
};

function describeVoucherType(type: string): string {
  return VOUCHER_TYPE_DESCRIPTION[type] ?? type;
}

/** Resolve a signed net (Σdebit−Σcredit) onto a SAF-T balance: ≥0 → debit, <0 → credit (abs). */
function balanceOf(net: Øre): SaftBalance {
  return net < ZERO
    ? { side: 'credit', amountØre: negØre(net) }
    : { side: 'debit', amountØre: net };
}

/**
 * Percentage for a code's rate category as a dot-decimal string for the schema's xs:decimal — the
 * committed `sats` value (`25`, `12`, `11,11`, `0`) with the Norwegian comma swapped for a dot. Reuses
 * the grounded mapping in `rates.ts`; the percentage is never memorised here.
 */
function percentString(code: SaftTaxCode): string {
  return satsForCategory(code.rateCategory).replace(',', '.');
}

/**
 * Build the SAF-T Financial document model. Accounts and parties map straight through; transactions
 * are grouped into one Journal per voucher type and their lines carry TaxInformation only on the
 * MVA-account leg (klasse 2 `equity_liability` with a code) so each `TaxAmount` is the VAT actually
 * posted and the amounts tie out. Throws on a VAT code absent from the committed index — a data
 * integrity error surfaced loudly, never silently mismapped (mirrors `generateMvaMelding`).
 */
export function generateSaftFinancial(
  input: SaftFinancialInput,
  meta: SaftCompanyMeta,
  accountIndex: ReadonlyMap<AccountNo, SaftStandardAccount>,
  codeIndex: ReadonlyMap<VatCode, SaftTaxCode>,
): SaftFinancial {
  const accounts: SaftAccountMaster[] = input.accounts.map((a) => ({
    id: a.number,
    description: a.name,
    ...(accountIndex.has(a.number) ? { standardId: a.number } : {}),
    opening: balanceOf(a.openingØre),
    closing: balanceOf(a.closingØre),
  }));

  // Group the posted vouchers into journals by type, preserving first-seen order for determinism.
  const usedCodes = new Set<VatCode>();
  const journalsByType = new Map<string, SaftTransaction[]>();
  for (const t of [...input.transactions].sort(byDateThenId)) {
    const lines: SaftEntryLine[] = t.lines.map((l, i) => {
      const isVatLeg = l.accountType === 'equity_liability' && l.vatCode !== undefined;
      let tax: SaftEntryTax | undefined;
      if (isVatLeg && l.vatCode !== undefined) {
        const saft = codeIndex.get(l.vatCode);
        if (!saft) throw new Error(`SAF-T export: unknown VAT code "${l.vatCode}"`);
        usedCodes.add(l.vatCode);
        tax = { code: l.vatCode, percent: percentString(saft), amountØre: l.amountØre };
      }
      return {
        recordId: String(i + 1),
        accountId: l.accountNumber,
        description: l.description,
        side: l.side,
        amountØre: l.amountØre,
        ...(l.customerId !== undefined ? { customerId: l.customerId } : {}),
        ...(l.supplierId !== undefined ? { supplierId: l.supplierId } : {}),
        ...(tax !== undefined ? { tax } : {}),
      };
    });
    // Period AND PeriodYear both come from the transaction's own date (never the export-year header),
    // so the pair can't disagree. The export is a single fiscal year (meta.year): a transaction dated
    // outside it is a data-integrity error — surface it loudly rather than mislabel its period.
    const txYear = yearOf(t.date);
    if (txYear !== meta.year) {
      throw new Error(
        `SAF-T export: transaction ${t.voucherId} dated ${t.date} is outside the export year ${meta.year}`,
      );
    }
    const transaction: SaftTransaction = {
      id: t.voucherId,
      period: monthOf(t.date),
      periodYear: txYear,
      date: t.date,
      description: describeVoucherType(t.voucherType),
      lines,
    };
    const bucket = journalsByType.get(t.voucherType);
    if (bucket) bucket.push(transaction);
    else journalsByType.set(t.voucherType, [transaction]);
  }

  const journals: SaftJournal[] = [...journalsByType.entries()].map(([type, transactions]) => ({
    id: type,
    description: describeVoucherType(type),
    type,
    transactions,
  }));

  const taxCodes: SaftTaxCodeMaster[] = [...usedCodes]
    .map((code) => {
      const saft = codeIndex.get(code);
      if (!saft) throw new Error(`SAF-T export: unknown VAT code "${code}"`);
      return {
        code,
        description: saft.descriptionNo,
        standardCode: code,
        percent: percentString(saft),
      };
    })
    .sort((a, b) => Number(a.code) - Number(b.code));

  const allLines = journals.flatMap((j) => j.transactions.flatMap((t) => t.lines));
  const totalDebitØre = sumØre(allLines.filter((l) => l.side === 'debit').map((l) => l.amountØre));
  const totalCreditØre = sumØre(
    allLines.filter((l) => l.side === 'credit').map((l) => l.amountØre),
  );

  return {
    company: meta,
    accounts,
    customers: input.customers,
    suppliers: input.suppliers,
    taxCodes,
    journals,
    numberOfEntries: input.transactions.length,
    totalDebitØre,
    totalCreditØre,
  };
}

function byDateThenId(a: SaftTransactionInput, b: SaftTransactionInput): number {
  return a.date === b.date ? a.voucherId.localeCompare(b.voucherId) : a.date.localeCompare(b.date);
}

/** Calendar month (1–12) of a `YYYY-MM-DD` date. */
function monthOf(date: string): number {
  return Number(date.slice(5, 7));
}

/** Calendar year of a `YYYY-MM-DD` date. */
function yearOf(date: string): number {
  return Number(date.slice(0, 4));
}

/**
 * The hard tie-out the export must satisfy: the document's TotalDebit equals TotalCredit AND every
 * transaction balances on its own (Σ debit = Σ credit). Both follow from the ledger's append-only
 * balanced-voucher invariant; asserting them here catches a mapping regression before XSD validation.
 */
export function saftBalances(model: SaftFinancial): boolean {
  if (!eqØre(model.totalDebitØre, model.totalCreditØre)) return false;
  return model.journals.every((j) =>
    j.transactions.every((t) => {
      const debit = sumØre(t.lines.filter((l) => l.side === 'debit').map((l) => l.amountØre));
      const credit = sumØre(t.lines.filter((l) => l.side === 'credit').map((l) => l.amountØre));
      return eqØre(debit, credit);
    }),
  );
}

/** Σ of every account master's closing balance, signed (debit +, credit −) — 0 for a balanced ledger. */
export function saftClosingBalanceNet(model: SaftFinancial): Øre {
  return sumØre(
    model.accounts.map((a) =>
      a.closing.side === 'debit' ? a.closing.amountØre : negØre(a.closing.amountØre),
    ),
  );
}
