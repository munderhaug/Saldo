# GoCardless Bank Account Data API (PSD2 / AIS) — the contract Saldo integrates against (capture)

> **Captured:** 2026-06-26 · **Verify by:** 2027-06-26 (re-check endpoints + the rate-limit phase-in).
> **Why this file exists:** external API field names, endpoint paths and the rate-limit numbers are
> NEVER built from model memory (hard invariant, AGENTS.md §"VAT codes & accounts… never hardcode";
> the same rule applies to every integration boundary — `.claude/rules/integrations.md`). The banking
> client (`apps/web/app/integrations/banking/`) maps GoCardless payloads onto Saldo's normalised bank
> transaction using ONLY the field model recorded here, and Zod-validates every payload at the boundary.

## What it is
**GoCardless Bank Account Data** (formerly Nordigen) is a PSD2 **Account Information Service (AIS)**:
read-only access to a bank account's metadata, balances and transactions, after the account holder
authenticates with their bank. It has a **free tier**, which is why build-spec §9 picks it for the
first banking integration. It is an EU/EEA provider; account + transaction data is personal +
financial data and must stay in the EU/EEA (`.claude/rules/data-handling.md`).

- **Base URL:** `https://bankaccountdata.gocardless.com`
- **All data calls require** an `Authorization: Bearer <access_token>` header.

## Authentication (two-step token)
| Step | Endpoint | Request | Response (fields used) | Lifetime |
|---|---|---|---|---|
| 1 — new token | `POST /api/v2/token/new/` | `{ secret_id, secret_key }` | `{ access, access_expires, refresh, refresh_expires }` | `access` ≈ 86 400 s (24 h); `refresh` ≈ 2 592 000 s (30 d) |
| 2 — refresh | `POST /api/v2/token/refresh/` | `{ refresh }` | `{ access, access_expires }` | new 24 h access token |

`secret_id` / `secret_key` are issued in the GoCardless portal. **They are secrets: server env only,
never logged, never in code** (`.claude/rules/integrations.md`). The access token is short-lived and is
itself a credential — it is never logged either.

## End-to-end flow (link an account, then read it)
1. `GET /api/v2/institutions/?country={ISO-3166-2}` — list banks for a country (e.g. `NO`).
2. `POST /api/v2/agreements/enduser/` *(optional)* — `{ institution_id, max_historical_days,
   access_valid_for_days, access_scope }`. Default scope: 90 days history, 90 days validity.
3. `POST /api/v2/requisitions/` — `{ institution_id, redirect, reference, agreement, user_language }`
   → returns a requisition `id` + a `link` the user opens to authenticate at their bank.
4. `GET /api/v2/requisitions/{requisition_id}/` — after the user finishes, returns `accounts: [id…]`.
5. `GET /api/v2/accounts/{account_id}/` — account metadata (`iban`, `institution_id`, `status`, …).
6. `GET /api/v2/accounts/{account_id}/details/` — account details (name, owner, currency).
7. `GET /api/v2/accounts/{account_id}/balances/` — balances.
8. `GET /api/v2/accounts/{account_id}/transactions/` — the booked + pending transactions (below).

> Saldo's import (this feature) consumes **(8) transactions** for an already-linked account; the
> link/consent dance (1–4) and balances (7) are out of scope here (reconciliation/onboarding follow-ons).

## Transactions response — the field model Saldo maps
`GET /api/v2/accounts/{account_id}/transactions/` returns:

```json
{ "transactions": { "booked": [ Transaction… ], "pending": [ Transaction… ] } }
```

A **Transaction** (booked entries are what Saldo imports as facts; pending are excluded — they may
change or vanish before they post):

| Field | Type | Notes |
|---|---|---|
| `transactionAmount.amount` | **decimal string** | e.g. `"45.00"`, `"-15.30"`. The **only mandatory** field. Sign IS carried here (unlike camt). NEVER a float — parse string → øre. |
| `transactionAmount.currency` | string (ISO 4217) | account currency, e.g. `"NOK"`. |
| `transactionId` | string | bank's id for the entry. **Bank-dependent / not guaranteed stable.** |
| `internalTransactionId` | string | id assigned by GoCardless. Used as the de-dup key when present. |
| `entryReference` | string | bank reference. Bank-dependent. |
| `bookingDate` | `YYYY-MM-DD` | posted-to-account date. Bank-dependent. |
| `valueDate` | `YYYY-MM-DD` | funds-available date. Bank-dependent. |
| `bookingDateTime` / `valueDateTime` | ISO datetime | optional finer-grained variants. |
| `creditorName` / `debtorName` | string | counterparty name (**personal data**). Bank-dependent. |
| `creditorAccount.iban` / `debtorAccount.iban` | string | counterparty account (**personal data**). |
| `remittanceInformationUnstructured` | string | free-text message / KID may live here (**personal data**). |
| `remittanceInformationUnstructuredArray` | string[] | array variant of the above. |
| `bankTransactionCode` / `proprietaryBankTransactionCode` | string | ISO 20022 / bank classification. |

Most fields beyond `transactionAmount` are **bank-dependent** — the Zod contract treats them as
optional and the normaliser tolerates their absence.

## Rate limits — the §9 caution, baked in
- Banks may rate-limit **down to 4 API calls per day, per account, per access scope** (details /
  balances / transactions are separate scopes). GoCardless's phase-in: **10 requests/day/scope/account
  from 2024-08-19**, moving toward **4 requests/day/scope/account**. **Design for 4.**
- Exceeding it → **HTTP 429** `RateLimitError`; the only remedy is to wait until the reset time in the
  `HTTP_X_RATELIMIT_ACCOUNT_SUCCESS_RESET` response header.
- Relevant headers: `HTTP_X_RATELIMIT_LIMIT`, `HTTP_X_RATELIMIT_REMAINING`, `HTTP_X_RATELIMIT_RESET`
  (app-level) and the per-account `HTTP_X_RATELIMIT_ACCOUNT_SUCCESS_LIMIT` /
  `…_ACCOUNT_SUCCESS_REMAINING` / `…_ACCOUNT_SUCCESS_RESET`.

**Consequences for Saldo (enforced in code, not just noted):**
- **Never poll per request.** A fetch is an explicit, user- or schedule-triggered batch that pulls the
  whole transactions window at once, then imports idempotently. No per-page or per-transaction calls.
- **Cache the access token** for its lifetime; refresh, don't re-issue, and never on every call.
- The import is **idempotent** (de-dup on the external id) so a re-fetch after a 429 wastes no quota
  and creates no duplicates.

## Residency (fail-closed)
GoCardless is an EU provider, but the client still **fails closed**: the live client is enabled only
when the operator asserts EU residency (`BANKING_EU_RESIDENT=true`) AND the secrets are set — otherwise
the integration is OFF (no external call), same posture as the LLM/email surfaces (ADR 0009 / 0045).

## Sources
- GoCardless Bank Account Data — Quick-Start: https://developer.gocardless.com/bank-account-data/quick-start-guide (fetched 2026-06-26)
- GoCardless Bank Account Data — Overview: https://developer.gocardless.com/bank-account-data/overview (fetched 2026-06-26)
- GoCardless Bank Account Data — Account Transactions output: https://developer.gocardless.com/bank-account-data/transactions (fetched 2026-06-26)
- GoCardless Bank Account Data — Statuses & error messages (429 / rate-limit headers): https://developer.gocardless.com/bank-account-data/statuses/ (fetched 2026-06-26)
</content>
</invoke>
