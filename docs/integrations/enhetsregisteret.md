# Enhetsregisteret (Brønnøysund)

- **Purpose:** Org-number lookup — name, address, NACE, and **VAT-register status**
  (`registrertIMvaregisteret`). Drives onboarding autofill (§8.1) and per-contact MVA status (§8.2).
- **Auth:** none (open API, NLOD-licensed). No key needed.
- **Status / phase:** Start now — Phase 1.
- **Endpoint:** `https://data.brreg.no/enhetsregisteret/api/enheter/{orgnr}`.
- **Notes:** validate `orgnr` (mod11) before lookup via `@saldo/domain` `OrgNr`. Cache results; the
  register is stable. During development, the `brreg` MCP server is available for ad-hoc lookups.
