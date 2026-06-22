-- Core ledger: tables + the four SQL integrity guarantees (balance, immutability,
-- period-lock, gapless invoice numbering) + RLS tenancy. See .claude/rules/ledger-integrity.md
-- and ADRs 0003 / 0007. All money columns are bigint (øre).

-- migrate:up

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── Organisation & reference ────────────────────────────────────────────────
CREATE TABLE organization (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_nr       char(9) NOT NULL UNIQUE,
  name         text    NOT NULL,
  mva_status   text    NOT NULL CHECK (mva_status IN
                 ('under_threshold','unntatt','registered_standard','registered_zero_rated')),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE account (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id),
  number          text NOT NULL,           -- from the SAF-T standard kontoplan
  name            text NOT NULL,
  type            text NOT NULL,
  UNIQUE (organization_id, number)
);

CREATE TABLE vat_code (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id),
  code            text NOT NULL,           -- SAF-T VAT code
  rate            numeric(5,4) NOT NULL,
  direction       text NOT NULL CHECK (direction IN ('output','input','none')),
  UNIQUE (organization_id, code)
);

CREATE TABLE fiscal_period (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id),
  year            int  NOT NULL,
  starts_on       date NOT NULL,
  ends_on         date NOT NULL,
  locked_at       timestamptz,
  UNIQUE (organization_id, year, starts_on)
);

-- ── Ledger (integrity-critical) ─────────────────────────────────────────────
CREATE TABLE voucher (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES organization(id),
  type                text NOT NULL CHECK (type IN ('sales','purchase','manual','bank','reversal')),
  period_id           uuid NOT NULL REFERENCES fiscal_period(id),
  reverses_voucher_id uuid REFERENCES voucher(id),
  posted_at           timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE posting (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid   NOT NULL REFERENCES organization(id),
  voucher_id      uuid   NOT NULL REFERENCES voucher(id),
  account_id      uuid   NOT NULL REFERENCES account(id),
  vat_code_id     uuid   REFERENCES vat_code(id),
  debit_ore       bigint NOT NULL DEFAULT 0 CHECK (debit_ore  >= 0),
  credit_ore      bigint NOT NULL DEFAULT 0 CHECK (credit_ore >= 0),
  -- exactly one side is non-zero
  CHECK ((debit_ore = 0) <> (credit_ore = 0))
);
CREATE INDEX posting_voucher_idx ON posting (voucher_id);

-- Gapless per-org invoice/credit-note numbering (ADR 0007 — NOT a SEQUENCE).
CREATE TABLE invoice_counter (
  organization_id uuid PRIMARY KEY REFERENCES organization(id),
  next            bigint NOT NULL DEFAULT 0
);

-- ── Integrity 1: every voucher balances (Σ debit = Σ credit), checked at commit ──
CREATE FUNCTION assert_voucher_balanced() RETURNS trigger AS $$
DECLARE
  vid uuid := COALESCE(NEW.voucher_id, OLD.voucher_id);
  d   bigint;
  c   bigint;
BEGIN
  SELECT COALESCE(sum(debit_ore), 0), COALESCE(sum(credit_ore), 0)
    INTO d, c FROM posting WHERE voucher_id = vid;
  IF d <> c THEN
    RAISE EXCEPTION 'Voucher % is unbalanced: debit=% credit=%', vid, d, c;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER posting_balance
  AFTER INSERT OR UPDATE OR DELETE ON posting
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION assert_voucher_balanced();

-- ── Integrity 2: posted vouchers & their postings are immutable ──────────────
CREATE FUNCTION block_posted_voucher_mutation() RETURNS trigger AS $$
BEGIN
  IF OLD.posted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot %, voucher % is posted (use a motbilag)', TG_OP, OLD.id;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER voucher_immutable
  BEFORE UPDATE OR DELETE ON voucher
  FOR EACH ROW EXECUTE FUNCTION block_posted_voucher_mutation();

CREATE FUNCTION block_posted_posting_mutation() RETURNS trigger AS $$
DECLARE posted timestamptz;
BEGIN
  SELECT posted_at INTO posted FROM voucher WHERE id = OLD.voucher_id;
  IF posted IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot %, postings of posted voucher % are immutable', TG_OP, OLD.voucher_id;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER posting_immutable
  BEFORE UPDATE OR DELETE ON posting
  FOR EACH ROW EXECUTE FUNCTION block_posted_posting_mutation();

-- ── Integrity 3: no postings into a locked period ───────────────────────────
CREATE FUNCTION block_locked_period() RETURNS trigger AS $$
DECLARE locked timestamptz;
BEGIN
  SELECT locked_at INTO locked FROM fiscal_period WHERE id = NEW.period_id;
  IF locked IS NOT NULL THEN
    RAISE EXCEPTION 'Period % is locked', NEW.period_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER voucher_period_lock
  BEFORE INSERT OR UPDATE ON voucher
  FOR EACH ROW EXECUTE FUNCTION block_locked_period();

-- ── Integrity 4: gapless invoice number allocation (call inside the issuing tx) ──
CREATE FUNCTION allocate_invoice_number(org uuid) RETURNS bigint AS $$
DECLARE n bigint;
BEGIN
  INSERT INTO invoice_counter (organization_id, next) VALUES (org, 1)
    ON CONFLICT (organization_id) DO UPDATE SET next = invoice_counter.next + 1
    RETURNING next INTO n;
  RETURN n;
END;
$$ LANGUAGE plpgsql;

-- ── Tenancy: RLS via the app.current_org GUC (defense-in-depth) ──────────────
ALTER TABLE organization  ENABLE ROW LEVEL SECURITY;
ALTER TABLE account       ENABLE ROW LEVEL SECURITY;
ALTER TABLE vat_code      ENABLE ROW LEVEL SECURITY;
ALTER TABLE fiscal_period ENABLE ROW LEVEL SECURITY;
ALTER TABLE voucher       ENABLE ROW LEVEL SECURITY;
ALTER TABLE posting       ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_isolation ON organization
  USING (id = current_setting('app.current_org', true)::uuid);
CREATE POLICY org_isolation ON account
  USING (organization_id = current_setting('app.current_org', true)::uuid);
CREATE POLICY org_isolation ON vat_code
  USING (organization_id = current_setting('app.current_org', true)::uuid);
CREATE POLICY org_isolation ON fiscal_period
  USING (organization_id = current_setting('app.current_org', true)::uuid);
CREATE POLICY org_isolation ON voucher
  USING (organization_id = current_setting('app.current_org', true)::uuid);
CREATE POLICY org_isolation ON posting
  USING (organization_id = current_setting('app.current_org', true)::uuid);

-- migrate:down

DROP FUNCTION IF EXISTS allocate_invoice_number(uuid);
DROP TRIGGER IF EXISTS voucher_period_lock ON voucher;
DROP FUNCTION IF EXISTS block_locked_period();
DROP TRIGGER IF EXISTS posting_immutable ON posting;
DROP FUNCTION IF EXISTS block_posted_posting_mutation();
DROP TRIGGER IF EXISTS voucher_immutable ON voucher;
DROP FUNCTION IF EXISTS block_posted_voucher_mutation();
DROP TRIGGER IF EXISTS posting_balance ON posting;
DROP FUNCTION IF EXISTS assert_voucher_balanced();
DROP TABLE IF EXISTS invoice_counter;
DROP TABLE IF EXISTS posting;
DROP TABLE IF EXISTS voucher;
DROP TABLE IF EXISTS fiscal_period;
DROP TABLE IF EXISTS vat_code;
DROP TABLE IF EXISTS account;
DROP TABLE IF EXISTS organization;
