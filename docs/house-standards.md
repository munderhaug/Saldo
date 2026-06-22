# House Standards — Saldo

Conventions and recurring corrections for building Saldo with Claude Code. Derived from the
harness-design knowledge base; deviations from its defaults are noted with a reason.

## 1. Naming
- Packages: `@saldo/<name>`. Apps under `apps/`, libraries under `packages/`, repo tooling under `tools/`.
- Files: kebab-case for modules; colocated tests as `*.test.ts`.
- Migrations: `db/migrations/<timestamp>_<verb-noun>.sql` (dbmate).
- Skills: `verb-noun` (`add-migration`, `new-vat-scenario`).
- Branded types: `Øre`, `OrgNr`, `Kid`, `AccountNo`, `VatCode`.

## 2. Default tools & runtimes
- Package runner: `pnpm` (pinned via `packageManager`). Node 22 (`.nvmrc`).
- **Skill scripts: Node + `tsx`** — DEVIATION from the KB default (Python + uv). Reason: a TS
  monorepo; skill scripts should import the real `@saldo/domain` rather than reimplement logic.
- Preferred MCP: `postgres` (read-only, local dev), `context7`, `brreg`. Keep the set minimal.

## 3. Harness design rules
- **Single-agent loop is the default.** Escalate to a subagent only on a named, demonstrated need
  (verbose exploration, isolated review). Subagents are read-only; the parent does all edits.
- Build order: **CLAUDE.md → hooks → skills → plugins → MCP.**
- `CLAUDE.md` is hand-written, lean, and its prefix is kept stable (prompt-cache hits).
- **Must be a hook, not a prompt:** typecheck/lint after edits, blocking edits to generated files,
  denying `.env`/secret reads.
- Skills use progressive disclosure, one default + escape hatch (never a menu of equals). The
  load-bearing skills (`new-vat-scenario`, `saft-validate`) get trigger + with/without-skill evals
  before they're trusted.

### Consistency: match each concern to the cheapest mechanism
Secure consistency with the cheapest mechanism that works; reserve subagents for substantive review.
- **Hooks / lint / tests** (deterministic) — money rule, jsx-a11y, typecheck/lint gates, property tests.
- **Path-scoped rules** (always-on constraints) — money, ledger-integrity, vat, frontend, pwa-native,
  integrations, **data-handling (GDPR)**, **accessibility**, **design-system**.
- **Read-only subagents** (isolated review) — `vat-reviewer`, `privacy-reviewer`, `a11y-reviewer`,
  `integration-auditor`, plus `explore` / `migration-author` / `test-runner`.
- **Skills** (procedural) — add-migration, new-vat-scenario, saft-validate, new-feature, html-report,
  **design-review**.

Do NOT create subagents for "repo structure", "app design", or "accounting rules" — those are
constraints (rules/docs/tests/ADRs), not recurring reviews. Add a new subagent only on a demonstrated
need, and pair it with a deterministic backstop.

## 4. Security always/never
- NEVER commit secrets; never read `.env*`/`secrets/**` (denied in settings). Never let the domain
  core call the network. Never auto-`git push` (it's an `ask`).
- ALWAYS validate external payloads with Zod. ALWAYS keep ledger integrity in SQL. ALWAYS add a
  test for new money/VAT/posting behavior.

## 5. Recurring corrections (grow this over time)
> Add an item whenever the same correction is needed twice.
- (none yet — fill in during the build)

Last updated: 2026-06-22
