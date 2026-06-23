# Rejected approaches (the anti-ADR)

ADRs record decisions we **kept**. This file records approaches we **tried and abandoned**, and why —
so the next ephemeral session doesn't re-walk the same dead end (ADR 0019). Append-only; newest at the
bottom. One entry per abandoned approach. IDs are `R-NNNN`, gapless.

Template:

```
## R-NNNN — <short title>
- **Date:** YYYY-MM-DD
- **Context:** where/why this came up
- **Tried:** the approach
- **Rejected because:** the reason it didn't hold
- **Instead:** what we did
- **Refs:** ADR / commit / file
```

---

## R-0001 — Adopt piyaz (the SaaS) for task management
- **Date:** 2026-06-23
- **Context:** Needed a dependency-aware backlog + a record of abandoned approaches.
- **Tried:** Adopting `piyaz` directly (hosted app + MCP server) as the project-management layer.
- **Rejected because:** It moves planning context off-repo and adds an external runtime dependency —
  against Saldo's "everything committed, source-grounded, survives the ephemeral session" stance.
- **Instead:** Built the two valuable ideas natively: `docs/backlog/tasks.json` + `tools/backlog.mjs`
  and this file.
- **Refs:** ADR 0019.

## R-0002 — knip as a blocking CI gate
- **Date:** 2026-06-23
- **Context:** Wanted unused-file/export/dep detection in CI.
- **Tried:** Running `knip` as a required (blocking) check in the core gate.
- **Rejected because:** On a foundation repo knip correctly flags *intentionally-pending* items (the
  documented unused frontend deps, not-yet-wired modules). Blocking would force suppressing real
  findings, turning the signal into noise.
- **Instead:** knip runs **advisory** in the weekly freshness cron, funneling findings into one rolling
  issue. It graduates to a gate as the surface fills in.
- **Refs:** ADR 0017; `.github/workflows/freshness.yml`.

## R-0003 — @cyclonedx/cyclonedx-npm for the SBOM
- **Date:** 2026-06-23
- **Context:** CycloneDX SBOM generation for supply-chain hardening.
- **Tried:** `@cyclonedx/cyclonedx-npm`.
- **Rejected because:** It shells out to `npm` and misreads a **pnpm** workspace's dependency tree.
- **Instead:** `@cyclonedx/cdxgen -t pnpm`, which reads `pnpm-lock.yaml` correctly.
- **Refs:** ADR 0017; `.github/workflows/security.yml`.

## R-0004 — Globally exclude squawk's constraint rules for greenfield migrations
- **Date:** 2026-06-23
- **Context:** squawk flags adding FK/UNIQUE/EXCLUDE constraints as unsafe (lock/scan a populated
  table), but Saldo's tables are still empty.
- **Tried:** Adding `constraint-missing-not-valid` / `disallowed-unique-constraint` /
  `adding-foreign-key-constraint` to `squawk.toml`'s global `excluded_rules`.
- **Rejected because:** Those are the *most valuable* rules for catching genuinely dangerous future
  migrations against populated tables; disabling them globally throws away that protection.
- **Instead:** Inline `-- squawk-ignore <rule>` on the specific greenfield statements, with a
  justification comment. The rules stay active everywhere else.
- **Refs:** ADR 0018; `db/migrations/20260623030558_ledger_integrity_gaps.sql`.

## R-0005 — squawk inline-ignore above a multi-line ALTER statement
- **Date:** 2026-06-23
- **Context:** Applying R-0004's inline ignores.
- **Tried:** `-- squawk-ignore …` on the line above a multi-line `ALTER TABLE … ADD CONSTRAINT …`
  split across several lines.
- **Rejected because:** squawk anchors the directive to the **immediately following line**; for a
  multi-line statement the flagged `ADD CONSTRAINT` sits a line lower, so the ignore didn't apply.
- **Instead:** Collapsed those `ALTER TABLE … ADD CONSTRAINT …` statements onto a single line so the
  directive lands. (A concrete gotcha worth not re-discovering.)
- **Refs:** `db/migrations/20260623030558_ledger_integrity_gaps.sql`.

## R-0006 — dependency-cruiser for the domain↛web boundary
- **Date:** 2026-06-23
- **Context:** Enforcing `packages/domain` never imports `apps/web`.
- **Tried:** Adding `dependency-cruiser` (new dep + config) to enforce the import boundary.
- **Rejected because:** Heavier than needed for a single one-way rule.
- **Instead:** A one-block ESLint `no-restricted-imports` rule scoped to `packages/domain/**`, reusing
  the existing lint gate — zero new dependencies.
- **Refs:** ADR 0017; `eslint.config.mjs`.

## R-0007 — type-coverage threshold at 98%
- **Date:** 2026-06-23
- **Context:** Setting the strict type-coverage gate. Actual coverage is ~98.19%.
- **Tried:** `atLeast: 98`.
- **Rejected because:** ~0.2% headroom would nickel-and-dime future PRs that touch an untyped boundary
  (drizzle results, SAF-T parsing), blocking unrelated work.
- **Instead:** `atLeast: 97` — comfortable headroom, still catches a real regression. Ratchet up later.
- **Refs:** ADR 0017; `package.json`.
