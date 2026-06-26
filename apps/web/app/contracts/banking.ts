/**
 * Banking import — boundary contracts (build-spec §8.7 / §9). Two kinds of boundary live here:
 *
 *  1. The **bank-account form** (`bankAccountInput`) — all-string like `contactInput`, so one schema
 *     validates both the RHF client values and the action's FormData.
 *  2. The **GoCardless payloads** (`goCardless*`) — the EXTERNAL API responses, Zod-validated at the
 *     integration boundary before any field is trusted (`.claude/rules/integrations.md`). The field
 *     model is grounded in `db/reference/banking/gocardless-bank-account-data.md`, never memory.
 *
 * Personal-data note (`.claude/rules/data-handling.md`): an account number/IBAN is financial data and a
 * counterparty name is a natural person's name — every field that can hold that is marked `// personal`.
 * Money stays a decimal STRING here (never a float); it is converted to integer øre by the domain
 * normaliser (`@saldo/domain` — `normaliseGoCardlessTx`).
 */
import { z } from 'zod';

/** The import sources behind the one provider-agnostic interface (build-spec §8.7). Mirrors the
 * `bank_transaction.source` CHECK constraint in the migration. */
export type BankImportSource = 'camt054' | 'csv' | 'gocardless';

/** Add / edit a bank account (manual register entry; a GoCardless id links it to live AIS fetches). */
export const bankAccountInput = z.object({
  label: z.string().trim().min(1, 'Gi kontoen et navn').max(200),
  /** Norwegian BBAN (11 digits) or IBAN; '' = not given. Spaces are stripped by the db layer. */
  accountNumber: z // personal: a sole-trader's private account number is financial data
    .string()
    .trim()
    .max(40)
    .refine(
      (v) => v === '' || /^[A-Z0-9 ]{8,40}$/i.test(v),
      'Kontonummer må være et gyldig konto- eller IBAN-nummer',
    ),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, 'Valuta må være en tre-bokstavs kode (ISO 4217)'),
  /** GoCardless account id (UUID-ish opaque string); '' = not linked to live AIS. */
  gocardlessAccountId: z.string().trim().max(100),
});
export type BankAccountInput = z.infer<typeof bankAccountInput>;

// ── GoCardless Bank Account Data — external payloads (Zod-validated at the boundary) ───────────────

/** `POST /api/v2/token/new/` and `/refresh/` — only the access token + its lifetime are used. */
export const goCardlessTokenResponse = z.object({
  access: z.string().min(1),
  access_expires: z.number().int().positive(),
});

/** A transaction's amount: a decimal STRING (carries its own sign) + ISO 4217 currency. */
const goCardlessTransactionAmount = z.object({
  amount: z.string().min(1),
  currency: z.string().min(1),
});

/**
 * One transaction from `GET /api/v2/accounts/{id}/transactions/`. Only `transactionAmount` is
 * guaranteed; everything else is bank-dependent (capture §"Transactions response"). `passthrough` keeps
 * unknown bank-specific fields from failing the parse — we read only what we map.
 */
const goCardlessTransaction = z
  .object({
    transactionId: z.string().optional(),
    internalTransactionId: z.string().optional(),
    bookingDate: z.string().optional(),
    valueDate: z.string().optional(),
    transactionAmount: goCardlessTransactionAmount,
    creditorName: z.string().optional(), // personal
    debtorName: z.string().optional(), // personal
    remittanceInformationUnstructured: z.string().optional(), // personal
    remittanceInformationUnstructuredArray: z.array(z.string()).optional(), // personal
  })
  .passthrough();
export type GoCardlessTransaction = z.infer<typeof goCardlessTransaction>;

/** The transactions endpoint envelope: booked entries are imported; pending are ignored. */
export const goCardlessTransactionsResponse = z.object({
  transactions: z.object({
    booked: z.array(goCardlessTransaction).default([]),
    pending: z.array(goCardlessTransaction).default([]),
  }),
});
