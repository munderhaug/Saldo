# Security Policy

Saldo holds personal and financial data for Norwegian businesses. Security and privacy are
first-class (see `docs/quality-bar.md` and `.claude/rules/data-handling.md`).

## Reporting a vulnerability
Report privately to the maintainer (do not open a public issue for security matters). Include steps to
reproduce and impact. Acknowledgement is targeted within a few business days.

## Data classes & residency
- Personal + financial data stays in the **EU/EEA**. No personal data is sent to non-EU endpoints
  (LLM, email, storage, jobs). The default LLM path is local (Ollama/vLLM).
- Retention is statutory (5 years for vouchers/documentation); the ledger and issued invoices are
  immutable. GDPR erasure cannot remove data under statutory hold — the lawful basis is documented.

## Engineering controls
- Secrets only in the server environment; `.env*` and `secrets/**` are git-ignored and agent-denied.
- Inputs are validated with Zod at boundaries (including a Zod `env.ts`) and queries are parameterized.
  Tenancy is enforced by Postgres `FORCE` RLS via the `app.current_org` GUC (ADR 0012); the org id is
  resolved from the authenticated user's **membership** (`withUserOrg`), not caller-supplied (ADR 0020).
- **Current (ADR 0020):** server-side sessions (a 160-bit opaque token stored only as its SHA-256),
  `HttpOnly`/`Secure`/`SameSite=Lax` cookies with a sliding+absolute expiry, argon2id for the dev
  password provider, and CSRF via SameSite + an Origin/Host check on mutating actions.
- **Intended:** production OIDC (PKCE + state/nonce) is wired via `openid-client` v6 but not yet
  **live-verified** against the BankID/Vipps Criipto broker (needs egress + a tenant — see `docs/STATUS.md`).
- Dependencies are audited in CI (`pnpm audit`) and kept current via Dependabot.
- The ledger is immutable and append-only (enforced by SQL triggers today); a dedicated audit trail
  for actor identity (now that `app_user` exists) lands with the ledger-write UI (**Intended**).
