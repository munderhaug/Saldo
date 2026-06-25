import { relations } from "drizzle-orm/relations";
import { organization, account, vatCode, fiscalPeriod, voucher, posting, invoiceCounter, appUser, userSession, contact, aiProvenance, product, invoice, invoiceLine, membership } from "./schema";

export const accountRelations = relations(account, ({one, many}) => ({
	organization: one(organization, {
		fields: [account.organizationId],
		references: [organization.id]
	}),
	postings: many(posting),
	contacts: many(contact),
	products: many(product),
	invoiceLines: many(invoiceLine),
}));

export const organizationRelations = relations(organization, ({many}) => ({
	accounts: many(account),
	vatCodes: many(vatCode),
	fiscalPeriods: many(fiscalPeriod),
	vouchers: many(voucher),
	postings: many(posting),
	invoiceCounters: many(invoiceCounter),
	contacts: many(contact),
	aiProvenances: many(aiProvenance),
	products: many(product),
	invoices: many(invoice),
	invoiceLines: many(invoiceLine),
	memberships: many(membership),
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
}));

export const fiscalPeriodRelations = relations(fiscalPeriod, ({one, many}) => ({
	organization: one(organization, {
		fields: [fiscalPeriod.organizationId],
		references: [organization.id]
	}),
	vouchers_periodId: many(voucher, {
		relationName: "voucher_periodId_fiscalPeriod_id"
	}),
	vouchers_organizationId: many(voucher, {
		relationName: "voucher_organizationId_fiscalPeriod_id"
	}),
}));

export const voucherRelations = relations(voucher, ({one, many}) => ({
	organization: one(organization, {
		fields: [voucher.organizationId],
		references: [organization.id]
	}),
	fiscalPeriod_periodId: one(fiscalPeriod, {
		fields: [voucher.periodId],
		references: [fiscalPeriod.id],
		relationName: "voucher_periodId_fiscalPeriod_id"
	}),
	voucher: one(voucher, {
		fields: [voucher.reversesVoucherId],
		references: [voucher.id],
		relationName: "voucher_reversesVoucherId_voucher_id"
	}),
	vouchers: many(voucher, {
		relationName: "voucher_reversesVoucherId_voucher_id"
	}),
	fiscalPeriod_organizationId: one(fiscalPeriod, {
		fields: [voucher.organizationId],
		references: [fiscalPeriod.id],
		relationName: "voucher_organizationId_fiscalPeriod_id"
	}),
	postings: many(posting),
	aiProvenances_voucherId: many(aiProvenance, {
		relationName: "aiProvenance_voucherId_voucher_id"
	}),
	aiProvenances_organizationId: many(aiProvenance, {
		relationName: "aiProvenance_organizationId_voucher_id"
	}),
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
	memberships: many(membership),
}));

export const contactRelations = relations(contact, ({one, many}) => ({
	organization: one(organization, {
		fields: [contact.organizationId],
		references: [organization.id]
	}),
	account: one(account, {
		fields: [contact.organizationId],
		references: [account.id]
	}),
	vatCode: one(vatCode, {
		fields: [contact.organizationId],
		references: [vatCode.id]
	}),
	invoices: many(invoice),
}));

export const aiProvenanceRelations = relations(aiProvenance, ({one}) => ({
	organization: one(organization, {
		fields: [aiProvenance.organizationId],
		references: [organization.id]
	}),
	voucher_voucherId: one(voucher, {
		fields: [aiProvenance.voucherId],
		references: [voucher.id],
		relationName: "aiProvenance_voucherId_voucher_id"
	}),
	voucher_organizationId: one(voucher, {
		fields: [aiProvenance.organizationId],
		references: [voucher.id],
		relationName: "aiProvenance_organizationId_voucher_id"
	}),
}));

export const productRelations = relations(product, ({one, many}) => ({
	organization: one(organization, {
		fields: [product.organizationId],
		references: [organization.id]
	}),
	account: one(account, {
		fields: [product.organizationId],
		references: [account.id]
	}),
	vatCode: one(vatCode, {
		fields: [product.organizationId],
		references: [vatCode.id]
	}),
	invoiceLines: many(invoiceLine),
}));

export const invoiceRelations = relations(invoice, ({one, many}) => ({
	organization: one(organization, {
		fields: [invoice.organizationId],
		references: [organization.id]
	}),
	contact: one(contact, {
		fields: [invoice.organizationId],
		references: [contact.id]
	}),
	invoice: one(invoice, {
		fields: [invoice.organizationId],
		references: [invoice.id],
		relationName: "invoice_organizationId_invoice_id"
	}),
	invoices: many(invoice, {
		relationName: "invoice_organizationId_invoice_id"
	}),
	invoiceLines: many(invoiceLine),
}));

export const invoiceLineRelations = relations(invoiceLine, ({one}) => ({
	vatCode: one(vatCode, {
		fields: [invoiceLine.organizationId],
		references: [vatCode.id]
	}),
	product: one(product, {
		fields: [invoiceLine.organizationId],
		references: [product.id]
	}),
	organization: one(organization, {
		fields: [invoiceLine.organizationId],
		references: [organization.id]
	}),
	invoice: one(invoice, {
		fields: [invoiceLine.organizationId],
		references: [invoice.id]
	}),
	account: one(account, {
		fields: [invoiceLine.organizationId],
		references: [account.id]
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