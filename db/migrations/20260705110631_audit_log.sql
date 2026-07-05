-- Audit log — the bokføringsforskrift sporbarhet record (ADR 0062, build-spec §8.11/§11).
--
-- Every consequential write (a voucher posting, an invoice lifecycle act, a supplier-invoice post, a
-- reconciliation confirm, a register change) records WHO did it: the authenticated app_user, captured
-- in the SAME tenant transaction as the write itself, so the act and its attribution commit atomically.
-- This closes the non-repudiation gap flagged in the security audit (actor capture was "intended").
--
-- Data minimisation (`.claude/rules/data-handling.md`): a row is actor · action · entity linkage ONLY.
-- The audited values (amounts, names) live in the entity rows themselves — joinable, never duplicated
-- here. The actor identity is personal data; nothing else in the row is.
--
-- Append-only like ai_provenance (ADR 0037): the app role may INSERT and SELECT but never UPDATE or
-- DELETE — immutability at the privilege level, matching the immutable ledger the log attests to.

-- migrate:up

CREATE TABLE audit_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id),
  -- The authenticated user who performed the act (non-repudiation). app_user rows are never deleted
  -- (erasure anonymises), so the FK holds for the statutory retention window.
  actor_user_id   uuid NOT NULL REFERENCES app_user(id),
  -- 'entity.act' — e.g. 'voucher.posted', 'invoice.issued'. The closed set lives in the typed helper
  -- (app/db/audit.server.ts); the format is enforced here so free-text can never land.
  action          text NOT NULL CHECK (action ~ '^[a-z_]+\.[a-z_]+$'),
  -- Generic linkage to the audited row (a single FK target is impossible across N tables; RLS + the
  -- same-tx write keep it trustworthy).
  entity_table    text NOT NULL CHECK (entity_table ~ '^[a-z_]+$'),
  entity_id       uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- The read path is "this org's trail, newest first" (export + future viewing surface).
CREATE INDEX audit_log_org_created_idx ON audit_log (organization_id, created_at);

-- ── Tenancy: FORCE RLS + a USING/WITH CHECK policy + the app-role grant (ADR 0012) ──
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log FORCE  ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON audit_log
  USING      (organization_id = current_setting('app.current_org', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org', true)::uuid);

-- Append-only audit trail: INSERT + SELECT, never UPDATE/DELETE (privilege-level immutability).
GRANT SELECT, INSERT ON audit_log TO saldo_app;

-- migrate:down

DROP TABLE audit_log;
