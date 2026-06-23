# db/reference/auth

Destination for committed raw captures of the **OIDC auth contract** — cited by
`docs/integrations/bankid-criipto.md`. Captures land here via the `regulatory-update` skill (dated
copy of the Criipto/Signicat authorize + token endpoints, scopes, and claims for BankID / Vipps
Login), so the auth integration is grounded in a committed source, never model memory.

Empty until the first capture is committed (requires egress + a Criipto/Signicat tenant).
