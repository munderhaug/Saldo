# ADR 0060 — Persisted active-org context as an authz-inert browser cookie

- **Status:** Accepted
- **Date:** 2026-07-05

## Context

A user can be a member of several organizations (ADR 0020 membership; ADR 0032 provisioning), but the
app had no memory of which business they are acting for: home guessed the alphabetically first org,
and every feature route carries `orgId` in the path. The backlog task `feat-org-active-context` calls
for remembering the selection across requests. The tempting design — resolving routes' tenant from a
stored "current org" — would turn a piece of persisted state into an authorization input, which the
auth chain (`requireUser` → membership → `withOrgTx`, ADR 0020) exists to prevent.

## Decision

The active org is a plain browser cookie (`saldo_active_org`, HttpOnly, SameSite=Lax, 1 year — the
session cookie's attributes), and it is a **navigation hint only, never an authz input**:

- **Set** by the org-overview loader (`/orgs/:orgId`) — the selection gesture — and only AFTER
  `withUserOrg` has proven membership, so the cookie only ever names an org the user could open.
- **Read** where a route must pick a default org (home's honest-number reveal), and always
  cross-checked against the user's real membership list before use; an unknown or forged value falls
  back to the previous behavior (first org). The value is shape-validated (UUID) at the boundary.
- **Never** consulted by `withUserOrg`/`requireOrgAccess` — tenant scope continues to come from the
  route path and is re-proven per request against `membership` + RLS.

Like the companion preference (ADR 0058/0059) it is deliberately not account data: it carries no
personal or financial information, needs no migration, and works without JS.

## Consequences

- Home lands on the business the user last opened; switching is just opening another org. Multi-org
  users stop being dumped on the wrong books.
- Feature routes keep `orgId` in the path — URLs stay shareable/bookmarkable per org, and the RLS/authz
  chain is untouched. Dropping path `orgId` in favor of the cookie is explicitly rejected (an ambient
  tenant is how cross-tenant bugs are born).
- A per-device (not per-account) memory: a user on a new device starts at the fallback. Accepted — the
  cost of promoting it to account state (migration, sync semantics) buys nothing safety-critical.

## Alternatives considered

- **A `current_org` column on `user_session`** — server state, survives cookie clearing; but it invites
  reads from the session row inside the auth chain, drifting toward an ambient-tenant design, and needs
  a migration for what is presentation state. Rejected.
- **Resolving org-less routes from the cookie (`/invoices` instead of `/orgs/:id/invoices`)** — the
  original task phrasing. Rejected for now: an ambient tenant weakens the explicit path→membership→RLS
  chain and makes URLs meaningless across memberships; revisit only with a redirect-based design
  (`/invoices` → 302 to the active org's path) that keeps every real surface path-scoped.
- **Do nothing (first org wins)** — the status quo; wrong for any multi-org user.
