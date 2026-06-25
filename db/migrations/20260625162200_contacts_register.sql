-- Contacts register (build-spec §8.2, feat-contacts-register): customers & suppliers in ONE table,
-- with a per-contact MVA status and per-contact defaults (payment terms, default account, VAT code,
-- currency, language). This is REFERENCE data, not the ledger: contacts are mutable, so there are no
-- immutability/balance triggers here. The integrity that DOES apply (.claude/rules/ledger-integrity.md):
--   * RLS tenancy — ENABLE + FORCE + a USING/WITH CHECK policy on app.current_org, and a saldo_app
--     grant, like every tenant table (a new tenant table MUST do all three in its own migration);
--   * same-org defaults — the default account/VAT code are pinned to the contact's own org via a
--     composite FK (the fiscal_period↔voucher pattern), so a default can never point at another
--     tenant's row even though FK targets are not constrained by RLS.
-- Contact name/address/email/phone are personal data (.claude/rules/data-handling.md): erasure for a
-- contact not under statutory hold is a later concern; storage stays inside the EU Postgres.

-- migrate:up

-- Composite-unique targets so a same-org composite FK is possible (id is already unique alone; this
-- adds the (id, organization_id) pair the FK references). Greenfield: instantaneous, locks nothing.
-- squawk-ignore disallowed-unique-constraint, constraint-missing-not-valid
ALTER TABLE account  ADD CONSTRAINT account_id_org_uniq  UNIQUE (id, organization_id);
-- squawk-ignore disallowed-unique-constraint, constraint-missing-not-valid
ALTER TABLE vat_code ADD CONSTRAINT vat_code_id_org_uniq UNIQUE (id, organization_id);

CREATE TABLE contact (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES organization(id),
  -- Independent roles: a contact may be a customer, a supplier, or both. At least one is required.
  is_customer         boolean NOT NULL DEFAULT false,
  is_supplier         boolean NOT NULL DEFAULT false,
  org_nr              char(9),               -- personal: NULL for a private person; an ENK's identifies one
  name                text NOT NULL,         -- personal: an ENK / private person's name
  email               text,                  -- personal
  phone               text,                  -- personal
  -- Primary address inline (multiple addresses are a tracked follow-on).
  address_line        text,                  -- personal: an ENK's may be a home address
  postal_code         text,
  city                text,
  country_code        char(2) NOT NULL DEFAULT 'NO',
  -- Per-contact MVA status — the same four-state vocabulary as the org, stored as informational
  -- metadata about the counterparty. NOT a posting driver: posting keys off the line's SAF-T VAT code,
  -- and reverse charge keys off the supplier's foreign domicile (country_code) — never this column.
  mva_status          text NOT NULL CHECK (mva_status IN
                        ('under_threshold','unntatt','registered_standard','registered_zero_rated')),
  -- Per-contact defaults (§8.2). Account/VAT code are optional and same-org (composite FK below).
  payment_terms_days  int  NOT NULL DEFAULT 14 CHECK (payment_terms_days BETWEEN 0 AND 365),
  default_account_id  uuid,
  default_vat_code_id uuid,
  currency            char(3) NOT NULL DEFAULT 'NOK',
  language            text NOT NULL DEFAULT 'nb' CHECK (language IN ('nb','en')),
  notes               text,                  -- personal: free text, may describe a natural person
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CHECK (is_customer OR is_supplier),
  -- A default may only reference this contact's OWN org's account/VAT code (storage-layer, not just RLS).
  CONSTRAINT contact_default_account_same_org
    FOREIGN KEY (default_account_id, organization_id)  REFERENCES account  (id, organization_id),
  CONSTRAINT contact_default_vat_code_same_org
    FOREIGN KEY (default_vat_code_id, organization_id) REFERENCES vat_code (id, organization_id)
);
CREATE INDEX contact_org_idx ON contact (organization_id);

-- Tenancy: same regime as every other tenant table (ADR 0012).
ALTER TABLE contact ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact FORCE  ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON contact
  USING      (organization_id = current_setting('app.current_org', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org', true)::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON contact TO saldo_app;

-- migrate:down

DROP TABLE IF EXISTS contact;
ALTER TABLE vat_code DROP CONSTRAINT IF EXISTS vat_code_id_org_uniq;
ALTER TABLE account  DROP CONSTRAINT IF EXISTS account_id_org_uniq;
