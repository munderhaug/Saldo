---
name: new-feature
description: Implement a new feature end-to-end in the Saldo RR7 app following the project's workflow loop and invariants. Use when adding a route/module that spans domain, db, and UI.
---
# New feature

Follow the workflow loop; keep the domain pure and the integrity in SQL.

## Loop
1. **Plan** (read-only) — name the routes, contracts (Zod), domain functions, and any migration.
2. **Domain first** — add pure logic + tests in `@saldo/domain` (test-first for anything money/VAT).
3. **Contracts** — Zod schemas in `apps/web/app/contracts`; infer types from them.
4. **Data** — if schema changes, use the `add-migration` skill (SQL → introspect). Queries in
   `app/db/queries`.
5. **Route** — loader/action in `app/routes`; validate input via the contract, derive postings via
   the domain, persist via Drizzle, enqueue jobs if needed.
6. **UI** — shadcn components; RHF + Zod; TanStack Table for lists; tabular-nums for figures;
   semantic-HTML baseline, native polish layered on.
7. **Verify** — `test-runner` subagent; relevant reviewer subagent; hooks gate typecheck/lint.
8. **Commit** a focused checkpoint.

## Invariants to honor
Money is Øre · ledger append-only · gapless invoice numbers via counter · MVA-status fork ·
AI proposes only · client authoritative for nothing.
