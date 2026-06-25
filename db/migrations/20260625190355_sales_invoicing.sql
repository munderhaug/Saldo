-- Sales & invoicing (build-spec §8.4, feat-sales-invoicing, ADR 0042): sales documents — quote /
-- invoice / credit note — with per-line MVA across all rates. UNLIKE the contacts/products registers
-- (mutable reference data), an ISSUED invoice is part of the system of record and append-only, so the
-- ledger integrity guarantees apply here (.claude/rules/ledger-integrity.md), mirroring voucher/posting:
--   * GAPLESS numbering — an invoice/credit note draws its number from the per-org `invoice_counter`
--     via allocate_invoice_number() inside the issuing tx (ADR 0007), NEVER a SEQUENCE (gaps on
--     rollback). A quote never draws a number.
--   * IMMUTABILITY once issued — a trigger blocks DELETE and freezes every financial/identity column
--     of an issued document (only the lifecycle status + its timestamps may still advance); a second
--     trigger freezes its lines. Correction is via a kreditnota, never an edit (append-only).
--   * RLS tenancy — ENABLE + FORCE + a USING/WITH CHECK policy on app.current_org, and a saldo_app
--     grant, like every tenant table.
--   * SAME-ORG composite FKs — customer (contact), each line's account / VAT code / catalogue source,
--     and a credit note's credited invoice are all pinned to the document's own org via composite FKs
--     (the contacts/products precedent), so a reference can never cross tenants even though FK targets
--     are not RLS-constrained.
--   * money is integer øre (bigint); a fractional quantity is exact numeric (no binary-float drift).
-- The customer snapshot (name/e-mail/org-nr/address) is PERSONAL DATA (.claude/rules/data-handling.md):
-- frozen onto the issued document, it falls under the 5-year statutory retention (not erasable while held).

-- migrate:up

-- Composite-unique targets so a same-org composite FK into these registers is possible (account /
-- vat_code already gained theirs in the contacts migration). Greenfield: instantaneous, locks nothing.
-- squawk-ignore disallowed-unique-constraint, constraint-missing-not-valid
ALTER TABLE contact ADD CONSTRAINT contact_id_org_uniq UNIQUE (id, organization_id);
-- squawk-ignore disallowed-unique-constraint, constraint-missing-not-valid
ALTER TABLE product ADD CONSTRAINT product_id_org_uniq UNIQUE (id, organization_id);

