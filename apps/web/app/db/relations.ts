import { relations } from "drizzle-orm/relations";
import { organization, invoiceEmail, invoice, account, vatCode, fiscalPeriod, posting, voucher, invoiceCounter, appUser, userSession, contact, aiProvenance, product, invoiceLine, bankAccount, bankTransaction, supplierInvoice, supplierInvoiceLine, auditLog, mvaFiling, membership } from "./schema";

/**
 * Drizzle relations — HAND-MAINTAINED (do not blindly overwrite with `drizzle-kit introspect`).
 *
 * `introspect` derives `one(...)` relations from the FIRST column of each foreign key. Most of our
 * cross-row FKs are *composite same-org* keys — `(organization_id, x_id) -> ref(id, organization_id)`
 * (ADR 0012's tenancy belt-and-braces) — so introspect keyed every such relation on `organization_id`
 * instead of the real reference column (e.g. `invoiceLine.organizationId -> invoice.id`). That join is
 * wrong: `organization_id` is never a parent row's `id`, so the relation resolves to nothing. It also
 * emitted spurious duplicate relations for the composite period/voucher keys.
 *
 * This file restores the correct join column for every relation. Re-introspection will reintroduce the
 * bug, so the relations are locked by `test/integrity/relations.integration.test.ts`, which exercises
 * every relation against a seeded graph — if a regenerate clobbers this, that suite fails in CI.
 *
 * Related quirk in the GENERATED `schema.ts` (review 2026-07-03 §11): introspect emits each composite
 * same-org FK with its column/foreignColumn arrays in MISMATCHED order (e.g.
 * `columns: [organizationId, matchedVoucherId] → foreignColumns: [voucher.id, voucher.organizationId]`).
 * The real constraint in SQL is correct — schema.ts FK metadata is never used to generate DDL here
 * (db/migrations is the source of truth, ADR 0011) — so the pairing is misleading to READ but has no
 * runtime effect. Don't "fix" schema.ts by hand (a hook blocks it); the truth lives in the migration.
 */

export const invoiceEmailRelations = relations(invoiceEmail, ({one}) => ({
	organization: one(organization, {
		fields: [invoiceEmail.organizationId],
		references: [organization.id]
	}),
	invoice: one(invoice, {
		fields: [invoiceEmail.invoiceId],
		references: [invoice.id]
	}),
}));

export const organizationRelations = relations(organization, ({many}) => ({
	invoiceEmails: many(invoiceEmail),
	accounts: many(account),
	vatCodes: many(vatCode),
	fiscalPeriods: many(fiscalPeriod),
	postings: many(posting),
	invoiceCounters: many(invoiceCounter),
	vouchers: many(voucher),
	contacts: many(contact),
	aiProvenances: many(aiProvenance),
	products: many(product),
	invoices: many(invoice),
	invoiceLines: many(invoiceLine),
	bankAccounts: many(bankAccount),
	bankTransactions: many(bankTransaction),
	supplierInvoices: many(supplierInvoice),
	supplierInvoiceLines: many(supplierInvoiceLine),
	auditLogs: many(auditLog),
	mvaFilings: many(mvaFiling),
	memberships: many(membership),
}));

export const invoiceRelations = relations(invoice, ({one, many}) => ({
	organization: one(organization, {
		fields: [invoice.organizationId],
		references: [organization.id]
	}),
	customer: one(contact, {
		fields: [invoice.customerId],
		references: [contact.id]
	}),
	creditsInvoice: one(invoice, {
		fields: [invoice.creditsInvoiceId],
		references: [invoice.id],
		relationName: "invoice_credits"
	}),
	creditedByInvoices: many(invoice, {
		relationName: "invoice_credits"
	}),
	invoiceEmails: many(invoiceEmail),
	invoiceLines: many(invoiceLine),
	vouchers: many(voucher),
}));

export const accountRelations = relations(account, ({one, many}) => ({
	organization: one(organization, {
		fields: [account.organizationId],
		references: [organization.id]
	}),
	postings: many(posting),
	contacts: many(contact),
	products: many(product),
	invoiceLines: many(invoiceLine),
	supplierInvoiceLines: many(supplierInvoiceLine),
}));

export const vatCodeRelations = relations(vatCode, ({one, many}) => ({
	organization: one(organization, {
		fields: [vatCode.organizationId],
		references: [organization.id]
	}),
	postings: many(posting),
	contacts: many(contact),
	products: many(product),
	invoiceLines: many(invoiceLine),
	supplierInvoiceLines: many(supplierInvoiceLine),
}));

export const fiscalPeriodRelations = relations(fiscalPeriod, ({one, many}) => ({
	organization: one(organization, {
		fields: [fiscalPeriod.organizationId],
		references: [organization.id]
	}),
	vouchers: many(voucher),
}));

export const postingRelations = relations(posting, ({one}) => ({
	organization: one(organization, {
		fields: [posting.organizationId],
		references: [organization.id]
	}),
	voucher: one(voucher, {
		fields: [posting.voucherId],
		references: [voucher.id]
	}),
	account: one(account, {
		fields: [posting.accountId],
		references: [account.id]
	}),
	vatCode: one(vatCode, {
		fields: [posting.vatCodeId],
		references: [vatCode.id]
	}),
}));

