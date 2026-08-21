# ADR 0064 — First-run account creation on the dev password provider

- **Status:** Accepted
- **Date:** 2026-08-21

## Context
A fresh install had no way to create the first user: the dev password provider (ADR 0055) only
*authenticates* existing rows, `createUserWithPassword` was called from tests alone, and production
login (BankID/Vipps via OIDC — which does auto-provision on first login) needs a live Criipto tenant
that is not yet wired. The owner therefore could not log in at all — which blocks everything
downstream, including creating and sending an invoice. An end-to-end run of the full flow
(login → org → contact → draft → issue → send) confirmed this was the only functional gap.

## Decision
The login page gains an **«Opprett konto»** submit on the same email/password form, handled as a
`register` intent in the same action — gated by the **same `devAuthEnabled` flag as password login**
(explicit `DEV_AUTH=true` AND a non-production build, per ADR 0055). Registration validates the shared
`credentialsInput` contract, consumes the same brute-force throttle as login, refuses a taken email
with calm copy (and catches the unique-constraint race identically), then creates the user and starts
a session.

## Consequences
- A fresh local/dev install is usable in one step: set `DEV_AUTH=true`, open the app, create the
  account. No seed script, no manual SQL.
- No new production surface: the gate is structural (`&& !isProd`), so no configuration can expose
  registration in production — the failure mode stays "no password auth at all" (ADR 0055).
- Registration inherently reveals whether an email is taken. Accepted on this dev-only surface; the
  login path keeps its timing-equalized non-enumeration behavior unchanged.
- When OIDC goes live, this path retires with the rest of the dev provider (flag off), with no
  migration: OIDC accounts are keyed on `(iss, sub)` and provisioned by the callback (ADR 0020).

## Alternatives considered
- **A seed script (`pnpm dev:user`)** — rejected: requires shell + DB access at exactly the moment a
  new operator has the least context, and is useless on a PaaS-deployed trial instance.
- **A separate `/auth/register` route** — rejected: more surface for the same gate; the intent switch
  mirrors how the action already forks (`oidc` vs password) and keeps one throttle and one contract.
- **Auto-provision on first *login* attempt** — rejected: silently creating an account on a typo'd
  email is an account-hygiene trap, and it would break the timing-equalized "wrong email or password"
  response the login path deliberately keeps.
