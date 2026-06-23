# auth/

OIDC login via `openid-client` (v6) + `@oslojs/crypto` / `@oslojs/encoding`, with server-side Postgres
sessions. BankID/Vipps Login through the Criipto/Signicat broker (ADR 0008;
`docs/integrations/bankid-criipto.md`). NB: the `oslo` umbrella package is deprecated — use the
`@oslojs/*` successors for session-token generation/hashing.

- `middleware.ts` — ✅ `withOrgTx(db, orgId, fn)`: runs `SET LOCAL app.current_org` in a transaction so
  the FORCEd RLS policies (ADR 0012) scope every statement to the tenant. The per-request tenancy
  boundary; the app connects as the non-owner `saldo_app` role.
- `oidc.ts` — TODO: discovery, authorize (PKCE + state/nonce), token exchange. Needs a Criipto tenant
  to validate the live round-trip (provider account is onboarding-gated — `bankid-criipto.md`).
- `session.ts` — TODO: create/read/destroy server-side sessions (hashed token in Postgres);
  `HttpOnly`/`Secure`/`SameSite` cookie; rotation.

ID-porten (Altinn filing) is intentionally NOT here — it lives under `integrations/altinn`.
