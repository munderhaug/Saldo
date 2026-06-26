/**
 * Banking-import queries (build-spec §8.7, feat-banking-import). Bank accounts + their imported
 * transactions, read/written inside an already-scoped tenant transaction (call via `withUserOrg`, which
 * proves membership and sets the RLS tenant context) — so the unfiltered reads/writes below are scoped
 * to the current org by RLS, and the same-org composite FK keeps a transaction inside its account's org.
 * Server-only.
 *
 * Bank transactions are append-only IMPORTED FACTS (a SQL trigger blocks mutation; posting happens at
 * reconciliation, not here). The import is IDEMPOTENT: a per-account UNIQUE (external_ref) + an
 * ON CONFLICT DO NOTHING makes re-importing the same window a no-op, so a retry after a rate-limit/crash
 * wastes nothing and never duplicates. Account number, counterparty and remittance text are
 * personal/financial data (.claude/rules/data-handling.md).
 */
import { desc, eq, sql } from 'drizzle-orm';
import { transactionDedupKey, type NormalisedBankTx } from '@saldo/domain';
import type { OrgTx } from '../auth/middleware.js';
import type { BankAccountInput, BankImportSource } from '../contracts/banking.js';
import { bankAccount, bankTransaction } from './schema.js';

export interface BankAccountListRow {
  readonly id: string;
  readonly label: string;
  readonly accountNumber: string | null;
  readonly currency: string;
  readonly isLinked: boolean;
  readonly transactionCount: number;
}

export interface BankAccountDetail {
  readonly id: string;
  readonly label: string;
  readonly accountNumber: string | null; // personal/financial
  readonly currency: string;
  readonly gocardlessAccountId: string | null;
}

export interface BankTransactionRow {
  readonly id: string;
  readonly source: string;
  readonly amountOre: number;
  readonly currency: string;
  readonly bookingDate: string | null;
  readonly remittanceInfo: string | null; // personal: free text, may carry a KID / a person's name
  readonly counterparty: string | null; // personal: counterparty name
  readonly isMatched: boolean;
}

/** List this tenant's bank accounts with a transaction count (RLS scopes to the current org). */
export async function listBankAccounts(tx: OrgTx): Promise<BankAccountListRow[]> {
  const rows = await tx
    .select({
      id: bankAccount.id,
      label: bankAccount.label,
      accountNumber: bankAccount.accountNumber,
      currency: bankAccount.currency,
      gocardlessAccountId: bankAccount.gocardlessAccountId,
      transactionCount: sql<number>`count(${bankTransaction.id})::int`,
    })
    .from(bankAccount)
    .leftJoin(bankTransaction, eq(bankTransaction.bankAccountId, bankAccount.id))
    .groupBy(bankAccount.id)
    .orderBy(bankAccount.label);
  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    accountNumber: r.accountNumber,
    currency: r.currency,
    isLinked: r.gocardlessAccountId !== null && r.gocardlessAccountId !== '',
    transactionCount: r.transactionCount,
  }));
}

/** Read one bank account by id, scoped to the current org. `null` when it does not exist for this tenant. */
export async function readBankAccount(
  tx: OrgTx,
  accountId: string,
): Promise<BankAccountDetail | null> {
  const [row] = await tx.select().from(bankAccount).where(eq(bankAccount.id, accountId)).limit(1);
  if (!row) return null;
  return {
    id: row.id,
    label: row.label,
    accountNumber: row.accountNumber,
    currency: row.currency,
    gocardlessAccountId: row.gocardlessAccountId,
  };
}

const nullable = (value: string): string | null => (value.trim() === '' ? null : value.trim());

/** Create a bank account for the current org; returns the new id. RLS WITH CHECK pins it to this tenant. */
export async function createBankAccount(
  tx: OrgTx,
  organizationId: string,
  input: BankAccountInput,
): Promise<string> {
  const [row] = await tx
    .insert(bankAccount)
    .values({
      organizationId,
      label: input.label,
      accountNumber: nullable(input.accountNumber),
      currency: input.currency,
      gocardlessAccountId: nullable(input.gocardlessAccountId),
    })
    .returning({ id: bankAccount.id });
  return row!.id;
}

/** The most recent imported transactions for an account, newest booking date first. */
export async function listBankTransactions(
  tx: OrgTx,
  accountId: string,
  limit = 100,
): Promise<BankTransactionRow[]> {
  const rows = await tx
    .select()
    .from(bankTransaction)
    .where(eq(bankTransaction.bankAccountId, accountId))
    .orderBy(desc(bankTransaction.bookingDate), desc(bankTransaction.importedAt))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    source: r.source,
    amountOre: r.amountOre,
    currency: r.currency,
    bookingDate: r.bookingDate,
    remittanceInfo: r.remittanceInfo,
    counterparty: r.counterparty,
    isMatched: r.matchedVoucherId !== null,
  }));
}

export interface ImportSummary {
  /** Transactions newly inserted this import. */
  readonly imported: number;
  /** Transactions already present (idempotent skip). */
  readonly skipped: number;
}

/**
 * Persist normalised transactions for an account, idempotently. Within-batch duplicates are collapsed
 * by dedup key first; the per-account UNIQUE (external_ref) + ON CONFLICT DO NOTHING then skips any
 * already imported. Returns how many were inserted vs skipped. The account must belong to this org
 * (RLS + the same-org composite FK enforce it).
 */
export async function importTransactions(
  tx: OrgTx,
  organizationId: string,
  accountId: string,
  source: BankImportSource,
  transactions: readonly NormalisedBankTx[],
): Promise<ImportSummary> {
  const byRef = new Map<string, NormalisedBankTx>();
  for (const t of transactions) byRef.set(transactionDedupKey(t), t);
  const unique = [...byRef.entries()];
  if (unique.length === 0) return { imported: 0, skipped: 0 };

  const inserted = await tx
    .insert(bankTransaction)
    .values(
      unique.map(([externalRef, t]) => ({
        organizationId,
        bankAccountId: accountId,
        source,
        externalRef,
        amountOre: t.amount,
        currency: t.currency,
        bookingDate: t.bookingDate,
        valueDate: t.valueDate,
        remittanceInfo: t.remittanceInfo,
        counterparty: t.counterparty,
      })),
    )
    .onConflictDoNothing({
      target: [bankTransaction.bankAccountId, bankTransaction.externalRef],
    })
    .returning({ id: bankTransaction.id });
  return { imported: inserted.length, skipped: unique.length - inserted.length };
}
