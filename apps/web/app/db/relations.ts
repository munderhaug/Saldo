import { relations } from "drizzle-orm/relations";
import { organization, invoiceCounter, fiscalPeriod, voucher, posting, account, vatCode } from "./schema";

export const invoiceCounterRelations = relations(invoiceCounter, ({one}) => ({
	organization: one(organization, {
		fields: [invoiceCounter.organizationId],
		references: [organization.id]
	}),
}));

export const organizationRelations = relations(organization, ({many}) => ({
	invoiceCounters: many(invoiceCounter),
	fiscalPeriods: many(fiscalPeriod),
	vouchers: many(voucher),
	postings: many(posting),
	accounts: many(account),
	vatCodes: many(vatCode),
}));

export const fiscalPeriodRelations = relations(fiscalPeriod, ({one, many}) => ({
	organization: one(organization, {
		fields: [fiscalPeriod.organizationId],
		references: [organization.id]
	}),
	vouchers: many(voucher),
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
	voucher: one(voucher, {
		fields: [voucher.reversesVoucherId],
		references: [voucher.id],
		relationName: "voucher_reversesVoucherId_voucher_id"
	}),
	vouchers: many(voucher, {
		relationName: "voucher_reversesVoucherId_voucher_id"
	}),
	postings: many(posting),
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

export const accountRelations = relations(account, ({one, many}) => ({
	postings: many(posting),
	organization: one(organization, {
		fields: [account.organizationId],
		references: [organization.id]
	}),
}));

export const vatCodeRelations = relations(vatCode, ({one, many}) => ({
	postings: many(posting),
	organization: one(organization, {
		fields: [vatCode.organizationId],
		references: [organization.id]
	}),
}));