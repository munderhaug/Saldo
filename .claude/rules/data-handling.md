---
paths: ["apps/web/app/db/**", "apps/web/app/integrations/**", "apps/web/app/jobs/**", "apps/web/app/contracts/**", "db/migrations/**"]
---
# Data handling — GDPR, residency, retention

This is financial + personal data. Treat privacy as a first-class constraint (spec §11).

## Residency
- All personal + financial data stays in the **EU/EEA**: Postgres EU (Neon), Cloudflare R2 (EU
  jurisdiction), EU email provider, in-Postgres jobs (no payloads to a non-EU SaaS). If using a hosted LLM, confirm EU
  handling — otherwise use the local Ollama/vLLM path. Never send personal data to a non-EU endpoint.

## Classification
- Tag personal data at the Zod boundary (e.g. a `personal()` brand/comment) so it's greppable.
- Personal data here: contact names/addresses/org-nr of private persons, app users, document images
  (receipts can contain personal data), bank transactions, audit-log actor identity.

## Retention vs immutability (the core tension)
- Statutory retention is **5 years** for vouchers and documentation; the ledger and issued invoices
  are **immutable**. A GDPR erasure request therefore CANNOT delete posted ledger data — document the
  lawful basis (legal obligation) and the retention exception.
- Erasure applies to data NOT under statutory hold (e.g. marketing fields, unposted drafts). Implement
  deletion/anonymisation paths only for those; never UPDATE/DELETE posted rows.
- The audit trail is under the same hold (sporbarhet, ADR 0062): an `app_user` with audited acts inside
  the 5-year window may only be ANONYMISED, never deleted — attribution degrades to a bare UUID.

## Always
- Provide a full **data export** (SAF-T + raw) — anti-lock-in and the GDPR access right.
- Secrets from the server env only; never log personal data or secrets (pino redaction).
- Document access is behind authz + tenant scope; storage is encrypted at rest.
