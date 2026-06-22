# STATUS — handover

> Living handover doc. Update at the END of every session (see `.claude/skills/handover`).
> The next session reads this first, then reconciles against `git log` / actual code — **trust the code**.

**Last updated:** 2026-06-22 — session: tech-stack review + scaffold + handover workflow
**Branch:** `claude/tech-stack-review-kspak0`

## Verified state
- ✅ Toolchain **green** at commit time: `pnpm install` (lockfile committed), `pnpm typecheck`
  (domain + web), `pnpm lint` (custom `saldo/no-money-arithmetic` rule confirmed firing + jsx-a11y),
  and `pnpm test` (25 domain tests incl. fast-check pass; web `--passWithNoTests`).
- Commits are **unsigned locally** (this env has no signing key — 0-byte placeholder); they should show
  Verified once pushed through the git proxy. Committer email is correct (`noreply@anthropic.com`).

## Active phase
Pre–Phase 0. Scaffold complete; next is Phase 0 foundation (build-spec §16).

## Done (this session)
- Revised the build spec; **locked the tech stack** (`docs/tech-stack.md`) with ADRs 0001–0011.
- Scaffolded the monorepo: `apps/web` (RR7 + shadcn/Tailwind v4 + PWA), `packages/domain` (pure core
  with tested Øre / ids / voucher-balance), `tools/eslint-plugin-saldo`, `db/migrations` core ledger
  SQL (4 integrity guarantees + RLS), infra, CI.
- Agentic harness: CLAUDE.md, path-scoped rules, subagents, skills, hooks, `.mcp.json`.
- Extended harness: data-handling / accessibility / design-system rules, privacy & a11y reviewer
  subagents, jsx-a11y lint backstop, design-review skill.
- Added this handover workflow (STATUS.md + handover skill + SessionStart hook).

## In progress
- (nothing mid-change)

## Next up (ordered)
1. Push the branch (pending user authorization); confirm commits show **Verified** on GitHub.
2. Begin Phase 0: commit the SAF-T reference lists under `db/reference/saf-t`; expand the ledger schema
   + Testcontainers integrity tests (verify the triggers actually block bad mutations); scaffold OIDC
   auth and the `app.current_org` GUC middleware.
3. Run the core ledger migration against the compose Postgres (`pnpm db:migrate`) and `pnpm db:introspect`
   to generate the real Drizzle schema.

## Open decisions (need the human — build-spec §18)
- eID broker: Criipto vs Signicat — before Phase 0 hardens.
- Hosted LLM vs local default — before Phase 4 (default is local).
- Working name "Saldo" (placeholder).

## Known issues / to verify
- `package.json` dependency versions are best-guess latest; `pnpm install` may adjust them.
- The custom `saldo/no-money-arithmetic` ESLint rule is heuristic (type-text match) — confirm it fires
  on a real `Øre + Øre` once deps are installed.
