-- Ledger integrity gaps (ADR 0018, .claude/rules/ledger-integrity.md). Closes four concrete holes in
-- the invariants the ledger relies on, each proven by a Testcontainers test of the BAD case:
--   1. Period-lock hole: the lock was enforced on `voucher` only, so postings could still be
--      added/changed/removed on an existing UNPOSTED voucher whose period was locked afterwards.
--   2. Empty / dangling / half-posted vouchers: nothing required a POSTED voucher to have >= 2
--      postings and balance (the balance trigger treats 0 = 0 as valid).
--   3. Overlapping fiscal periods: a tenant could create two periods whose date ranges overlap.
--   4. Cross-org period reference: a voucher could point at another org's period (only RLS visibility,
--      not a hard constraint, prevented it).

-- migrate:up

-- ── 1. Period lock also covers postings (and voucher DELETE) ──────────────────
-- Forward the lock to the posting side: any INSERT/UPDATE/DELETE of a posting whose voucher sits in a
-- locked period is rejected. Look the period up through the voucher (postings carry no period_id).
CREATE FUNCTION block_locked_period_posting() RETURNS trigger AS $$
DECLARE
  locked timestamptz;
  vid uuid := COALESCE(NEW.voucher_id, OLD.voucher_id);
BEGIN
  SELECT fp.locked_at INTO locked
    FROM voucher v JOIN fiscal_period fp ON fp.id = v.period_id
    WHERE v.id = vid;
  IF locked IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot %, the period for voucher % is locked', TG_OP, vid;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER posting_period_lock
  BEFORE INSERT OR UPDATE OR DELETE ON posting
  FOR EACH ROW EXECUTE FUNCTION block_locked_period_posting();

-- Close the matching voucher-side gap: the lock fired on INSERT/UPDATE but not DELETE, so an unposted
-- voucher in a now-locked period could be deleted. COALESCE so the function works for DELETE too.
CREATE OR REPLACE FUNCTION block_locked_period() RETURNS trigger AS $$
DECLARE
  locked timestamptz;
  pid uuid := COALESCE(NEW.period_id, OLD.period_id);
BEGIN
  SELECT locked_at INTO locked FROM fiscal_period WHERE id = pid;
  IF locked IS NOT NULL THEN
    RAISE EXCEPTION 'Period % is locked', pid;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER voucher_period_lock ON voucher;
CREATE TRIGGER voucher_period_lock
  BEFORE INSERT OR UPDATE OR DELETE ON voucher
  FOR EACH ROW EXECUTE FUNCTION block_locked_period();

-- ── 2. A posted voucher must have >= 2 postings and balance ───────────────────
-- The balance trigger accepts an empty voucher (0 = 0) and says nothing about posting_at. A POSTED
-- voucher is a real accounting entry: it must have at least two legs and net to zero. Deferred so the
-- usual flow (insert voucher -> insert postings -> set posted_at, in one tx) is checked at COMMIT.
CREATE FUNCTION assert_posted_voucher_complete() RETURNS trigger AS $$
DECLARE
  cnt int;
  d   bigint;
  c   bigint;
BEGIN
  IF NEW.posted_at IS NULL THEN
    RETURN NULL; -- drafts may be incomplete; only posted vouchers must be whole
  END IF;
  SELECT count(*), COALESCE(sum(debit_ore), 0), COALESCE(sum(credit_ore), 0)
    INTO cnt, d, c FROM posting WHERE voucher_id = NEW.id;
  IF cnt < 2 THEN
    RAISE EXCEPTION 'Posted voucher % must have at least 2 postings (has %)', NEW.id, cnt;
  END IF;
  IF d <> c THEN
    RAISE EXCEPTION 'Posted voucher % is unbalanced: debit=% credit=%', NEW.id, d, c;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER voucher_posted_complete
  AFTER INSERT OR UPDATE ON voucher
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION assert_posted_voucher_complete();

-- ── 3. A tenant's fiscal periods may not overlap ─────────────────────────────
-- btree_gist gives gist an equality opclass for the uuid org column; the daterange is inclusive on
-- both ends ('[]'). Two periods of the same org with intersecting ranges are rejected.
CREATE EXTENSION IF NOT EXISTS btree_gist;
-- Greenfield: fiscal_period holds no rows yet, so adding this constraint takes no meaningful lock and
-- scans nothing. squawk's "validate-on-add" warning is for POPULATED tables — keep the rule active
-- globally (it guards future migrations) and exempt only this known-empty statement.
-- squawk-ignore constraint-missing-not-valid
ALTER TABLE fiscal_period ADD CONSTRAINT fiscal_period_no_overlap EXCLUDE USING gist (organization_id WITH =, daterange(starts_on, ends_on, '[]') WITH &&);

-- ── 4. A voucher's period must belong to the voucher's own org ────────────────
-- A composite FK (period_id, organization_id) -> fiscal_period(id, organization_id) makes a
-- cross-org period reference impossible at the storage layer, not just invisible under RLS. Requires a
-- matching UNIQUE target. The pre-existing single-column FK stays (harmless; subsumed by this one).
-- Greenfield (empty tables): the unique-index build and FK validation are instantaneous and lock
-- nothing. The rules stay active globally for future populated-table migrations; exempt only here.
-- squawk-ignore disallowed-unique-constraint, constraint-missing-not-valid
ALTER TABLE fiscal_period ADD CONSTRAINT fiscal_period_id_org_uniq UNIQUE (id, organization_id);
-- squawk-ignore adding-foreign-key-constraint, constraint-missing-not-valid
ALTER TABLE voucher ADD CONSTRAINT voucher_period_same_org FOREIGN KEY (period_id, organization_id) REFERENCES fiscal_period (id, organization_id);

-- migrate:down

ALTER TABLE voucher DROP CONSTRAINT voucher_period_same_org;
ALTER TABLE fiscal_period DROP CONSTRAINT fiscal_period_id_org_uniq;

ALTER TABLE fiscal_period DROP CONSTRAINT fiscal_period_no_overlap;
DROP EXTENSION IF EXISTS btree_gist;

DROP TRIGGER voucher_posted_complete ON voucher;
DROP FUNCTION assert_posted_voucher_complete();

DROP TRIGGER voucher_period_lock ON voucher;
CREATE OR REPLACE FUNCTION block_locked_period() RETURNS trigger AS $$
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

DROP TRIGGER posting_period_lock ON posting;
DROP FUNCTION block_locked_period_posting();