CREATE TABLE invoice (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES organization(id),
  kind                text NOT NULL CHECK (kind IN ('quote','invoice','credit_note')),
  status              text NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','issued','sent','viewed','paid','overdue')),
  -- Gapless per-org number, allocated on issue (NULL while a draft, and ALWAYS NULL for a quote).
  invoice_number      bigint,
  -- Customer link (optional — an invoice may be fully ad-hoc) + the frozen snapshot (authoritative).
  customer_id         uuid,
  customer_name       text NOT NULL,         -- personal: an ENK / private person's name
  customer_email      text,                  -- personal
  customer_org_nr     char(9),               -- personal: an ENK's identifies a natural person
  customer_address    text,                  -- personal: an ENK's may be a home address
  currency            char(3)  NOT NULL DEFAULT 'NOK',
  language            text     NOT NULL DEFAULT 'nb' CHECK (language IN ('nb','en')),
  issue_date          date,                  -- set on issue
  due_date            date,
  -- Per-invoice KID for reconciliation (domain `invoiceKid`); set with the number, on issue.
  kid                 text,
  -- Credit note only: the issued invoice this document corrects (same-org composite FK below).
  credits_invoice_id  uuid,
  -- Cached document totals in øre (derived from the lines by the domain; frozen with the doc on issue).
  net_ore             bigint NOT NULL DEFAULT 0 CHECK (net_ore   >= 0),
  vat_ore             bigint NOT NULL DEFAULT 0 CHECK (vat_ore   >= 0),
  gross_ore           bigint NOT NULL DEFAULT 0 CHECK (gross_ore >= 0),
  notes               text,                  -- personal: free text, may describe a natural person
  -- Lifecycle timestamps (may still advance after issue; everything else is frozen).
  sent_at             timestamptz,
  viewed_at           timestamptz,
  paid_at             timestamptz,
  issued_at           timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  -- A number exists exactly for an issued invoice/credit note; a quote never has one, a draft never has one.
  CONSTRAINT invoice_number_when_issued
    CHECK ((invoice_number IS NOT NULL) = (kind <> 'quote' AND status <> 'draft')),
  -- issued_at marks the draft→issued boundary for EVERY kind (the immutability trigger keys on it).
  CONSTRAINT invoice_issued_at_consistent
    CHECK ((issued_at IS NOT NULL) = (status <> 'draft')),
  -- A KID accompanies a number (both minted on issue), and only then.
  CONSTRAINT invoice_kid_with_number
    CHECK ((kid IS NOT NULL) = (invoice_number IS NOT NULL)),
  -- Only a credit note credits an invoice.
  CONSTRAINT invoice_credits_only_credit_note
    CHECK (credits_invoice_id IS NULL OR kind = 'credit_note'),
  -- Due never precedes issue.
  CONSTRAINT invoice_due_after_issue
    CHECK (issue_date IS NULL OR due_date IS NULL OR due_date >= issue_date),
  -- The per-org number is unique (gaplessness is enforced by the counter; this guards double-use).
  CONSTRAINT invoice_org_number_uniq UNIQUE (organization_id, invoice_number),
  -- Composite-FK target for the lines + a credit note's link (same-org integrity).
  CONSTRAINT invoice_id_org_uniq UNIQUE (id, organization_id),
  CONSTRAINT invoice_customer_same_org
    FOREIGN KEY (customer_id, organization_id) REFERENCES contact (id, organization_id),
  CONSTRAINT invoice_credits_same_org
    FOREIGN KEY (credits_invoice_id, organization_id) REFERENCES invoice (id, organization_id)
);
CREATE INDEX invoice_org_idx          ON invoice (organization_id);
CREATE INDEX invoice_org_status_idx   ON invoice (organization_id, status);
CREATE INDEX invoice_credits_idx      ON invoice (credits_invoice_id) WHERE credits_invoice_id IS NOT NULL;

CREATE TABLE invoice_line (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id),
  invoice_id      uuid NOT NULL,
  line_no         int  NOT NULL CHECK (line_no >= 1),  -- 1-based order within the document
  -- Optional catalogue source the line was prefilled from (same-org composite FK below).
  product_id      uuid,
  description     text NOT NULL,
  -- Exact decimal quantity (2,5 timer, 0,75 kg) — numeric, never a float; positive.
  quantity        numeric(14,3) NOT NULL CHECK (quantity > 0),
  unit            text NOT NULL DEFAULT 'stk',
  unit_price_ore  bigint NOT NULL DEFAULT 0 CHECK (unit_price_ore >= 0),  -- net, excl. VAT
  -- The revenue account + SAF-T VAT code (same-org composite FKs); the VAT code drives the line's MVA.
  account_id      uuid NOT NULL,
  vat_code_id     uuid NOT NULL,
  -- Cached line amounts in øre (derived by the domain; frozen with the document on issue).
  net_ore         bigint NOT NULL DEFAULT 0 CHECK (net_ore >= 0),
  vat_ore         bigint NOT NULL DEFAULT 0 CHECK (vat_ore >= 0),
  CONSTRAINT invoice_line_no_uniq UNIQUE (invoice_id, line_no),
  CONSTRAINT invoice_line_invoice_same_org
    FOREIGN KEY (invoice_id, organization_id)  REFERENCES invoice (id, organization_id),
  CONSTRAINT invoice_line_account_same_org
    FOREIGN KEY (account_id, organization_id)  REFERENCES account (id, organization_id),
  CONSTRAINT invoice_line_vat_code_same_org
    FOREIGN KEY (vat_code_id, organization_id) REFERENCES vat_code (id, organization_id),
  CONSTRAINT invoice_line_product_same_org
    FOREIGN KEY (product_id, organization_id)  REFERENCES product (id, organization_id)
);
CREATE INDEX invoice_line_invoice_idx ON invoice_line (invoice_id);

