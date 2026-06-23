# auth/

OIDC login via `openid-client` (v6) + `@oslojs/crypto` / `@oslojs/encoding`, with server-side Postgres
sessions. BankID/Vipps Login through the Criipto/Signicat broker (ADR 0008;
`docs/integrations/bankid-criipto.md`). NB: the `oslo` umbrella package is deprecated — use the
`@oslojs/*` successors for session-token generation/hashing.

Built in ADR 0020 (session & identity model):

- `middleware.ts` — ✅ `withOrgTx(db, orgId, fn)`: runs `SET LOCAL app.current_org` in a transaction so
  the FORCEd RLS policies (ADR 0012) scope every statement to the tenant. The app connects as `saldo_app`.
- `auth.server.ts` — ✅ the wiring: `requireUser` → `requireOrgAccess` (membership) → `withUserOrg`
  (→ `withOrgTx`), plus `assertSameOrigin` (CSRF). Binds the cores below to the real `db`.
- `session.server.ts` — ✅ Lucia-pattern sessions: opaque token, store only its SHA-256; create /
  validate (sliding + absolute expiry) / invalidate. Dependency-injected (`db`, `now`) for testing.
- `cookies.server.ts` — ✅ `HttpOnly`/`Secure`/`SameSite=Lax` session cookie read/write/clear.
- `password.server.ts` + `dev-auth.server.ts` — ✅ argon2id + the dev email/password provider.
- `users.server.ts` — ✅ `app_user` + `membership` queries (the user→org authz link).
- `oidc.server.ts` — ✅ wired (openid-client v6: PKCE + state + nonce) but **not live-verified**: needs
  a Criipto tenant + egress for the BankID/Vipps round-trip (`docs/integrations/bankid-criipto.md`).

ID-porten (Altinn filing) is intentionally NOT here — it lives under `integrations/altinn`.
