# Domain model & business rules

This is the correctness contract. The full, canonical text is `docs/saldo-build-specification.md`
§4–§5; this file is the working reference and will be expanded as the model is implemented. Path-
scoped rules in `.claude/rules/` (money, ledger-integrity, vat) carry the day-to-day constraints.

## Hard invariants (NEVER violate)
1. Money is integer `Øre`. No `number`, no float math. Round half-away-from-zero at boundaries only.
2. The ledger is append-only. Posted bilag are immutable — correct via **motbilag**.
3. Issued invoices are immutable — correct via **kreditnota**. Numbers are **gapless** via the per-org
   `invoice_counter` (NOT a SEQUENCE).
4. Every voucher balances: Σ debit = Σ credit (enforced by a SQL constraint trigger).
5. Posting is server-authoritative AND enforced in SQL. Client validation is UX only.
6. MVA status `{under_threshold | unntatt | registered_standard | registered_zero_rated}` drives all posting.
7. AI proposes; the rules engine validates; a human confirms. AI never writes to the ledger.
8. `OrgNr` (mod11) and `Kid` (mod10/mod11) are validated branded types.

## Entities (sketch — see spec §5 for detail)
- **Core:** organization, app_user, membership, contact, item, fiscal_year/period, account, vat_code,
  **invoice_counter**.
- **Sales:** quote, invoice (+ invoice_line), credit_note.
- **Purchases:** purchase (+ purchase_line), document.
- **Ledger:** voucher (bilag), posting (postering) — integrity-critical, immutable once posted.
- **Banking:** bank_account, bank_transaction, reconciliation.
- **VAT/audit:** vat_return, audit_log (append-only).

All money columns are `bigint` øre; every business table is tenant-scoped by `organization_id`.

## VAT logic (summary; rules in .claude/rules/vat.md)
- 50,000 NOK rolling-12-month registration threshold; tracked continuously.
- Output VAT only when registered_*. Input-VAT fork by status. Non-deductible cases encoded.
  Reverse charge posts both legs. Codes/accounts from the committed SAF-T lists.
