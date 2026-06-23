# Rejected approaches (the anti-ADR)

ADRs record decisions that were **kept**. This file records approaches **tried and abandoned**, and why —
so the next ephemeral session doesn't re-walk the same dead end (ADR 0019). Append-only; newest at the
bottom. One entry per abandoned approach. IDs are `R-NNNN`, gapless.

Template:

```
## R-NNNN — <short title>
- **Date:** YYYY-MM-DD
- **Context:** where/why this came up
- **Tried:** the approach
- **Rejected because:** the reason it didn't hold
- **Instead:** the approach adopted instead
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

## R-0008 — An i18n framework (i18next / LinguiJS / FormatJS) for microcopy
- **Date:** 2026-06-23
- **Context:** Building the keyed microcopy system (feat-keyed-microcopy → ADR 0024).
- **Tried:** Reaching for an established i18n library to hold the strings.
- **Rejected because:** Saldo is single-locale (Norwegian *enkeltpersonforetak*); a framework adds
  runtime locale negotiation, ICU parsing, and message-extraction tooling a single-locale product
  doesn't need, and it pulls
  copy out of type-checked source into extracted catalogs (losing compile-time key/param safety).
- **Instead:** A tiny in-repo catalog (`apps/web/app/copy`) with a typed `t()` accessor and `{name}`
  interpolation; `en` is a reference pinned to `nb` by `satisfies` + a parity test; a future locale
  promotes `en` and adds a locale arg to `t` — a separate decision, not pre-built.
- **Refs:** ADR 0024; `apps/web/app/copy/`.

## R-0009 — Full Duolingo-style gamification for engagement
- **Date:** 2026-06-23
- **Context:** Shaping the playful experience direction (ADR 0025) — the product owner wants it fun and
  untraditional, doable by anyone regardless of financial literacy.
- **Tried:** Borrowing game mechanics wholesale — points, badges, XP, levels, streaks, leaderboards — to
  make accounting "fun."
- **Rejected because:** The user does serious, infrequent, high-stakes work; engagement mechanics
  manufacture pressure and unseriousness, contradict "earn irrelevance" (experience-principles §7.1) and
  the Feeling Test, and risk making someone feel managed or stupid at exactly the wrong moment.
- **Instead:** A friendly comprehension *guide* + characterful agents (the Torpedo) + trade analogies +
  distinctive-but-legible visuals — warmth/guidance/delight, never engagement farming. The §5.5 sober
  rule stays sacrosanct.
- **Refs:** ADR 0025; `docs/experience-principles.md`.

## R-0010 — A sans + mono typography pairing (IBM Plex Sans + Plex Mono, or Hanken + Plex Mono)
- **Date:** 2026-06-23
- **Context:** Choosing the type system after the carnival colours landed (ADR 0026).
- **Tried:** Pairing a sans with a monospace for an "engineered, precise" numeric/data identity (no
  display serif).
- **Rejected because:** Sans + mono reads "precise but cold / developer-tool" — against ADR 0025's warm,
  untraditional brief — and the mono isn't even needed for alignment: IBM Plex Sans has true tabular
  figures, so money already aligns. The warmth at the peak moments (the honest-number reveal) needs a
  display face, which a mono can't carry.
- **Instead:** Fraunces (warm display) + IBM Plex Sans (body/UI + tabular figures), a clean two-font
  system, weights capped at 450.
- **Refs:** ADR 0026; `apps/web/app/app.css`.
