# ADR 0017 — Mechanical quality gates & supply-chain hardening

- **Status:** Accepted
- **Date:** 2026-06-23

## Context
The quality bar (`docs/quality-bar.md`) was largely honor-system, and two harness hooks failed
**open** — `precommit-check.sh` silently `exit 0`'d when `node_modules` was absent, and
`block-generated.sh` allowed an edit through if the tool payload failed to parse. A gate that can
silently pass is not a gate. Separately, CI ran the correctness suite but had no supply-chain or
SAST coverage, and pinned its GitHub Actions to mutable `@v4` tags (a known supply-chain risk).
CLAUDE.md's standing instruction is *"prefer a mechanical gate over a reminder."*

## Decision
Make the bar deterministic, and keep anything flaky away from the correctness gate.

- **Fail-closed hooks.** `precommit-check.sh` now blocks (exit 2) with a loud message when
  `node_modules` is missing; `block-generated.sh` emits a sentinel and blocks on a JSON parse error.
- **Turn-end green-bar.** A `Stop` hook (`green-bar.sh`) runs typecheck + lint + the **pure domain
  tests** at the end of a turn (the slow Testcontainers suite is left to CI). It honors
  `stop_hook_active` to avoid stop-loops.
- **Doc/harness hygiene at edit time.** A second `PostToolUse` hook runs `lint:repo` after edits to
  `docs/**` or `.claude/**`, catching a broken ADR cross-ref / dead link / missing cited source
  before CI.
- **Architectural boundary.** An ESLint `no-restricted-imports` rule enforces `packages/domain ↛
  apps/web` (the domain's one-way purity).
- **Core CI gate (`ci.yml`).** Adds `type-coverage` (strict, **≥ 97%**, config in `package.json`)
  and `db:lint` (**squawk** unsafe-migration linter, run over the **forward** migration sections
  only via `tools/migrations-up.mjs`, configured in `squawk.toml`). The 3 setup actions are
  **SHA-pinned**.
- **Isolated scanners.** `codeql.yml` (SAST) and `security.yml` (**gitleaks** secret scan +
  **CycloneDX** SBOM) run in their own workflows with SHA-pinned actions, so a scanner hiccup can
  never block the correctness gate. The SBOM is `continue-on-error` (an audit artifact, not a gate).
- **Freshness loop.** `freshness.yml` (weekly cron) runs `lint:repo` + `pnpm audit` + `knip` and
  funnels findings into **one rolling tracking issue** via `gh`; the job itself stays green.
- **`/new-adr` skill** scaffolds the next-numbered ADR (kills the wrong-number / phantom-ADR class);
  `/verify` is wired into the new-feature loop as an independent **maker ≠ judge** step.

## Consequences
- The bar is now enforced, not remembered: a red typecheck/lint/coverage/migration-safety check, a
  committed secret, or a doc contradiction fails mechanically.
- **`knip` is advisory** (cron-only), not a blocking gate: on a foundation repo it correctly flags
  legitimately-pending items (the documented unused frontend deps, not-yet-wired modules); blocking
  on those would force suppressing real findings. It graduates to a gate as the surface fills in.
- **squawk** excludes a handful of rules that are deliberate project choices or irrelevant to a
  greenfield initial schema (`char(9)` org-nr, `int` years, no live-table lock timeouts yet). Each
  exclusion is documented in `squawk.toml` and revisited the first time a migration touches a
  populated table.
- SHA-pinned actions need bumping; Dependabot's `github-actions` ecosystem already does that weekly.
- type-coverage's 97% threshold has deliberate headroom over the current ~98%; ratchet it up over time.

## Alternatives considered
- **dependency-cruiser** for the domain↛web boundary — heavier (new dep + config) than a one-block
  ESLint rule that reuses the existing lint gate.
- **knip as a blocking gate** — rejected for now; see Consequences (would force suppressing real,
  intentionally-deferred findings on a foundation repo).
- **`@cyclonedx/cyclonedx-npm`** for the SBOM — it shells out to `npm` and misreads a pnpm workspace;
  `@cyclonedx/cdxgen -t pnpm` reads `pnpm-lock.yaml` correctly.
- **Mutable action tags (`@v4`)** — convenient but a supply-chain risk (a moved tag ships new code).
