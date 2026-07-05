-- MVA filing record — the durable proof a melding was submitted via Altinn 3 (ADR 0063,
-- feat-altinn-mva-submission, build-spec §8.8/§9).
--
-- One row per submission ATTEMPT that reached instance creation: which year/term was filed, the
-- Altinn instance linkage (party + instance id — the pointer under which Skatteetaten's feedback,
-- kvittering and betalingsinformasjon live), and when. The feedback documents themselves stay in
-- Altinn and are fetched on demand — we persist the pointer, not copies, so the table stays
-- append-only like the ledger acts it proves (a §5.5 filing must be non-repudiable: the actor is
-- captured in audit_log ('mva_filing.submitted') in the same transaction).
--
-- Append-only like ai_provenance/audit_log (ADR 0037/0062): SELECT + INSERT only for the app role.
-- A re-filing (korrigert melding) is a NEW row — history is never rewritten.

-- migrate:up

CREATE TABLE mva_filing (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES organization(id),
  year              integer NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  -- The melding's term key (the domain's termKey): 'aar' for the annual term, 'T1'..'T6' bimonthly.
  term              text NOT NULL CHECK (term ~ '^(aar|T[1-6])$'),
  -- Altinn 3 instance linkage: {partyId}/{instanceGuid} on the innsending app.
  altinn_party_id   text NOT NULL CHECK (altinn_party_id <> ''),
  altinn_instance_id text NOT NULL CHECK (altinn_instance_id <> ''),
  -- The row's existence IS the status: the instance was created and the melding uploaded.
  -- Feedback (kvittering/betalingsinformasjon) is fetched on demand against the instance.
  created_at        timestamptz NOT NULL DEFAULT now(),
  -- One filing row per Altinn instance — a retried POST that made a NEW instance is a new row.
  UNIQUE (organization_id, altinn_instance_id)
);

CREATE INDEX mva_filing_org_year_idx ON mva_filing (organization_id, year);

-- ── Tenancy: FORCE RLS + a USING/WITH CHECK policy + the app-role grant (ADR 0012) ──
ALTER TABLE mva_filing ENABLE ROW LEVEL SECURITY;
ALTER TABLE mva_filing FORCE  ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON mva_filing
  USING      (organization_id = current_setting('app.current_org', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org', true)::uuid);

-- Append-only filing history: INSERT + SELECT, never UPDATE/DELETE (privilege-level immutability).
GRANT SELECT, INSERT ON mva_filing TO saldo_app;

-- migrate:down

DROP TABLE mva_filing;
