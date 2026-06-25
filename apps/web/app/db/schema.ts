import { pgTable, varchar, index, foreignKey, pgPolicy, check, uuid, text, bigint, timestamp, unique, char, numeric, integer, date, boolean, primaryKey } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



export const schemaMigrations = pgTable("schema_migrations", {
	version: varchar().primaryKey().notNull(),
});

export const product = pgTable("product", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	organizationId: uuid("organization_id").notNull(),
	kind: text().notNull(),
	name: text().notNull(),
	description: text(),
	unit: text().default('stk').notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	unitPriceOre: bigint("unit_price_ore", { mode: "number" }).default(0).notNull(),
	defaultAccountId: uuid("default_account_id"),
	defaultVatCodeId: uuid("default_vat_code_id"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("product_org_idx").using("btree", table.organizationId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organization.id],
			name: "product_organization_id_fkey"
		}),
	foreignKey({
			columns: [table.organizationId, table.defaultAccountId],
			foreignColumns: [account.id, account.organizationId],
			name: "product_default_account_same_org"
		}),
	foreignKey({
			columns: [table.organizationId, table.defaultVatCodeId],
			foreignColumns: [vatCode.id, vatCode.organizationId],
			name: "product_default_vat_code_same_org"
		}),
	pgPolicy("org_isolation", { as: "permissive", for: "all", to: ["public"], using: sql`(organization_id = (current_setting('app.current_org'::text, true))::uuid)`, withCheck: sql`(organization_id = (current_setting('app.current_org'::text, true))::uuid)`  }),
	check("product_kind_check", sql`kind = ANY (ARRAY['goods'::text, 'service'::text])`),
	check("product_unit_price_ore_check", sql`unit_price_ore >= 0`),
]);

export const organization = pgTable("organization", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	orgNr: char("org_nr", { length: 9 }).notNull(),
	name: text().notNull(),
	mvaStatus: text("mva_status").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("organization_org_nr_key").on(table.orgNr),
	pgPolicy("org_isolation", { as: "permissive", for: "all", to: ["public"], using: sql`(id = (current_setting('app.current_org'::text, true))::uuid)`, withCheck: sql`(id = (current_setting('app.current_org'::text, true))::uuid)`  }),
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
	unique("account_id_org_uniq").on(table.id, table.organizationId),
	unique("account_organization_id_number_key").on(table.organizationId, table.number),
	pgPolicy("org_isolation", { as: "permissive", for: "all", to: ["public"], using: sql`(organization_id = (current_setting('app.current_org'::text, true))::uuid)`, withCheck: sql`(organization_id = (current_setting('app.current_org'::text, true))::uuid)`  }),
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
	unique("vat_code_id_org_uniq").on(table.id, table.organizationId),
	unique("vat_code_organization_id_code_key").on(table.organizationId, table.code),
	pgPolicy("org_isolation", { as: "permissive", for: "all", to: ["public"], using: sql`(organization_id = (current_setting('app.current_org'::text, true))::uuid)`, withCheck: sql`(organization_id = (current_setting('app.current_org'::text, true))::uuid)`  }),
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
	unique("fiscal_period_id_org_uniq").on(table.id, table.organizationId),
	unique("fiscal_period_organization_id_year_starts_on_key").on(table.organizationId, table.year, table.startsOn),
	pgPolicy("org_isolation", { as: "permissive", for: "all", to: ["public"], using: sql`(organization_id = (current_setting('app.current_org'::text, true))::uuid)`, withCheck: sql`(organization_id = (current_setting('app.current_org'::text, true))::uuid)`  }),
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
	foreignKey({
			columns: [table.organizationId, table.periodId],
			foreignColumns: [fiscalPeriod.id, fiscalPeriod.organizationId],
			name: "voucher_period_same_org"
		}),
	unique("voucher_id_org_uniq").on(table.id, table.organizationId),
	pgPolicy("org_isolation", { as: "permissive", for: "all", to: ["public"], using: sql`(organization_id = (current_setting('app.current_org'::text, true))::uuid)`, withCheck: sql`(organization_id = (current_setting('app.current_org'::text, true))::uuid)`  }),
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
	pgPolicy("org_isolation", { as: "permissive", for: "all", to: ["public"], using: sql`(organization_id = (current_setting('app.current_org'::text, true))::uuid)`, withCheck: sql`(organization_id = (current_setting('app.current_org'::text, true))::uuid)`  }),
	check("posting_debit_ore_check", sql`debit_ore >= 0`),
	check("posting_credit_ore_check", sql`credit_ore >= 0`),
	check("posting_check", sql`(debit_ore = 0) <> (credit_ore = 0)`),
]);

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
	pgPolicy("org_isolation", { as: "permissive", for: "all", to: ["public"], using: sql`(organization_id = (current_setting('app.current_org'::text, true))::uuid)`, withCheck: sql`(organization_id = (current_setting('app.current_org'::text, true))::uuid)`  }),
]);

