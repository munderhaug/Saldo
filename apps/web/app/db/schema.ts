import { pgTable, varchar, foreignKey, uuid, bigint, unique, pgPolicy, check, char, text, timestamp, numeric, integer, date, index } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



export const schemaMigrations = pgTable("schema_migrations", {
	version: varchar().primaryKey().notNull(),
});

export const invoiceCounter = pgTable("invoice_counter", {
	organizationId: uuid("organization_id").primaryKey().notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	next: bigint({ mode: "number" }).default(0).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organization.id],
			name: "invoice_counter_organization_id_fkey"
		}),
]);

export const organization = pgTable("organization", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	orgNr: char("org_nr", { length: 9 }).notNull(),
	name: text().notNull(),
	mvaStatus: text("mva_status").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("organization_org_nr_key").on(table.orgNr),
	pgPolicy("org_isolation", { as: "permissive", for: "all", to: ["public"], using: sql`(id = (current_setting('app.current_org'::text, true))::uuid)` }),
	check("organization_mva_status_check", sql`mva_status = ANY (ARRAY['under_threshold'::text, 'unntatt'::text, 'registered_standard'::text, 'registered_zero_rated'::text])`),
]);

export const account = pgTable("account", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	organizationId: uuid("organization_id").notNull(),
	number: text().notNull(),
	name: text().notNull(),
	type: text().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organization.id],
			name: "account_organization_id_fkey"
		}),
	unique("account_organization_id_number_key").on(table.organizationId, table.number),
	pgPolicy("org_isolation", { as: "permissive", for: "all", to: ["public"], using: sql`(organization_id = (current_setting('app.current_org'::text, true))::uuid)` }),
]);

export const vatCode = pgTable("vat_code", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	organizationId: uuid("organization_id").notNull(),
	code: text().notNull(),
	rate: numeric({ precision: 5, scale:  4 }).notNull(),
	direction: text().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organization.id],
			name: "vat_code_organization_id_fkey"
		}),
	unique("vat_code_organization_id_code_key").on(table.organizationId, table.code),
	pgPolicy("org_isolation", { as: "permissive", for: "all", to: ["public"], using: sql`(organization_id = (current_setting('app.current_org'::text, true))::uuid)` }),
	check("vat_code_direction_check", sql`direction = ANY (ARRAY['output'::text, 'input'::text, 'none'::text])`),
]);

export const fiscalPeriod = pgTable("fiscal_period", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	organizationId: uuid("organization_id").notNull(),
	year: integer().notNull(),
	startsOn: date("starts_on").notNull(),
	endsOn: date("ends_on").notNull(),
	lockedAt: timestamp("locked_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organization.id],
			name: "fiscal_period_organization_id_fkey"
		}),
	unique("fiscal_period_organization_id_year_starts_on_key").on(table.organizationId, table.year, table.startsOn),
	pgPolicy("org_isolation", { as: "permissive", for: "all", to: ["public"], using: sql`(organization_id = (current_setting('app.current_org'::text, true))::uuid)` }),
]);

export const voucher = pgTable("voucher", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	organizationId: uuid("organization_id").notNull(),
	type: text().notNull(),
	periodId: uuid("period_id").notNull(),
	reversesVoucherId: uuid("reverses_voucher_id"),
	postedAt: timestamp("posted_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organization.id],
			name: "voucher_organization_id_fkey"
		}),
	foreignKey({
			columns: [table.periodId],
			foreignColumns: [fiscalPeriod.id],
			name: "voucher_period_id_fkey"
		}),
	foreignKey({
			columns: [table.reversesVoucherId],
			foreignColumns: [table.id],
			name: "voucher_reverses_voucher_id_fkey"
		}),
	pgPolicy("org_isolation", { as: "permissive", for: "all", to: ["public"], using: sql`(organization_id = (current_setting('app.current_org'::text, true))::uuid)` }),
	check("voucher_type_check", sql`type = ANY (ARRAY['sales'::text, 'purchase'::text, 'manual'::text, 'bank'::text, 'reversal'::text])`),
]);

export const posting = pgTable("posting", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	organizationId: uuid("organization_id").notNull(),
	voucherId: uuid("voucher_id").notNull(),
	accountId: uuid("account_id").notNull(),
	vatCodeId: uuid("vat_code_id"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	debitOre: bigint("debit_ore", { mode: "number" }).default(0).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	creditOre: bigint("credit_ore", { mode: "number" }).default(0).notNull(),
}, (table) => [
	index("posting_voucher_idx").using("btree", table.voucherId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organization.id],
			name: "posting_organization_id_fkey"
		}),
	foreignKey({
			columns: [table.voucherId],
			foreignColumns: [voucher.id],
			name: "posting_voucher_id_fkey"
		}),
	foreignKey({
			columns: [table.accountId],
			foreignColumns: [account.id],
			name: "posting_account_id_fkey"
		}),
	foreignKey({
			columns: [table.vatCodeId],
			foreignColumns: [vatCode.id],
			name: "posting_vat_code_id_fkey"
		}),
	pgPolicy("org_isolation", { as: "permissive", for: "all", to: ["public"], using: sql`(organization_id = (current_setting('app.current_org'::text, true))::uuid)` }),
	check("posting_debit_ore_check", sql`debit_ore >= 0`),
	check("posting_credit_ore_check", sql`credit_ore >= 0`),
	check("posting_check", sql`(debit_ore = 0) <> (credit_ore = 0)`),
]);
