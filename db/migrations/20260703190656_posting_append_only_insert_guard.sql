-- Append-only, completed: extend posting immutability to INSERT (repo review 2026-07-03, P0).
-- `posting_immutable` (core_ledger) blocks UPDATE/DELETE of a posted voucher's postings, but INSERT
-- was open: a later transaction could append new (balanced) posting pairs to an already-posted
-- voucher, silently changing its economic content while it still "balances" — an append-only-ledger
-- violation invisible to the balance trigger.
--
-- Every legitimate posting path creates the voucher (posted_at = now()) and its postings in ONE
-- transaction. So an INSERT is allowed only while the parent voucher is unposted, or when the
-- voucher row itself was written by THIS transaction (xmin = the current xact id — the issuing tx
-- finishing its own voucher). Any later transaction touching a posted voucher's postings is blocked.

-- migrate:up

CREATE FUNCTION block_posting_insert_on_posted_voucher() RETURNS trigger AS $$
DECLARE
  v_posted  timestamptz;
  v_same_tx boolean;
BEGIN
  SELECT posted_at, (xmin = pg_current_xact_id()::xid)
    INTO v_posted, v_same_tx
    FROM voucher WHERE id = NEW.voucher_id;
  IF v_posted IS NOT NULL AND NOT v_same_tx THEN
    RAISE EXCEPTION 'Cannot INSERT, postings of posted voucher % are immutable (use a motbilag)',
      NEW.voucher_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER posting_immutable_insert
  BEFORE INSERT ON posting
  FOR EACH ROW EXECUTE FUNCTION block_posting_insert_on_posted_voucher();

-- migrate:down

DROP TRIGGER IF EXISTS posting_immutable_insert ON posting;
DROP FUNCTION IF EXISTS block_posting_insert_on_posted_voucher();
