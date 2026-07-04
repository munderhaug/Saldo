# ADR 0055 — Dev password login requires explicit `DEV_AUTH=true` (never in production)

- **Status:** Accepted
- **Date:** 2026-07-04

## Context
The dev email/password provider was enabled whenever the build was non-production **or OIDC was
unconfigured** (`!isProd || !oidcConfigured`). The second arm is a footgun: a production deploy whose
OIDC secrets are missing or mistyped would silently expose password login — a weaker, throttle-only
path intended for local development — on the public internet (review 2026-07-03 §14).

## Decision
`devAuthEnabled = DEV_AUTH === 'true' && !isProd`. Two independent conditions, both explicit:
the operator must set `DEV_AUTH=true` in the environment, and even then a production build never
honours it. A misconfigured production deploy now fails toward "no password login" (the login page
shows only the OIDC path, or nothing) rather than toward exposure.

## Consequences
- Local development requires `DEV_AUTH=true` in `.env` once — a one-line, documented setup cost.
- No production configuration can turn the dev provider on; the failure mode is closed structurally.
- Tests are unaffected: they exercise `authenticateWithPassword` directly, not the route gate.

## Alternatives considered
- **Keep the OIDC-unconfigured fallback** — rejected: it optimises first-run convenience at the cost
  of an internet-facing auth downgrade on the worst possible day (secrets misconfigured in prod).
- **Allow `DEV_AUTH=true` in production for break-glass** — rejected: break-glass belongs in the
  deploy platform's access tooling, not in a weaker login path baked into the app.
