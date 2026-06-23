# ADR 0020 — Session & identity model (the first lock)

- **Status:** Accepted
- **Date:** 2026-06-23

## Context
RLS (ADR 0012) is a strong **second** lock, but there was no **first** lock: nothing authenticated a
user or linked them to an org, so `withOrgTx` trusted a caller-supplied org id. The system needs authentication,
server-side sessions, and a user→org authz link — best-practice, and testable now without a live eID
broker (BankID/Vipps via Criipto needs egress + a tenant, deferred).

## Decision
- **Tables (`app_user`, `user_session`, `membership`).** `user_session` follows the Lucia pattern: the
  cookie holds a 32-byte (160-bit) opaque token; the DB stores **only its SHA-256**, so a DB leak
  yields no usable tokens. `membership(user_id, organization_id, role)` is the user→org authz link.
  These are **auth/system tables, not tenant tables**: they are looked up *before* any org context
  exists (by token hash / user id), so they are deliberately **not org-RLS'd** — there is no
  `app.current_org` yet, and the token hash is itself the unguessable key. They are protected by
  least-privilege grants to `saldo_app` + always being queried by their secret key. The RLS-coverage
  test carries them on an explicit allowlist, so any *future* unclassified table still fails CI.
- **Sessions.** `HttpOnly` + `SameSite=Lax` + `Secure` (prod) cookie; 30-day absolute TTL with a
  15-day **sliding** renewal; a fresh token on each login; invalidate on logout (and "everywhere").
  The testable cores (`session.server`, `users.server`, `password.server`) take `db` + an injectable
  `now`, so they're proven against real Postgres independent of app config.
- **Providers behind a seam.** A **dev email/password** provider (**argon2id** via `@node-rs/argon2`,
  OWASP params) ships now so the full login→org→ledger flow is exercisable. The **production** path is
  **OIDC** via `openid-client` v6 (Authorization Code + PKCE S256 + state + nonce; validates
  iss/state/nonce), wired and type-checked behind `oidcConfigured` but **not live-verified** here.
- **Authz chain.** `requireUser` → resolve `membership` → `withOrgTx(db, orgId, …)` (`withUserOrg`),
  so a tenant transaction only opens after proving the user may act for that org.
- **Config.** A Zod **`env.ts`** parses app config at boot (`DATABASE_URL` = the `saldo_app` role,
  `APP_URL`, optional `OIDC_*`). **No `SESSION_SECRET`:** opaque hashed tokens need no signing secret,
  and CSRF is `SameSite=Lax` + an Origin/Host check on mutating actions — not a signed token.

## Consequences
- A real first lock: unauthenticated requests are redirected; a tenant transaction requires proven
  membership. Proven by an always-on argon2id unit test + a Testcontainers suite (session lifecycle,
  expiry/sliding/invalidate, dev-auth, and a membership write whose FK to the RLS-forced `organization`
  resolves with no tenant GUC — referential checks bypass RLS).
- `DATABASE_URL` now means the **app** (`saldo_app`) connection; migrations use a separate OWNER URL.
- OIDC is structurally complete but must be verified against a real Criipto tenant before it's "done".
- Org **selection** UX (when a user has several memberships) is deferred to the org-onboarding feature;
  PR5 ships the authz primitives (`requireOrgAccess` / `withUserOrg`).

## Alternatives considered
- **Signed-cookie (stateless) sessions** — no server lookup, but no server-side revocation and a
  signing-secret to rotate; DB sessions give immediate invalidation and "sign out everywhere".
- **Store the raw token** — a DB leak would hand out live sessions; storing only the SHA-256 removes that.
- **`oslo` (umbrella)** — deprecated; replaced by `@oslojs/crypto` + `@oslojs/encoding` (ADR/rules).
- **A `SESSION_SECRET`** — unused given opaque hashed tokens + SameSite/Origin CSRF; omitted (R-00xx in
  `rejected.md` would record it if reintroduced).
