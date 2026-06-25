-- Products & services catalogue (build-spec §8.3, feat-products-catalog): a catalogue of goods/
-- services, each with a default account + VAT code + unit + net price and a goods/service flag. This
-- is REFERENCE data, not the ledger — catalogue items are mutable, so there are no immutability/balance
-- triggers here. The integrity that DOES apply (.claude/rules/ledger-integrity.md):
--   * RLS tenancy — ENABLE + FORCE + a USING/WITH CHECK policy on app.current_org, plus a saldo_app
--     grant, like every tenant table (a new tenant table MUST do all three in its own migration);
--   * same-org defaults — the default account/VAT code are pinned to the item's own org via a composite
--     FK (the contact↔default / fiscal_period↔voucher pattern), so a default can never point at another
--     tenant's row even though FK targets are not constrained by RLS. This reuses the (id,
--     organization_id) UNIQUE constraints the contacts migration already added to account/vat_code.
--   * money is integer øre — the unit price is a bigint, never a float (money.md).
-- A catalogue item describes a good/service, not a natural person: no personal-data columns here.

-- migrate:up

CREATE TABLE product (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES organization(id),
  kind                text NOT NULL CHECK (kind IN ('goods','service')),
  name                text NOT NULL,
  -- Optional longer line text; the name is the short catalogue label.
  description         text,
  -- Unit of measure (free text so it fits any trade: stk, time, kg, m², …).
  unit                text NOT NULL DEFAULT 'stk',
  -- Net unit price excl. VAT, integer øre (money.md). Non-negative.
  unit_price_ore      bigint NOT NULL DEFAULT 0 CHECK (unit_price_ore >= 0),
  -- Per-item defaults (§8.3). Account/VAT code are optional and same-org (composite FK below); they
  -- prefill an invoice line later. VAT code is source-grounded — a row in the org's provisioned list.
  default_account_id  uuid,
  default_vat_code_id uuid,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  -- A default may only reference this item's OWN org's account/VAT code (storage-layer, not just RLS).
  CONSTRAINT product_default_account_same_org
    FOREIGN KEY (default_account_id, organization_id)  REFERENCES account  (id, organization_id),
  CONSTRAINT product_default_vat_code_same_org
    FOREIGN KEY (default_vat_code_id, organization_id) REFERENCES vat_code (id, organization_id)
);
CREATE INDEX product_org_idx ON product (organization_id);

-- Tenancy: same regime as every other tenant table (ADR 0012).
ALTER TABLE product ENABLE ROW LEVEL SECURITY;
ALTER TABLE product FORCE  ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON product
  USING      (organization_id = current_setting('app.current_org', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org', true)::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON product TO saldo_app;

-- migrate:down

DROP TABLE IF EXISTS product;
