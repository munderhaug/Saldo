# ADR 0014 — CI ephemeral database: Testcontainers (replaces Neon branching)

- **Status:** Accepted
- **Date:** 2026-06-23

## Context
Integrity lives in SQL (ADR 0003), so tests must run against a **real** Postgres that exercises the
actual triggers, constraints, and RLS — not a mock. The build spec originally defaulted to Neon
per-PR branching for this; that couples CI to an external service (egress, branch lifecycle, auth).

## Decision
Use **Testcontainers** to spin up a throwaway Postgres per test run. The integration suite
(`apps/web/test/integrity/`) applies the migrations and proves each guarantee blocks its bad case
against this real database. This supersedes the spec's Neon-branching default for CI.

## Consequences
- Hermetic, self-contained CI with no external dependency or per-PR branch cleanup.
- Needs a Docker daemon — present in CI; the suite skips gracefully where Docker is absent (local).
- Neon remains the hosted / runtime database (ADR 0013); the two roles are cleanly separated.

## Alternatives considered
- **Neon per-PR branching** — real Postgres, but ties CI to an external control plane and egress, and
  adds branch-lifecycle management for no integrity-testing benefit over a local container.
