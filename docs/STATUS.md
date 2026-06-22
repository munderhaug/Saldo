# STATUS — handover

> Living handover doc. Update at the END of every session (see `.claude/skills/handover`).
> The next session reads this first, then reconciles against `git log` / actual code — **trust the code**.

**Last updated:** 2026-06-22 — session: tech-stack review + scaffold + handover workflow
**Branch:** scaffold is merged to `main` (`6c39a55`). Start Phase 0 on a new branch.

## Verified state
- ✅ Full **production gate suite** green: `format:check`, `pnpm audit --audit-level=high`
  (**no known vulnerabilities**), `typecheck`, `lint` (custom money rule + jsx-a11y), `test`
  (25 domain tests incl. fast-check). Web build OK.
- ✅ Supply chain hardened: drizzle-orm → 0.45 (SQL-injection advisory fixed), vitest → 3, vite → 6,
  esbuild override ≥0.25.
- ⚠️ Workflow change: `main` should be **branch-protected**; all work from here lands via reviewed PRs
  (see CONTRIBUTING.md / docs/quality-bar.md). No more direct pushes to main.
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
- Established the **quality bar / Definition of Done** (`docs/quality-bar.md`, wired into CLAUDE.md +
  house-standards), governance (CONTRIBUTING, SECURITY, CODEOWNERS, Dependabot), hardened deps to a
  clean audit, and tightened CI (audit + format:check + introspect gates).

## In progress
- (nothing mid-change)

## Next up (ordered) — Phase 0 (build-spec §16)
Branch off main: `git checkout -b claude/phase-0-foundation`. Don't commit to main directly.
1. `docker compose -f infra/compose.yaml up -d`; `pnpm db:migrate`; `pnpm db:introspect` (generates the
   real `apps/web/app/db/schema.ts`).
2. **Testcontainers integrity tests**: prove the SQL triggers block imbalance, mutation of a posted
   voucher, posting into a locked period, and that `allocate_invoice_number` stays gapless across a
   rolled-back transaction.
3. Commit **SAF-T reference data** under `db/reference/saf-t`; load codes/accounts from it.
4. Expand `@saldo/domain`: VAT code/account model wired to SAF-T; begin posting-derivation + rules
   engine (input-VAT fork by MVA status), test-first (exhaustive + fast-check).
5. Scaffold OIDC auth (openid-client + oslo + Postgres sessions) and the `app.current_org` GUC
   middleware; wire Enhetsregisteret lookup. Keep CI green.

## Open decisions (need the human — build-spec §18)
- eID broker: Criipto vs Signicat — before Phase 0 hardens.
- Hosted LLM vs local default — before Phase 4 (default is local).
- Working name "Saldo" (placeholder).

## Known issues / to verify
- `package.json` dependency versions are best-guess latest; `pnpm install` may adjust them.
- The custom `saldo/no-money-arithmetic` ESLint rule is heuristic (type-text match) — confirm it fires
  on a real `Øre + Øre` once deps are installed.
