-- Supplier invoices (build-spec §8.5, feat-supplier-invoices, ADR 0054): the accounts-payable side of
-- purchases — a RECEIVED supplier invoice the org records and books to the ledger. UNLIKE a sales
-- invoice we ISSUE, this document arrives already finalised by the supplier, so there is NO gapless
-- per-org number (the supplier's own invoice number is a free-text reference) and no issue lifecycle —
-- it is a `draft` while entered, then `posted` when its AP voucher is booked. From the moment it is
-- posted it is part of the system of record and append-only (.claude/rules/ledger-integrity.md),
-- mirroring voucher/posting and the sales `invoice`:
--   * IMMUTABILITY once posted — a trigger freezes every financial/identity column and blocks DELETE of
--     a posted document; a second trigger freezes its lines. A correction is a motbilag, never an edit.
--   * RLS tenancy — ENABLE + FORCE + a USING/WITH CHECK policy on app.current_org, plus a saldo_app
--     grant, like every tenant table.
--   * SAME-ORG composite FKs — supplier (contact), each line's cost account / VAT code, and the posting
--     voucher's back-link are all pinned to the document's own org, so a reference can never cross
--     tenants even though FK targets are not RLS-constrained.
--   * money is integer øre (bigint); a fractional quantity is exact numeric (no binary-float drift).
-- The supplier snapshot (name / org-nr) is PERSONAL DATA (.claude/rules/data-handling.md) when the
-- supplier is an ENK or private person; frozen onto the posted document it falls under the 5-year
-- statutory retention. A per-line `deductible` flag + `non_deductible_reason` encode the
-- non-deductible-even-when-registered cases (representasjon / restricted vehicle / private use, §4.3).

-- migrate:up

CREATE TABLE supplier_invoice (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id         uuid NOT NULL REFERENCES organization(id),
  status                  text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','posted')),
  -- Supplier link (optional — a one-off purchase may be ad-hoc) + the frozen snapshot (authoritative).
  supplier_id             uuid,
  supplier_name           text NOT NULL,        -- personal: an ENK / private person's name
  supplier_org_nr         char(9),              -- personal: an ENK's identifies a natural person
  -- The supplier's OWN invoice number (a free-text reference, NOT our gapless counter) + their KID.
  supplier_invoice_number text,
  kid                     text,
  currency                char(3) NOT NULL DEFAULT 'NOK',
  invoice_date            date,                 -- the document date the supplier dated it
  due_date                date,
  -- Cached document totals in øre (derived from the lines by the domain; frozen with the doc on posting).
  net_ore                 bigint NOT NULL DEFAULT 0 CHECK (net_ore   >= 0),
  vat_ore                 bigint NOT NULL DEFAULT 0 CHECK (vat_ore   >= 0),
  gross_ore               bigint NOT NULL DEFAULT 0 CHECK (gross_ore >= 0),
  notes                   text,                 -- personal: free text, may describe a natural person
  posted_at               timestamptz,          -- the draft→posted boundary; the immutability trigger keys on it
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  -- posted_at exists exactly for a posted document.
  CONSTRAINT supplier_invoice_posted_consistent CHECK ((posted_at IS NOT NULL) = (status = 'posted')),
  -- Due never precedes the invoice date.
  CONSTRAINT supplier_invoice_due_after_date
    CHECK (invoice_date IS NULL OR due_date IS NULL OR due_date >= invoice_date),
  -- Composite-FK target for the lines + the posting voucher's back-link (same-org integrity).
  CONSTRAINT supplier_invoice_id_org_uniq UNIQUE (id, organization_id),
  CONSTRAINT supplier_invoice_supplier_same_org
    FOREIGN KEY (supplier_id, organization_id) REFERENCES contact (id, organization_id)
);
CREATE INDEX supplier_invoice_org_idx        ON supplier_invoice (organization_id);
CREATE INDEX supplier_invoice_org_status_idx ON supplier_invoice (organization_id, status);
CREATE INDEX supplier_invoice_supplier_idx   ON supplier_invoice (supplier_id) WHERE supplier_id IS NOT NULL;

CREATE TABLE supplier_invoice_line (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       uuid NOT NULL REFERENCES organization(id),
  supplier_invoice_id   uuid NOT NULL,
  line_no               int  NOT NULL CHECK (line_no >= 1),  -- 1-based order within the document
  description           text NOT NULL,
  -- Exact decimal quantity — numeric, never a float; positive.
  quantity              numeric(14,3) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit                  text NOT NULL DEFAULT 'stk',
  unit_price_ore        bigint NOT NULL DEFAULT 0 CHECK (unit_price_ore >= 0),  -- net, excl. VAT
  -- The cost account + SAF-T VAT code (same-org composite FKs); the VAT code drives the line's input VAT.
  account_id            uuid NOT NULL,
  vat_code_id           uuid NOT NULL,
  -- The non-deductible-even-when-registered fork (§4.3): a line marked non-deductible books its gross to
  -- cost (no input-VAT split). A reason is recorded exactly when the line is non-deductible (auditable).
  deductible            boolean NOT NULL DEFAULT true,
  non_deductible_reason text CHECK (non_deductible_reason IN
                          ('representasjon','restricted_vehicle','private_use')),
  -- Cached line amounts in øre (derived by the domain; frozen with the document on posting).
  net_ore               bigint NOT NULL DEFAULT 0 CHECK (net_ore >= 0),
  vat_ore               bigint NOT NULL DEFAULT 0 CHECK (vat_ore >= 0),
  CONSTRAINT supplier_invoice_line_no_uniq UNIQUE (supplier_invoice_id, line_no),
  -- A reason is present iff the line is non-deductible — the two never disagree.
  CONSTRAINT supplier_invoice_line_reason_consistent
    CHECK ((NOT deductible) = (non_deductible_reason IS NOT NULL)),
  CONSTRAINT supplier_invoice_line_doc_same_org
    FOREIGN KEY (supplier_invoice_id, organization_id) REFERENCES supplier_invoice (id, organization_id),
  CONSTRAINT supplier_invoice_line_account_same_org
    FOREIGN KEY (account_id, organization_id)  REFERENCES account  (id, organization_id),
  CONSTRAINT supplier_invoice_line_vat_code_same_org
    FOREIGN KEY (vat_code_id, organization_id) REFERENCES vat_code (id, organization_id)
);
CREATE INDEX supplier_invoice_line_doc_idx ON supplier_invoice_line (supplier_invoice_id);

-- ── Posting back-link: the voucher that books a supplier invoice ───────────────────────────────────
-- Mirrors voucher.invoice_id (the sales link). NULL for every non-supplier voucher. Same-org composite
-- FK (a voucher can only book a supplier invoice of its OWN tenant); at most ONE voucher per document.
ALTER TABLE voucher ADD COLUMN supplier_invoice_id uuid;
-- squawk-ignore adding-foreign-key-constraint, constraint-missing-not-valid
ALTER TABLE voucher ADD CONSTRAINT voucher_supplier_invoice_same_org
  FOREIGN KEY (supplier_invoice_id, organization_id) REFERENCES supplier_invoice (id, organization_id);
-- squawk-ignore prefer-robust-stmts, require-concurrent-index-creation
CREATE UNIQUE INDEX voucher_supplier_invoice_uniq
  ON voucher (supplier_invoice_id) WHERE supplier_invoice_id IS NOT NULL;

-- ── Immutability: a posted supplier invoice is append-only (correct via a motbilag) ───────────────
-- Mirrors the sales-invoice immutability. A posted document is frozen entirely; a draft is editable.
-- The draft→posted UPDATE that first sets posted_at is permitted (OLD.posted_at IS NULL then).
CREATE FUNCTION block_posted_supplier_invoice_mutation() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.posted_at IS NOT NULL THEN
      RAISE EXCEPTION 'Cannot delete posted supplier invoice % (correct via a motbilag)', OLD.id;
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.posted_at IS NOT NULL
     AND ROW(NEW.status, NEW.supplier_id, NEW.supplier_name, NEW.supplier_org_nr,
             NEW.supplier_invoice_number, NEW.kid, NEW.currency, NEW.invoice_date, NEW.due_date,
             NEW.net_ore, NEW.vat_ore, NEW.gross_ore, NEW.notes, NEW.posted_at, NEW.created_at,
             NEW.organization_id, NEW.id)
         IS DISTINCT FROM
         ROW(OLD.status, OLD.supplier_id, OLD.supplier_name, OLD.supplier_org_nr,
             OLD.supplier_invoice_number, OLD.kid, OLD.currency, OLD.invoice_date, OLD.due_date,
             OLD.net_ore, OLD.vat_ore, OLD.gross_ore, OLD.notes, OLD.posted_at, OLD.created_at,
             OLD.organization_id, OLD.id)
  THEN
    RAISE EXCEPTION 'Posted supplier invoice % is immutable (correct via a motbilag)', OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER supplier_invoice_immutable
  BEFORE UPDATE OR DELETE ON supplier_invoice
  FOR EACH ROW EXECUTE FUNCTION block_posted_supplier_invoice_mutation();

-- Lines of a posted document are frozen entirely (no INSERT/UPDATE/DELETE once the parent is posted).
CREATE FUNCTION block_posted_supplier_invoice_line_mutation() RETURNS trigger AS $$
DECLARE posted timestamptz;
BEGIN
  SELECT s.posted_at INTO posted
    FROM supplier_invoice s WHERE s.id = COALESCE(NEW.supplier_invoice_id, OLD.supplier_invoice_id);
  IF posted IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot %, lines of posted supplier invoice % are immutable', TG_OP,
      COALESCE(NEW.supplier_invoice_id, OLD.supplier_invoice_id);
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER supplier_invoice_line_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON supplier_invoice_line
  FOR EACH ROW EXECUTE FUNCTION block_posted_supplier_invoice_line_mutation();

-- ── Tenancy: same regime as every other tenant table (ADR 0012) ───────────────────────────────────
ALTER TABLE supplier_invoice      ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_invoice      FORCE  ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON supplier_invoice
  USING      (organization_id = current_setting('app.current_org', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org', true)::uuid);

ALTER TABLE supplier_invoice_line ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_invoice_line FORCE  ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON supplier_invoice_line
  USING      (organization_id = current_setting('app.current_org', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org', true)::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON supplier_invoice      TO saldo_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON supplier_invoice_line TO saldo_app;

-- migrate:down

DROP INDEX IF EXISTS voucher_supplier_invoice_uniq;
ALTER TABLE voucher DROP CONSTRAINT IF EXISTS voucher_supplier_invoice_same_org;
ALTER TABLE voucher DROP COLUMN IF EXISTS supplier_invoice_id;
DROP TRIGGER IF EXISTS supplier_invoice_line_immutable ON supplier_invoice_line;
DROP FUNCTION IF EXISTS block_posted_supplier_invoice_line_mutation();
DROP TRIGGER IF EXISTS supplier_invoice_immutable ON supplier_invoice;
DROP FUNCTION IF EXISTS block_posted_supplier_invoice_mutation();
DROP TABLE IF EXISTS supplier_invoice_line;
DROP TABLE IF EXISTS supplier_invoice;
