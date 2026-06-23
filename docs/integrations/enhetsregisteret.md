# Enhetsregisteret (Brønnøysund)

- **Purpose:** Org-number lookup — name, address, NACE, and **VAT-register status**
  (`registrertIMvaregisteret`). Drives onboarding autofill (§8.1) and per-contact MVA status (§8.2).
- **Auth:** none (open API, NLOD-licensed). No key needed.
- **Status / phase:** Phase 1 — **implemented** as the read-only `/oppslag` lookup (org-nr + name
  search). Client: `apps/web/app/integrations/enhetsregisteret/client.server.ts` (Zod-validated at the
  boundary, AbortController timeout, typed not-found/error). Contract: `app/contracts/enhetsregisteret.ts`.
  Consumed next by `feat-org-onboarding` (autofill).
- **Endpoints:** unit by number `…/api/enheter/{orgnr}`; name search `…/api/enheter?navn={q}&size=N`
  (the search envelope omits `_embedded` when there are zero matches).
- **Notes:** validate `orgnr` (mod11) before lookup via `@saldo/domain` `OrgNr`. **Caching:** the
  register is stable, but a response can carry an ENK's name/home address (personal data), so it must
  **not** be edge/CDN-cached — responses are `Cache-Control: private, no-store` for now; an
  EU-resident server-side cache + rate-limit is tracked as `feat-enhetsregisteret-cache`. During
  development, the `brreg` MCP server is available for ad-hoc lookups.

## Sources
- Brønnøysundregistrene, "Enhetsregisteret — Åpne data API" (NLOD). Raw: db/reference/brreg/ (capture
  the current API doc + the `registrertIMvaregisteret` field spec). verify-by: 2026-12-31
