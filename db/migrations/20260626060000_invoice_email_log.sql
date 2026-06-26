-- Invoice email-delivery log (build-spec §8.4, feat-invoice-pdf-email): one row per send ATTEMPT of an
-- issued sales document, recording the provider's message id (for later bounce/delivery webhook
-- correlation), the recipient, and the outcome. This is provenance for a §5.5 consequential act — the
-- send — NOT the ledger: it is append-only by GRANT (saldo_app gets SELECT + INSERT, never UPDATE/
-- DELETE), so a recorded attempt can't be rewritten, but it carries no balance/immutability triggers.
--
-- Integrity that applies (.claude/rules/ledger-integrity.md):
--   * RLS tenancy — ENABLE + FORCE + a USING/WITH CHECK policy on app.current_org + a saldo_app grant,
--     like every tenant table (a new tenant table MUST do all three in its own migration);
--   * same-org link — invoice_id is pinned to this row's OWN org via a composite FK into the existing
--     invoice (id, organization_id) UNIQUE, so a log row can never reference another tenant's invoice.
-- Personal data: `recipient` is the customer's email at send time (an ENK / private person) — tagged so
-- the data-handling audit finds it; it is stored EU-resident and is NEVER written to logs (pino redaction).

-- migrate:up

CREATE TABLE invoice_email (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES organization(id),
  invoice_id          uuid NOT NULL,
  -- personal: the recipient address the document was sent to (frozen at send time).
  recipient           text NOT NULL,
  -- The transactional provider (provider-agnostic; Postmark today, ADR 0045). Not a secret.
  provider            text NOT NULL DEFAULT 'postmark',
  -- The provider's message id, when the send succeeded — correlates a later bounce/delivery webhook.
  provider_message_id text,
  status              text NOT NULL CHECK (status IN ('sent','failed')),
  -- Error CLASS on a failed attempt (never a body/recipient/secret) — diagnostics only.
  error               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  -- A log row may only reference THIS org's invoice (storage-layer, not just RLS).
  CONSTRAINT invoice_email_invoice_same_org
    FOREIGN KEY (invoice_id, organization_id) REFERENCES invoice (id, organization_id)
);
CREATE INDEX invoice_email_invoice_idx ON invoice_email (invoice_id);

-- Tenancy: same regime as every other tenant table (ADR 0012).
ALTER TABLE invoice_email ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_email FORCE  ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON invoice_email
  USING      (organization_id = current_setting('app.current_org', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org', true)::uuid);

-- Append-only by grant: the app may record and read attempts, never rewrite them (no UPDATE/DELETE).
GRANT SELECT, INSERT ON invoice_email TO saldo_app;

-- migrate:down

DROP TABLE IF EXISTS invoice_email;
