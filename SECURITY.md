# Security Policy

Saldo holds personal and financial data for Norwegian businesses. Security and privacy are
first-class (see `docs/quality-bar.md` and `.claude/rules/data-handling.md`).

## Reporting a vulnerability
Report privately to the maintainer (do not open a public issue for security matters). Include steps to
reproduce and impact. We aim to acknowledge within a few business days.

## Data classes & residency
- Personal + financial data stays in the **EU/EEA**. No personal data is sent to non-EU endpoints
  (LLM, email, storage, jobs). The default LLM path is local (Ollama/vLLM).
- Retention is statutory (5 years for vouchers/documentation); the ledger and issued invoices are
  immutable. GDPR erasure cannot remove data under statutory hold — the lawful basis is documented.

## Engineering controls
- Secrets only in the server environment; `.env*` and `secrets/**` are git-ignored and agent-denied.
- Inputs validated with Zod at every boundary; queries parameterized; tenancy enforced by app-layer
  org filtering **and** Postgres RLS (`app.current_org` GUC).
- OIDC with PKCE + state/nonce; server-side sessions; secure cookies.
- Dependencies are audited in CI (`pnpm audit`) and kept current via Dependabot.
- Audit trail is append-only; the ledger is immutable (enforced by SQL triggers).
