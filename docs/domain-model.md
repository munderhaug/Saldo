# Domain model & business rules

This is the correctness contract. The full, canonical text is `docs/saldo-build-specification.md`
§4–§5; this file is the working reference and will be expanded as the model is implemented. Path-
scoped rules in `.claude/rules/` (money, ledger-integrity, vat) carry the day-to-day constraints.

## Hard invariants
The hard invariants — integer `Øre`, the append-only ledger, gapless invoice numbers, balanced
server-authoritative postings, the four MVA statuses, propose-only AI, and branded `OrgNr`/`Kid` —
are stated once in [`AGENTS.md`](../AGENTS.md) and enforced by the path-scoped rules in `.claude/rules/`
(money, ledger-integrity, vat). They are not restated here; read them there before changing money, the
ledger, VAT, or posting.

## Entities (sketch — see spec §5 for detail)
- **Core:** organization, app_user, membership, contact, item, fiscal_year/period, account, vat_code,
  **invoice_counter**.
- **Sales:** quote, invoice (+ invoice_line), credit_note.
- **Purchases:** purchase (+ purchase_line), document.
- **Ledger:** voucher (bilag), posting (postering) — integrity-critical, immutable once posted.
- **Banking:** bank_account, bank_transaction, reconciliation.
- **VAT/audit:** vat_return, audit_log (append-only).

All money columns are `bigint` øre; every business table is tenant-scoped by `organization_id`.

## VAT logic (summary; rules in `.claude/rules/vat.md`, cited facts in `docs/regulatory/mva-*`)
- Output VAT only when registered; the input-VAT fork is by status; non-deductible cases are encoded;
  reverse charge posts both legs. Codes/accounts come from the committed SAF-T lists.
- The registration threshold and rates are cited in `docs/regulatory/` — not restated here.
