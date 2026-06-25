# ADR 0040 — Contacts register data model

- **Status:** Accepted
- **Date:** 2026-06-25

## Context
Build-spec §8.2 calls for a contacts register — customers & suppliers in one place — as the
prerequisite for sales invoicing (§8.4) and supplier invoices (§8.5). It must support Enhetsregisteret
autofill, a per-contact MVA status, per-contact defaults (payment terms, account, VAT code, currency,
language), and — eventually — ELMA/PEPPOL capability lookup, multiple contact persons, and multiple
addresses. Contact names/addresses of an ENK or private person are personal data
(`.claude/rules/data-handling.md`). The question is what to model now versus defer, and how the table
fits the tenancy + integrity regime.

## Decision
- **One `contact` table, two role flags.** A contact carries independent `is_customer` /
  `is_supplier` booleans (a CHECK requires at least one) rather than two tables or a single-role enum
  in the database — a counterparty is frequently both. The form surfaces this as one three-way choice
  (`customer | supplier | both`) and maps it to the flags at the boundary.
- **Per-contact MVA status reuses the org's four-state vocabulary** (`MvaStatus`), proposed from
  Enhetsregisteret's `registrertIMvaregisteret` flag via the shared, pure
  `proposeMvaStatusFromVatRegister` (also used by org onboarding) — a deterministic register read, not
  AI; the human confirms it. It is stored as **informational metadata about the counterparty, not a
  posting driver**: posting keys off the line's SAF-T VAT code, and reverse charge (snudd avregning)
  keys off the supplier's foreign domicile (`country_code`) — never off this column. The proposal
  collapses "not registered", "exempt" (`unntatt`) and "unknown" into `under_threshold`, so downstream
  posting logic must re-resolve, not trust this snapshot.
- **Defaults are same-org by construction.** `default_account_id` / `default_vat_code_id` are pinned
  to the contact's own org via a composite FK `(default_*, organization_id) → (id, organization_id)`
  (the `fiscal_period`↔`voucher` pattern), so a default can never reference another tenant's row even
  though FK targets are not constrained by RLS. This required adding `UNIQUE (id, organization_id)` to
  `account` and `vat_code`.
- **Reference data, not the ledger.** Contacts are mutable: no immutability/append-only triggers
  apply. The table joins the standard tenancy regime (ENABLE + FORCE RLS, a USING/WITH CHECK policy on
  `app.current_org`, a `saldo_app` grant), proven by a Testcontainers isolation test.
- **Personal data is tagged at the Zod boundary** (`// personal` on name/email/phone/address) and the
  routes are `Cache-Control: private, no-store`.
- **Deferred to their own tasks:** ELMA/PEPPOL capability lookup, multiple contact persons, and
  multiple addresses (a single inline primary address ships now). Each is independently sized and not
  on the critical path to first invoicing.

## Consequences
- Sales/purchase documents can later resolve a counterparty and prefill its terms/account/VAT/currency
  /language from one row; the same-org FK means a prefilled default is always valid for the tenant.
- Adding the composite-FK targets means `account`/`vat_code` now carry an extra unique index — cheap,
  and consistent with the existing `fiscal_period` precedent.
- PEPPOL send (§8.4) and supplier-invoice matching (§8.5) will need the deferred capability lookup and
  richer contact-person/address modelling; those land as follow-on migrations that extend, not rework,
  this table.

## Alternatives considered
- **Separate `customer` and `supplier` tables** — rejected: duplicates the shared identity/address/
  defaults and forces a merge when a contact is both.
- **A single-role enum column** — rejected: cannot express "both" without a third enum value that then
  has to be decomposed everywhere anyway; two booleans are the honest model.
- **Modelling contact persons + multiple addresses now** — deferred: real but not required for first
  invoicing, and each adds a child table + UI surface better delivered on its own.