export const voucherRelations = relations(voucher, ({one, many}) => ({
	organization: one(organization, {
		fields: [voucher.organizationId],
		references: [organization.id]
	}),
	fiscalPeriod: one(fiscalPeriod, {
		fields: [voucher.periodId],
		references: [fiscalPeriod.id]
	}),
	reversesVoucher: one(voucher, {
		fields: [voucher.reversesVoucherId],
		references: [voucher.id],
		relationName: "voucher_reverses"
	}),
	reversedByVouchers: many(voucher, {
		relationName: "voucher_reverses"
	}),
	invoice: one(invoice, {
		fields: [voucher.invoiceId],
		references: [invoice.id]
	}),
	supplierInvoice: one(supplierInvoice, {
		fields: [voucher.supplierInvoiceId],
		references: [supplierInvoice.id]
	}),
	postings: many(posting),
	aiProvenances: many(aiProvenance),
	bankTransactions: many(bankTransaction),
}));

export const invoiceCounterRelations = relations(invoiceCounter, ({one}) => ({
	organization: one(organization, {
		fields: [invoiceCounter.organizationId],
		references: [organization.id]
	}),
}));

export const userSessionRelations = relations(userSession, ({one}) => ({
	appUser: one(appUser, {
		fields: [userSession.userId],
		references: [appUser.id]
	}),
}));

export const appUserRelations = relations(appUser, ({many}) => ({
	userSessions: many(userSession),
	auditLogs: many(auditLog),
	memberships: many(membership),
}));

export const mvaFilingRelations = relations(mvaFiling, ({one}) => ({
	organization: one(organization, {
		fields: [mvaFiling.organizationId],
		references: [organization.id]
	}),
}));

export const auditLogRelations = relations(auditLog, ({one}) => ({
	organization: one(organization, {
		fields: [auditLog.organizationId],
		references: [organization.id]
	}),
	actor: one(appUser, {
		fields: [auditLog.actorUserId],
		references: [appUser.id]
	}),
}));

export const contactRelations = relations(contact, ({one, many}) => ({
	organization: one(organization, {
		fields: [contact.organizationId],
		references: [organization.id]
	}),
	defaultAccount: one(account, {
		fields: [contact.defaultAccountId],
		references: [account.id]
	}),
	defaultVatCode: one(vatCode, {
		fields: [contact.defaultVatCodeId],
		references: [vatCode.id]
	}),
	invoices: many(invoice),
	supplierInvoices: many(supplierInvoice),
}));

export const aiProvenanceRelations = relations(aiProvenance, ({one}) => ({
	organization: one(organization, {
		fields: [aiProvenance.organizationId],
		references: [organization.id]
	}),
	voucher: one(voucher, {
		fields: [aiProvenance.voucherId],
		references: [voucher.id]
	}),
}));

export const productRelations = relations(product, ({one, many}) => ({
	organization: one(organization, {
		fields: [product.organizationId],
		references: [organization.id]
	}),
	defaultAccount: one(account, {
		fields: [product.defaultAccountId],
		references: [account.id]
	}),
	defaultVatCode: one(vatCode, {
		fields: [product.defaultVatCodeId],
		references: [vatCode.id]
	}),
	invoiceLines: many(invoiceLine),
}));

export const invoiceLineRelations = relations(invoiceLine, ({one}) => ({
	organization: one(organization, {
		fields: [invoiceLine.organizationId],
		references: [organization.id]
	}),
	invoice: one(invoice, {
		fields: [invoiceLine.invoiceId],
		references: [invoice.id]
	}),
	account: one(account, {
		fields: [invoiceLine.accountId],
		references: [account.id]
	}),
	vatCode: one(vatCode, {
		fields: [invoiceLine.vatCodeId],
		references: [vatCode.id]
	}),
	product: one(product, {
		fields: [invoiceLine.productId],
		references: [product.id]
	}),
}));

export const bankAccountRelations = relations(bankAccount, ({one, many}) => ({
	organization: one(organization, {
		fields: [bankAccount.organizationId],
		references: [organization.id]
	}),
	bankTransactions: many(bankTransaction),
}));

export const bankTransactionRelations = relations(bankTransaction, ({one}) => ({
	organization: one(organization, {
		fields: [bankTransaction.organizationId],
		references: [organization.id]
	}),
	matchedVoucher: one(voucher, {
		fields: [bankTransaction.matchedVoucherId],
		references: [voucher.id]
	}),
	bankAccount: one(bankAccount, {
		fields: [bankTransaction.bankAccountId],
		references: [bankAccount.id]
	}),
}));

export const supplierInvoiceRelations = relations(supplierInvoice, ({one, many}) => ({
	organization: one(organization, {
		fields: [supplierInvoice.organizationId],
		references: [organization.id]
	}),
	supplier: one(contact, {
		fields: [supplierInvoice.supplierId],
		references: [contact.id]
	}),
	supplierInvoiceLines: many(supplierInvoiceLine),
	vouchers: many(voucher),
}));

export const supplierInvoiceLineRelations = relations(supplierInvoiceLine, ({one}) => ({
	organization: one(organization, {
		fields: [supplierInvoiceLine.organizationId],
		references: [organization.id]
	}),
	supplierInvoice: one(supplierInvoice, {
		fields: [supplierInvoiceLine.supplierInvoiceId],
		references: [supplierInvoice.id]
	}),
	account: one(account, {
		fields: [supplierInvoiceLine.accountId],
		references: [account.id]
	}),
	vatCode: one(vatCode, {
		fields: [supplierInvoiceLine.vatCodeId],
		references: [vatCode.id]
	}),
}));

export const membershipRelations = relations(membership, ({one}) => ({
	appUser: one(appUser, {
		fields: [membership.userId],
		references: [appUser.id]
	}),
	organization: one(organization, {
		fields: [membership.organizationId],
		references: [organization.id]
	}),
}));
