# ADR 0013 — Hosted Postgres: Neon (EU region)

- **Status:** Accepted
- **Date:** 2026-06-23

## Context
The ledger needs a managed, EU-resident Postgres that supports the full integrity model: raw-SQL
triggers, extensions (`pgcrypto`, `btree_gist`), and — critically — `FORCE ROW LEVEL SECURITY` with a
**non-owner application role** (ADR 0012). For a solo-maintained, decade-horizon system of record,
low operational burden matters without giving up SQL-level control or EU residency. Self-hosting every
layer (ADR 0008) is reconsidered in ADR 0015.

## Decision
Use **Neon** (EU region) as the hosted Postgres. The app connects as the non-owner `saldo_app` role;
migrations (dbmate) run as the owner. Under the Cloudflare-edge topology (ADR 0015) the app reaches
Neon through **Cloudflare Hyperdrive** with `postgres.js`, so the per-request `SET LOCAL
app.current_org` tenancy pattern (ADR 0012) works unchanged — it is transaction-scoped, which
Hyperdrive preserves. Self-hosted Postgres remains the sovereignty fallback (ADR 0008 / ADR 0015).

## Consequences
- Managed backups / PITR and EU-region data-at-rest without self-operating a database.
- The integrity layer is unaffected and portable — it lives in SQL, not in any host feature.
- Must confirm Neon EU supports the custom non-owner-role FORCE-RLS model when wiring it live.
- CI does **not** use Neon branching; it uses Testcontainers (ADR 0014).

## Alternatives considered
- **Supabase** — its bundled Auth and Storage go unused (identity is BankID-over-OIDC; documents live
  in R2), so it adds surface without benefit here.
- **Self-hosted Postgres** — retained as the sovereignty fallback; higher ops (ADR 0008 / ADR 0015).
