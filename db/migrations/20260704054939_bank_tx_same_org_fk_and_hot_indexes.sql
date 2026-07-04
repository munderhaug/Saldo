-- Review 2026-07-03 §11 (P2 db batch):
--
-- 1. `bank_transaction.matched_voucher_id` becomes a SAME-ORG composite FK. The plain
--    `REFERENCES voucher(id)` allowed a bank transaction to link a settlement voucher belonging to
--    ANOTHER tenant — RLS hides it from reads, but the write itself should be structurally
--    impossible (ADR 0012's belt-and-braces, like every other cross-row reference).
-- 2. Hot-path indexes the query patterns already rely on: `posting(account_id)` (reporting/
--    hovedbok aggregate per account) and `voucher(period_id)` (every per-year ledger read joins
--    voucher → fiscal_period).

-- migrate:up

ALTER TABLE bank_transaction
  DROP CONSTRAINT bank_transaction_matched_voucher_id_fkey;
-- NOT VALID + VALIDATE keeps the write-blocking scan window minimal (squawk); dbmate wraps the
-- migration in one tx, so the VALIDATE still runs before anything else commits against it.
ALTER TABLE bank_transaction
  ADD CONSTRAINT bank_transaction_matched_voucher_same_org_fk
  FOREIGN KEY (matched_voucher_id, organization_id)
  REFERENCES voucher (id, organization_id) NOT VALID;
ALTER TABLE bank_transaction
  VALIDATE CONSTRAINT bank_transaction_matched_voucher_same_org_fk;

CREATE INDEX posting_account_idx ON posting (account_id);
CREATE INDEX voucher_period_idx ON voucher (period_id);

-- migrate:down

DROP INDEX IF EXISTS voucher_period_idx;
DROP INDEX IF EXISTS posting_account_idx;

ALTER TABLE bank_transaction
  DROP CONSTRAINT bank_transaction_matched_voucher_same_org_fk;
ALTER TABLE bank_transaction
  ADD CONSTRAINT bank_transaction_matched_voucher_id_fkey
  FOREIGN KEY (matched_voucher_id) REFERENCES voucher(id);
