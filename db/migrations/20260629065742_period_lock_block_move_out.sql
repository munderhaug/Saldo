-- Period-lock move-out fix (review §9 / report line 136; ADR 0018). block_locked_period() computed a
-- single `pid := COALESCE(NEW.period_id, OLD.period_id)`. Because voucher.period_id is NOT NULL, on an
-- UPDATE the COALESCE always resolves to NEW (the destination) and OLD (the source) is never inspected.
-- So a voucher sitting in a LOCKED period could be UPDATEd to point at an OPEN period — moved OUT of
-- the locked period, silently mutating a closed-period record. (The COALESCE was added only to make the
-- function work for DELETE.)
--
-- Fix: on UPDATE check BOTH the source (OLD) and destination (NEW) period; on INSERT check NEW; on
-- DELETE check OLD. A voucher may then be neither moved out of, moved into, nor changed within a locked
-- period — but may still move freely between two OPEN periods. Only the function body changes (the
-- trigger binding BEFORE INSERT OR UPDATE OR DELETE is already correct).

-- migrate:up

CREATE OR REPLACE FUNCTION block_locked_period() RETURNS trigger AS $$
DECLARE
  locked timestamptz;
BEGIN
  -- Destination period (the row's new home) on INSERT/UPDATE.
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    SELECT locked_at INTO locked FROM fiscal_period WHERE id = NEW.period_id;
    IF locked IS NOT NULL THEN
      RAISE EXCEPTION 'Period % is locked', NEW.period_id;
    END IF;
  END IF;
  -- Source period (the row's old home) on UPDATE/DELETE — this is the leg the COALESCE form missed,
  -- so a move OUT of a locked period now raises.
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    SELECT locked_at INTO locked FROM fiscal_period WHERE id = OLD.period_id;
    IF locked IS NOT NULL THEN
      RAISE EXCEPTION 'Period % is locked', OLD.period_id;
    END IF;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

-- migrate:down

-- Restore the prior (single-value COALESCE) form — a faithful inverse of the committed function.
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