export const appUser = pgTable("app_user", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	email: text().notNull(),
	passwordHash: text("password_hash"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("app_user_email_key").on(table.email),
	check("app_user_email_check", sql`(email = lower(email)) AND (email <> ''::text)`),
]);

export const userSession = pgTable("user_session", {
	id: text().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }).notNull(),
}, (table) => [
	index("user_session_expires_idx").using("btree", table.expiresAt.asc().nullsLast().op("timestamptz_ops")),
	index("user_session_user_idx").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [appUser.id],
			name: "user_session_user_id_fkey"
		}).onDelete("cascade"),
	check("user_session_id_check", sql`id ~ '^[0-9a-f]{64}$'::text`),
]);

export const contact = pgTable("contact", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	organizationId: uuid("organization_id").notNull(),
	isCustomer: boolean("is_customer").default(false).notNull(),
	isSupplier: boolean("is_supplier").default(false).notNull(),
	orgNr: char("org_nr", { length: 9 }),
	name: text().notNull(),
	email: text(),
	phone: text(),
	addressLine: text("address_line"),
	postalCode: text("postal_code"),
	city: text(),
	countryCode: char("country_code", { length: 2 }).default('NO').notNull(),
	mvaStatus: text("mva_status").notNull(),
	paymentTermsDays: integer("payment_terms_days").default(14).notNull(),
	defaultAccountId: uuid("default_account_id"),
	defaultVatCodeId: uuid("default_vat_code_id"),
	currency: char({ length: 3 }).default('NOK').notNull(),
	language: text().default('nb').notNull(),
	notes: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("contact_org_idx").using("btree", table.organizationId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organization.id],
			name: "contact_organization_id_fkey"
		}),
	foreignKey({
			columns: [table.organizationId, table.defaultAccountId],
			foreignColumns: [account.id, account.organizationId],
			name: "contact_default_account_same_org"
		}),
	foreignKey({
			columns: [table.organizationId, table.defaultVatCodeId],
			foreignColumns: [vatCode.id, vatCode.organizationId],
			name: "contact_default_vat_code_same_org"
		}),
	pgPolicy("org_isolation", { as: "permissive", for: "all", to: ["public"], using: sql`(organization_id = (current_setting('app.current_org'::text, true))::uuid)`, withCheck: sql`(organization_id = (current_setting('app.current_org'::text, true))::uuid)`  }),
	check("contact_mva_status_check", sql`mva_status = ANY (ARRAY['under_threshold'::text, 'unntatt'::text, 'registered_standard'::text, 'registered_zero_rated'::text])`),
	check("contact_payment_terms_days_check", sql`(payment_terms_days >= 0) AND (payment_terms_days <= 365)`),
	check("contact_language_check", sql`language = ANY (ARRAY['nb'::text, 'en'::text])`),
	check("contact_check", sql`is_customer OR is_supplier`),
]);

export const aiProvenance = pgTable("ai_provenance", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	organizationId: uuid("organization_id").notNull(),
	voucherId: uuid("voucher_id").notNull(),
	model: text().notNull(),
	modelVersion: text("model_version").notNull(),
	confidence: numeric({ precision: 4, scale:  3 }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organization.id],
			name: "ai_provenance_organization_id_fkey"
		}),
	foreignKey({
			columns: [table.voucherId],
			foreignColumns: [voucher.id],
			name: "ai_provenance_voucher_id_fkey"
		}),
	foreignKey({
			columns: [table.organizationId, table.voucherId],
			foreignColumns: [voucher.id, voucher.organizationId],
			name: "ai_provenance_voucher_id_organization_id_fkey"
		}),
	unique("ai_provenance_voucher_id_key").on(table.voucherId),
	pgPolicy("org_isolation", { as: "permissive", for: "all", to: ["public"], using: sql`(organization_id = (current_setting('app.current_org'::text, true))::uuid)`, withCheck: sql`(organization_id = (current_setting('app.current_org'::text, true))::uuid)`  }),
	check("ai_provenance_confidence_check", sql`(confidence >= (0)::numeric) AND (confidence <= (1)::numeric)`),
]);

export const membership = pgTable("membership", {
	userId: uuid("user_id").notNull(),
	organizationId: uuid("organization_id").notNull(),
	role: text().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("membership_org_idx").using("btree", table.organizationId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [appUser.id],
			name: "membership_user_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organization.id],
			name: "membership_organization_id_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.userId, table.organizationId], name: "membership_pkey"}),
	check("membership_role_check", sql`role = ANY (ARRAY['owner'::text, 'member'::text])`),
]);
