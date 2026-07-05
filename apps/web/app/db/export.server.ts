/**
 * Full raw data export — the anti-lock-in half of build-spec §8.11/§11 (ADR 0062; GDPR Art. 20
 * alongside the SAF-T standardised export). One RLS-scoped read of every business table the org owns,
 * returned as raw rows for a machine-readable JSON download. Read-only and deterministic — NOT an AI
 * system (Recital 12). Server-only.
 *
 * The auth tables (app_user, user_session, membership) are deliberately absent: they are account
 * plumbing, not the org's books; the audit trail carries the actor linkage the books need.
 */
import type { OrgTx } from '../auth/middleware.js';
import {
  account,
  aiProvenance,
  auditLog,
  bankAccount,
  bankTransaction,
  contact,
  fiscalPeriod,
  invoice,
  invoiceEmail,
  invoiceLine,
  organization,
  posting,
  product,
  supplierInvoice,
  supplierInvoiceLine,
  vatCode,
  voucher,
} from './schema.js';

/** Every business table in one shape; `version` guards future consumers of the file. */
export interface FullExport {
  readonly format: 'saldo-full-export';
  readonly version: 1;
  readonly organization: Record<string, unknown> | null;
  readonly accounts: readonly Record<string, unknown>[];
  readonly vatCodes: readonly Record<string, unknown>[];
  readonly fiscalPeriods: readonly Record<string, unknown>[];
  readonly contacts: readonly Record<string, unknown>[];
  readonly products: readonly Record<string, unknown>[];
  readonly invoices: readonly Record<string, unknown>[];
  readonly invoiceLines: readonly Record<string, unknown>[];
  readonly invoiceEmails: readonly Record<string, unknown>[];
  readonly vouchers: readonly Record<string, unknown>[];
  readonly postings: readonly Record<string, unknown>[];
  readonly supplierInvoices: readonly Record<string, unknown>[];
  readonly supplierInvoiceLines: readonly Record<string, unknown>[];
  readonly bankAccounts: readonly Record<string, unknown>[];
  readonly bankTransactions: readonly Record<string, unknown>[];
  readonly aiProvenance: readonly Record<string, unknown>[];
  readonly auditLog: readonly Record<string, unknown>[];
}

/**
 * Read the org's complete business data under the caller's tenant transaction (RLS scopes every
 * SELECT — no WHERE needed, none forgotten). Raw rows, no reshaping: the export is a faithful copy,
 * not a report.
 */
export async function readFullExport(tx: OrgTx): Promise<FullExport> {
  const [org] = await tx.select().from(organization).limit(1);
  return {
    format: 'saldo-full-export',
    version: 1,
    organization: org ?? null,
    accounts: await tx.select().from(account),
    vatCodes: await tx.select().from(vatCode),
    fiscalPeriods: await tx.select().from(fiscalPeriod),
    contacts: await tx.select().from(contact),
    products: await tx.select().from(product),
    invoices: await tx.select().from(invoice),
    invoiceLines: await tx.select().from(invoiceLine),
    invoiceEmails: await tx.select().from(invoiceEmail),
    vouchers: await tx.select().from(voucher),
    postings: await tx.select().from(posting),
    supplierInvoices: await tx.select().from(supplierInvoice),
    supplierInvoiceLines: await tx.select().from(supplierInvoiceLine),
    bankAccounts: await tx.select().from(bankAccount),
    bankTransactions: await tx.select().from(bankTransaction),
    aiProvenance: await tx.select().from(aiProvenance),
    auditLog: await tx.select().from(auditLog),
  };
}
