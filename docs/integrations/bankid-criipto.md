# BankID / Vipps Login via Criipto or Signicat

- **Purpose:** Production app login with the eID methods Norwegian users expect.
- **Auth:** OIDC (authorization code + PKCE). Implemented with `openid-client` + `oslo` in RR7 route
  actions; server-side session cookie; users stored in Postgres. Email/password only for early dev.
- **Status / phase:** set up early — Phase 1 (provider account is onboarding-gated).
- **Separation of concerns:** this is **app login only**. **ID-porten is a separate integration**
  (`altinn.md`) scoped to the Altinn tax-filing authorization flow — never reused for login.
- **Provider choice:** Criipto vs Signicat — both do BankID/Vipps Login over OIDC; pick before
  Phase 0 hardens (open decision, spec §18).
- **Notes:** validate `state`/`nonce`, use PKCE, set `HttpOnly`/`Secure`/`SameSite` cookies. The one
  unavoidable non-OSS dependency (ADR 0008).
