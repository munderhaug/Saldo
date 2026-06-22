# Saldo — accounting/invoicing for small Norwegian enkeltpersonforetak

TypeScript monorepo (pnpm + Turborepo). React Router 7 (framework mode) + shadcn/ui
(Tailwind v4) + PostgreSQL. Native-feel PWA. Full stack: `docs/tech-stack.md`.

## Architecture (full map: docs/architecture.md)
- **packages/domain** (`@saldo/domain`) — PURE accounting core (money, ids, VAT, posting,
  rules). No I/O, no Date.now/Math.random (inject them). Runs in route actions AND the
  browser. The one hard boundary.
- **apps/web/app/db** — Drizzle queries + types. Schema is GENERATED from SQL via
  introspection. Integrity (triggers/RLS/constraints/invoice-counter) lives in
  `db/migrations/*.sql`, NOT the ORM.
- **apps/web/app/contracts** — Zod schemas. Single source of truth for shapes.
- **apps/web/app/routes** — loaders/actions are the typed client↔server boundary (no separate API).

## Hard invariants (NEVER violate)
- Money is integer **øre**, type `Øre`. Never `number`, never float math. Use addØre/subØre/mulRate.
- Ledger is **append-only**. Never UPDATE/DELETE a posted voucher or issued invoice — correct
  via motbilag / kreditnota.
- Invoice numbers are **gapless** — allocated from a per-org counter row in the issuing tx,
  NOT a Postgres SEQUENCE (sequences leave gaps on rollback).
- Posting is server-authoritative AND enforced in SQL. Client validation is UX only.
- MVA status {under_threshold | unntatt | registered_standard | registered_zero_rated} drives all posting.
- AI proposes; the rules engine validates; a human confirms. AI never writes to the ledger.
- VAT codes & accounts come from the committed SAF-T code lists — never hardcode from memory.
- UI keeps a semantic-HTML, server-authoritative substrate; native polish is layered on top, never replaces it.

## Commands
pnpm dev · pnpm test · pnpm typecheck · pnpm lint · pnpm db:migrate · pnpm saft:validate

## Conventions
Strict TS, no `any`. Zod at all boundaries. New VAT/posting behavior REQUIRES a test in
packages/domain. Branded types for domain primitives (Øre, OrgNr, Kid, AccountNo, VatCode).
Domain detail lives in path-scoped rules under .claude/rules/ (they load when you touch the code).

## Harness
Single-agent loop by default; escalate to subagents only on demonstrated need. Hooks enforce
typecheck/lint/tests deterministically. See docs/house-standards.md.

## Compaction policy
Preserve: hard invariants, schema/migration decisions, list of modified files. Summarize
exploration briefly. Drop resolved tool output.
