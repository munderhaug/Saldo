# ADR 0053 — Org payout account: settings surface + boundary validation

- **Status:** Accepted
- **Date:** 2026-06-29

## Context
EHF BIS Billing 3.0 requires `cac:PayeeFinancialAccount/cbc:ID` for a credit-transfer invoice
(PaymentMeansCode 30) — the bank account the customer pays into. The migration
`20260629064638_org_invoice_payment_account.sql` (review §5) added `organization.invoice_payment_account`
(+ `_name`) as nullable free-text and wired the read/emit path (`readInvoiceDocument` → `toEhfModel` →
`buildUblXml`), leaving the UI to populate it as the follow-up. An ENK has exactly one payout account;
`bank_account` is the 0..N import/reconciliation side and carries no payee role, so it is not that source.

A payout account is a "money" surface (experience-principles §5.5): a transposed digit sends a customer's
payment to the wrong account. The DB stores it free-text "as entered" (no SQL check), so correctness has
to be a boundary concern.

## Decision
Add an org settings route (`orgs/:orgId/settings`) — a `withUserOrg` loader/action mirroring the
contacts/products edit routes — that reads and writes `invoice_payment_account[_name]` through a new
`orgPayoutInput` contract (shape only) and `readOrgPayout` / `updateOrgPayout` server functions.

Validate the account at the action boundary with a new pure domain helper `isValidBankAccount`
(`@saldo/domain`): a Norwegian **BBAN** (11 digits, mod-11 control digit) **or** a Norwegian **IBAN**
(`NO` + ISO-7064 mod-97-10, including the embedded BBAN mod-11). This mirrors how `createOrgInput`
defers the org-nr mod-11 to `isValidOrgNr` — the Zod schema checks shape, the domain checks the
checksum. The account is stored **normalized** (spaces/dots stripped); `''` clears the column. The
column stays nullable, so an org without one set emits no `PayeeFinancialAccount` — identical output to
before, no regression.

## Consequences
- A typo'd payout account is caught before it can be printed on an invoice / emitted in EHF.
- `@saldo/domain` gains a reusable, tested (`exhaustive + fast-check`) Norwegian account-number validator.
- Validation is boundary-only (UX + action), consistent with the org-nr pattern; the DB column remains
  free-text, so a value set by other means (e.g. a migration/back-office) is not retroactively checked.
- Foreign (non-`NO`) IBANs are rejected by the settings form. An ENK invoicing domestically via EHF uses
  a Norwegian account; cross-border payee accounts are out of scope until a feature needs them.

## Alternatives considered
- **Free-text, no validation** (as the column stores it): simplest, but a wrong payout account is a
  money-to-the-wrong-place error this product should catch — rejected for a §5.5 surface.
- **Reuse `bank_account`**: wrong shape — it is the 0..N import side with no single-payee semantics; the
  migration already chose an explicit org-level column.
- **Full IBAN (any country) validation**: more surface than the Norwegian ENK audience needs now; the
  validator is structured so a country can be added when a feature requires it.
