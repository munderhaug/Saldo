# ADR 0049 — Architecture-truth: derive the structural map + enforce the one hard boundary

- **Status:** Accepted
- **Date:** 2026-06-26

## Context
`docs/architecture.md` **restates** structural facts that already live in the code — the workspace
packages, the domain submodules, the `apps/web` module list, the route surface, the SQL integrity
objects. Like the status/roadmap drift that ADR 0031 fixed, these restatements rot: a new route,
migration, or package lands and the prose map silently disagrees with the repo. This violates
AGENTS.md's *"state a fact once; link, don't restate."*

A second, sharper gap: AGENTS.md names *one hard boundary* — `@saldo/domain` is PURE (no I/O, no
`Date.now`/`Math.random`, zero dependencies). Today that invariant is prose plus reviewer vigilance.
Nothing fails the build when a domain source file imports `drizzle-orm` or reaches for the wall clock.
A reminder is not a gate (engineering-discipline: *prefer a mechanical gate over a reminder*).

This was chosen over adopting an external codebase-mapping tool (Understand-Anything, Lore Map) or an
external memory layer (PromptOwl/ContextNest): those create a *second, drifting* source of truth that
collides with the no-contradiction gate, cost tokens, and (for the SaaS memory layer) raise
EU-residency concerns for a proprietary Norwegian-accounting codebase. We want the one benefit —
a code-true structural map — generated from our own sources and gated, not bolted on.

## Decision
`tools/arch-graph.mjs` (dependency-free ESM, like `status-block.mjs`/`backlog.mjs`) does two things:

**A — derive the structural facts + gate the drift.** It renders facts derived from committed sources —
workspace packages (`pnpm-workspace.yaml` → each `package.json` name), `@saldo/domain` submodules +
source-module count, `apps/web/app/*` modules, the `route()`/`index()` count in
`apps/web/app/routes.ts`, and the SQL integrity surface (tables / RLS policies / triggers / functions
across `db/migrations/*.sql`) — into an `<!-- AUTOGEN:arch-graph -->…<!-- /AUTOGEN:arch-graph -->`
block in `docs/architecture.md`. `pnpm arch:refresh` writes it; `pnpm arch:check` re-renders and exits
non-zero on drift. `tools/repo-lint.mjs` gains the same drift check, so editing structure without
`pnpm arch:refresh` fails `pnpm lint:repo` (already run in CI and the docs PostToolUse hook). The
hand-drawn ASCII diagram stays as the *narrative*; the generated block is the *code-true ledger*.

**B — enforce the one hard boundary.** `domainPurityViolations()` scans `packages/domain/src/**/*.ts`
(excluding tests): any non-relative `import`/`export … from`, bare side-effect import, or
`import(...)` is a breach (the package declares zero dependencies), as is any `Date.now`,
`Math.random`, or `new Date` (the domain is deterministic — inject the clock/randomness). `repo-lint`
fails on any violation, with `file:line` and the reason.

Hard constraints, inherited from ADR 0031: the block carries **only facts derivable from committed
files** — never a HEAD sha or commit date (a block can't contain the commit that writes it). Whitespace
is normalized before comparison (reusing `normalizeBlock`) so a `pnpm format` tweak can't false-fail
the gate; structural drift still does.

## Consequences
- The architecture map cannot silently rot: a structural change that skips `pnpm arch:refresh` fails
  CI, the same way ADR 0031 made status drift fail.
- The single most important invariant in the repo — domain purity — is now a mechanical gate, not a
  reviewer's memory. A breach fails the build at `file:line`.
- We own the generator: no external tool, no token cost, no second source of truth, no data leaving
  the repo. The benefit pitched by external code-mappers is captured under our own no-contradiction gate.
- Cost: one more generator to keep aligned with the layout (e.g. if `db/migrations` moves). It is
  dependency-free and ~190 lines; the regexes are deliberately simple and will under- rather than
  over-report. The purity scan is import-and-text based, not a full TS parse — it can miss exotic
  evasions (e.g. a string-built specifier), accepted as a known limit for a gate that catches the
  realistic cases.

## Alternatives considered
- **Adopt an external mapper (Understand-Anything / Lore Map).** Rejected: a generated graph committed
  to the repo becomes a second source of truth that drift-collides with `lint:repo`; token cost; and
  the immature one (Lore Map) parses Prisma, not our SQL-sourced Drizzle. See the evaluation that
  prompted this ADR.
- **External memory layer (PromptOwl/ContextNest).** Rejected: duplicates `STATUS.md`/ADRs/`backlog`
  (already versioned, single-source-of-truth) and a hosted variant raises EU-residency concerns.
- **A full TS-compiler purity analysis.** Rejected for now: heavier and a dependency; the line-based
  scan catches every realistic breach and stays dependency-free. Revisit if an evasion slips through.
- **Auto-generate a Mermaid edge graph (route → domain → db).** Rejected for v1: per-file import
  analysis is noisy and the edges rarely add signal over the narrative diagram + the derived facts.
