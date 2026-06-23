# db/reference/brreg

Destination for committed raw captures of the **Enhetsregisteret (Brønnøysundregistrene) Open Data
API** — cited by `docs/integrations/enhetsregisteret.md`. Captures land here via the
`regulatory-update` skill (dated HTML/JSON of the `enheter/{orgnr}` response shape and the
`registrertIMvaregisteret` field), so company-lookup code is grounded in a committed source, never
model memory.

Empty until the first capture is committed (requires egress to `data.brreg.no`).
