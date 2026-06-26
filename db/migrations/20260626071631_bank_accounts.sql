-- Banking import (build-spec §8.7 / §9, feat-banking-import): the reconciliation substrate's persistence
-- layer. Two tenant-scoped tables:
--   * bank_account     — a bank account the org imports from (mutable REFERENCE data: a user-given
--                        label, the account number/IBAN, currency, and an optional GoCardless account id
--                        that links it to live AIS fetches). No immutability triggers — it is editable.
--   * bank_transaction — an IMPORTED FACT (append-only): the normalised transaction (signed øre, dates,
--                        remittance, counterparty) plus the source it came from. Posting does NOT happen
--                        here (that is reconciliation) — but the imported fact itself is immutable once
--                        written, so re-imports/reconciliation can never rewrite history. The
--                        reconciliation columns (kid, matched_voucher_id) are the ONLY fields a later
--                        UPDATE may change; everything imported is frozen by a trigger.
--
-- Integrity that applies (.claude/rules/ledger-integrity.md):
--   * RLS tenancy — ENABLE + FORCE + USING/WITH CHECK on app.current_org + a saldo_app grant, on BOTH
--     tables (every tenant table does all three in its own migration);
--   * same-org link — bank_transaction.bank_account_id is pinned to the same org via a composite FK
--     (the contact↔account pattern), so a transaction can never attach to another tenant's account;
--   * idempotent import — a UNIQUE (bank_account_id, external_ref) makes re-importing the same window a
--     no-op (the dedup key is the source id, or a content fingerprint when the source gave none);
--   * append-only — a trigger blocks DELETE and blocks UPDATE of every imported column.
--
-- Money is bigint øre (signed: + = into the account, − = out). Account number, counterparty name and
-- remittance text are personal/financial data (.claude/rules/data-handling.md); storage stays in the EU
-- Postgres and these columns are never logged.

-- migrate:up

CREATE TABLE bank_account (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      uuid NOT NULL REFERENCES organization(id),
  label                text NOT NULL,
  account_number       text,                  -- personal/financial: BBAN or IBAN; NULL when not given
  currency             char(3) NOT NULL DEFAULT 'NOK',
  -- Opaque GoCardless account id; NULL = not linked to live AIS (camt.054/CSV import still works).
  gocardless_account_id text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  -- Composite-unique target so bank_transaction can reference (id, organization_id) with a same-org FK.
  CONSTRAINT bank_account_id_org_uniq UNIQUE (id, organization_id)
);
CREATE INDEX bank_account_org_idx ON bank_account (organization_id);

CREATE TABLE bank_transaction (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      uuid NOT NULL REFERENCES organization(id),
  bank_account_id      uuid NOT NULL,
  -- Which import source produced this fact (the one provider-agnostic interface, build-spec §8.7).
  source               text NOT NULL CHECK (source IN ('camt054','csv','gocardless')),
  -- Idempotency key: the source's stable id, or a content fingerprint when it gave none (domain
  -- transactionDedupKey). UNIQUE per account so a re-import never duplicates a transaction.
  external_ref         text NOT NULL,
  -- Normalised imported fact. amount_ore is SIGNED: + = credit (in), − = debit (out).
  amount_ore           bigint NOT NULL,
  currency             char(3) NOT NULL,
  booking_date         date,
  value_date           date,
  remittance_info      text,                  -- personal: free-text message / may carry a KID
  counterparty         text,                  -- personal: counterparty name
  -- Reconciliation columns — the ONLY mutable fields (set by the downstream matching task, not here).
  kid                  text,                  -- parsed/matched KID (nullable; matching is out of scope here)
  matched_voucher_id   uuid REFERENCES voucher(id),  -- set when reconciled to a ledger voucher
  imported_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bank_transaction_external_ref_uniq UNIQUE (bank_account_id, external_ref),
  -- The account must belong to the SAME org (storage-layer guarantee, not just RLS visibility).
  CONSTRAINT bank_transaction_account_same_org
    FOREIGN KEY (bank_account_id, organization_id) REFERENCES bank_account (id, organization_id)
);
CREATE INDEX bank_transaction_org_idx     ON bank_transaction (organization_id);
CREATE INDEX bank_transaction_account_idx ON bank_transaction (bank_account_id, booking_date);

-- Append-only: an imported transaction is a fact. DELETE is always blocked; UPDATE may change ONLY the
-- reconciliation columns (kid, matched_voucher_id) — every imported column is frozen.
CREATE FUNCTION block_bank_transaction_mutation() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Cannot delete bank transaction % (imported transactions are append-only)', OLD.id;
  END IF;
  IF ROW(NEW.organization_id, NEW.bank_account_id, NEW.source, NEW.external_ref, NEW.amount_ore,
         NEW.currency, NEW.booking_date, NEW.value_date, NEW.remittance_info, NEW.counterparty,
         NEW.imported_at, NEW.id)
     IS DISTINCT FROM
     ROW(OLD.organization_id, OLD.bank_account_id, OLD.source, OLD.external_ref, OLD.amount_ore,
         OLD.currency, OLD.booking_date, OLD.value_date, OLD.remittance_info, OLD.counterparty,
         OLD.imported_at, OLD.id)
  THEN
    RAISE EXCEPTION 'Imported bank transaction % is immutable; only reconciliation fields may change', OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER bank_transaction_append_only
  BEFORE UPDATE OR DELETE ON bank_transaction
  FOR EACH ROW EXECUTE FUNCTION block_bank_transaction_mutation();

-- Tenancy: same regime as every other tenant table (ADR 0012).
ALTER TABLE bank_account ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_account FORCE  ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON bank_account
  USING      (organization_id = current_setting('app.current_org', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org', true)::uuid);

ALTER TABLE bank_transaction ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_transaction FORCE  ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON bank_transaction
  USING      (organization_id = current_setting('app.current_org', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org', true)::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON bank_account     TO saldo_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON bank_transaction TO saldo_app;

-- migrate:down

DROP TABLE IF EXISTS bank_transaction;
DROP FUNCTION IF EXISTS block_bank_transaction_mutation();
DROP TABLE IF EXISTS bank_account;
