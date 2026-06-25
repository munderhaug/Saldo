-- Invoice → ledger posting link (build-spec §8.4, feat-invoice-ledger-posting, ADR 0043). When a sales
-- invoice / credit note is ISSUED, the route posts its AR voucher to the general ledger inside the same
-- issuing transaction (atomic with the gapless-number allocation). This migration adds the one missing
-- piece of state: a reference from the posted `voucher` back to the `invoice` it books, so the document
-- and its ledger entry are mutually traceable. The posting itself reuses the existing ledger guarantees
-- (.claude/rules/ledger-integrity.md) — balance, posted-completeness, period-lock, immutability — which
-- already cover voucher/posting; nothing about those changes here.

-- migrate:up

-- The voucher that books an invoice (NULL for every non-invoice voucher: manual, bank, …). A credit
-- note's reversing motbilag points at the credit-note document; `reverses_voucher_id` (already present)
-- links it to the original invoice's voucher.
ALTER TABLE voucher ADD COLUMN invoice_id uuid;

-- Same-org integrity: a voucher can only book an invoice of its OWN tenant (composite FK into the
-- invoice's (id, organization_id) unique target, mirroring the period/account same-org FKs). Greenfield:
-- voucher/invoice hold no rows yet, so validation is instantaneous and locks nothing.
-- squawk-ignore adding-foreign-key-constraint, constraint-missing-not-valid
ALTER TABLE voucher ADD CONSTRAINT voucher_invoice_same_org
  FOREIGN KEY (invoice_id, organization_id) REFERENCES invoice (id, organization_id);

-- At most ONE voucher per invoice — a document is booked exactly once (the issue transition is one-way
-- and the issued document is immutable, but this makes a double-post impossible at the storage layer).
-- Partial so the many vouchers with no invoice are unconstrained. Greenfield: builds instantly.
-- squawk-ignore prefer-robust-stmts, require-concurrent-index-creation
CREATE UNIQUE INDEX voucher_invoice_uniq ON voucher (invoice_id) WHERE invoice_id IS NOT NULL;

-- migrate:down

DROP INDEX IF EXISTS voucher_invoice_uniq;
ALTER TABLE voucher DROP CONSTRAINT IF EXISTS voucher_invoice_same_org;
ALTER TABLE voucher DROP COLUMN IF EXISTS invoice_id;
