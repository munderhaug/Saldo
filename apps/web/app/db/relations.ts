import { relations } from "drizzle-orm/relations";
import { organization, account, vatCode, fiscalPeriod, voucher, posting, invoiceCounter } from "./schema";

export const accountRelations = relations(account, ({one, many}) => ({
	organization: one(organization, {
		fields: [account.organizationId],
		references: [organization.id]
	}),
	postings: many(posting),
}));

export const organizationRelations = relations(organization, ({many}) => ({
	accounts: many(account),
	vatCodes: many(vatCode),
	fiscalPeriods: many(fiscalPeriod),
	vouchers: many(voucher),
	postings: many(posting),
	invoiceCounters: many(invoiceCounter),
}));

export const vatCodeRelations = relations(vatCode, ({one, many}) => ({
	organization: one(organization, {
		fields: [vatCode.organizationId],
		references: [organization.id]
	}),
	postings: many(posting),
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