-- ── Immutability: an issued document is append-only (correct via kreditnota) ──────────────────────
-- Mirrors voucher/posting immutability, with one nuance: an invoice's LIFECYCLE must still advance
-- after issue (issued → sent → viewed → paid / overdue), so the status column + its timestamps may
-- change while every financial/identity column is frozen. DELETE of an issued document is blocked
-- outright. (Reverting to draft is impossible: issued_at is frozen non-null, and the CHECK above ties
-- status='draft' to issued_at IS NULL.)
CREATE FUNCTION block_issued_invoice_mutation() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.issued_at IS NOT NULL THEN
      RAISE EXCEPTION 'Cannot delete issued invoice % (correct via a kreditnota)', OLD.id;
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.issued_at IS NOT NULL
     AND ROW(NEW.kind, NEW.invoice_number, NEW.customer_id, NEW.customer_name, NEW.customer_email,
             NEW.customer_org_nr, NEW.customer_address, NEW.currency, NEW.language, NEW.issue_date,
             NEW.due_date, NEW.kid, NEW.credits_invoice_id, NEW.net_ore, NEW.vat_ore, NEW.gross_ore,
             NEW.notes, NEW.issued_at, NEW.created_at, NEW.organization_id, NEW.id)
         IS DISTINCT FROM
         ROW(OLD.kind, OLD.invoice_number, OLD.customer_id, OLD.customer_name, OLD.customer_email,
             OLD.customer_org_nr, OLD.customer_address, OLD.currency, OLD.language, OLD.issue_date,
             OLD.due_date, OLD.kid, OLD.credits_invoice_id, OLD.net_ore, OLD.vat_ore, OLD.gross_ore,
             OLD.notes, OLD.issued_at, OLD.created_at, OLD.organization_id, OLD.id)
  THEN
    RAISE EXCEPTION 'Issued invoice % is immutable; only its lifecycle status may change (correct via a kreditnota)', OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER invoice_immutable
  BEFORE UPDATE OR DELETE ON invoice
  FOR EACH ROW EXECUTE FUNCTION block_issued_invoice_mutation();

-- Lines of an issued document are frozen entirely (no INSERT/UPDATE/DELETE once the parent is issued).
CREATE FUNCTION block_issued_invoice_line_mutation() RETURNS trigger AS $$
DECLARE issued timestamptz;
BEGIN
  SELECT i.issued_at INTO issued
    FROM invoice i WHERE i.id = COALESCE(NEW.invoice_id, OLD.invoice_id);
  IF issued IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot %, lines of issued invoice % are immutable', TG_OP,
      COALESCE(NEW.invoice_id, OLD.invoice_id);
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER invoice_line_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON invoice_line
  FOR EACH ROW EXECUTE FUNCTION block_issued_invoice_line_mutation();

-- ── Tenancy: same regime as every other tenant table (ADR 0012) ───────────────────────────────────
ALTER TABLE invoice      ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice      FORCE  ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON invoice
  USING      (organization_id = current_setting('app.current_org', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org', true)::uuid);

ALTER TABLE invoice_line ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_line FORCE  ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON invoice_line
  USING      (organization_id = current_setting('app.current_org', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org', true)::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON invoice      TO saldo_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON invoice_line TO saldo_app;

-- migrate:down

DROP TRIGGER IF EXISTS invoice_line_immutable ON invoice_line;
DROP FUNCTION IF EXISTS block_issued_invoice_line_mutation();
DROP TRIGGER IF EXISTS invoice_immutable ON invoice;
DROP FUNCTION IF EXISTS block_issued_invoice_mutation();
DROP TABLE IF EXISTS invoice_line;
DROP TABLE IF EXISTS invoice;
ALTER TABLE product DROP CONSTRAINT IF EXISTS product_id_org_uniq;
ALTER TABLE contact DROP CONSTRAINT IF EXISTS contact_id_org_uniq;
