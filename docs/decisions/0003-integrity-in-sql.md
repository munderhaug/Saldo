# ADR 0003 — Integrity in SQL, not the ORM

- **Status:** Accepted
- **Date:** 2026-06-22

## Context
Ledger correctness (balance, immutability, period locks, gapless numbering, tenancy) must hold even
if application code has bugs. ORMs cannot guarantee these at the database level.

## Decision
All hard integrity lives in raw SQL migrations: constraint triggers (Σ debit = Σ credit),
immutability triggers, period-lock triggers, the per-org invoice counter, and RLS policies. The ORM
(Drizzle) is used only for typed queries.

## Consequences
- The database is the last line of defense; app bugs cannot corrupt the ledger.
- Migrations are reviewed SQL, tested with Testcontainers against real Postgres.

## Alternatives considered
ORM-level validation only — rejected: not a real guarantee.
