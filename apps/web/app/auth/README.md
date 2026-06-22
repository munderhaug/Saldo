# auth/

OIDC login via `openid-client` + `oslo`, with server-side Postgres sessions. BankID/Vipps Login
through the Criipto/Signicat broker (ADR 0008; `docs/integrations/bankid-criipto.md`).

- `oidc.ts` — discovery, authorize (PKCE + state/nonce), token exchange.
- `session.ts` — create/read/destroy server-side sessions; `HttpOnly`/`Secure`/`SameSite` cookie.
- `middleware.ts` — set the `app.current_org` GUC per request for RLS.

ID-porten (Altinn filing) is intentionally NOT here — it lives under `integrations/altinn`.
