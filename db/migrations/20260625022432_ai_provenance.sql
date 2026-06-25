-- AI provenance — the durable half of EU AI Act Art. 50(2) (ADR 0037, .claude/rules/ai-act.md).
--
-- When a human confirms an AI-proposed value and it posts to the ledger, we persist a queryable record
-- that the resulting voucher CAME FROM an AI proposal: model · model_version · confidence, linked 1:1 to
-- the voucher. The code-level provenance contract (ADR 0035) and the UI disclosure (ADR 0036) cover the
-- proposal and the first-interaction label; this table is the durable audit trail Art. 50(2) wants — a
-- log line is not durable or joinable to the system of record.
--
-- Data minimisation (`.claude/rules/data-handling.md`): provenance is model/version/confidence + the
-- voucher linkage ONLY. NEVER the supplier name (// personal — may be a natural person's name for an
-- ENK), the amounts (PII in aggregate), or the image bytes. There is deliberately no column for any of
-- those.
--
-- AI never writes the ledger (ADR 0002): this row is written ALONGSIDE the human-confirmed post, in the
-- same transaction — it records that a human committed an AI proposal, it is not an AI write.

-- migrate:up

-- A voucher may be referenced by provenance only within its own tenant — a composite FK (not just RLS
-- visibility) makes a cross-org link impossible at the storage layer, mirroring voucher_period_same_org.
-- Greenfield (voucher is empty here): the unique-index build and FK validation lock nothing and scan
-- nothing. The squawk rules stay active globally for future populated-table migrations; exempt only here.
-- squawk-ignore disallowed-unique-constraint, constraint-missing-not-valid
ALTER TABLE voucher ADD CONSTRAINT voucher_id_org_uniq UNIQUE (id, organization_id);

CREATE TABLE ai_provenance (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id),
  -- 1:1 with the posted voucher this AI proposal became (UNIQUE) — the queryable "this voucher is
  -- AI-assisted" link. ON DELETE is irrelevant: posted vouchers are immutable and never deleted.
  voucher_id      uuid NOT NULL UNIQUE REFERENCES voucher(id),
  -- Art. 50(2) machine-readable provenance — and ONLY this. No supplier, no amounts, no image.
  model           text NOT NULL,
  model_version   text NOT NULL,
  confidence      numeric(4,3) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  created_at      timestamptz NOT NULL DEFAULT now(),
  -- the provenance must sit in the same tenant as the voucher it annotates (storage-layer, not just RLS).
  FOREIGN KEY (voucher_id, organization_id) REFERENCES voucher (id, organization_id)
);

-- ── Tenancy: FORCE RLS + a USING/WITH CHECK policy + the app-role grant (ADR 0012) ──
ALTER TABLE ai_provenance ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_provenance FORCE  ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON ai_provenance
  USING      (organization_id = current_setting('app.current_org', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org', true)::uuid);

-- Append-only audit trail: the app may INSERT and SELECT but NOT UPDATE/DELETE — immutability enforced
-- at the privilege level (no trigger needed), matching the immutable voucher it annotates.
GRANT SELECT, INSERT ON ai_provenance TO saldo_app;

-- migrate:down

DROP TABLE ai_provenance;
ALTER TABLE voucher DROP CONSTRAINT voucher_id_org_uniq;
