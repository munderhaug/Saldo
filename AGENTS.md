# AGENTS.md — Saldo

Canonical guidance for AI coding agents working in this repo — the cross-tool standard
([agents.md](https://agents.md)). **Claude Code** reads it via `CLAUDE.md` (which imports this file);
**other agents** (Codex, Cursor, Copilot, Gemini CLI, …) read it directly. Keep it lean; deeper,
path-scoped detail lives in `.claude/rules/` (loaded only when you touch the matching code).

Saldo — accounting/invoicing for small Norwegian *enkeltpersonforetak*. TypeScript monorepo (pnpm +
Turborepo). React Router 7 (framework mode) + shadcn/ui (Tailwind v4) + PostgreSQL. Native-feel PWA.
Full stack: `docs/tech-stack.md`. Experience & voice: `docs/experience-principles.md`.
**Saldo's own code is proprietary** (see `LICENSE`, ADR 0023); the stack is OSS + self-hostable (ADR 0008).

## Setup · build · test (Node 22 via `nvm use`, pnpm 9)

```
pnpm install                                   # install deps
pnpm dev                                        # RR7 dev server (http://localhost:3000)
pnpm typecheck · pnpm lint · pnpm format:check  # static gates (pnpm format = fix in place)
pnpm test                                       # vitest (domain: exhaustive + fast-check)
pnpm lint:repo                                  # docs/harness hygiene + no-contradiction gate
pnpm db:migrate · pnpm db:introspect · pnpm db:lint   # SQL migrations / schema gen / squawk
pnpm backlog                                    # the highest-value READY task (the task graph)
```
Full first-run + deploy: `docs/runbook.md`. PRs land green and reviewed — never a direct push to `main`.

## Architecture (full map: docs/architecture.md)
- **packages/domain** (`@saldo/domain`) — pure accounting core (money, ids, VAT, posting,
  rules). No I/O, no Date.now/Math.random (inject them). Runs in route actions and the
  browser. The one hard boundary.
- **apps/web/app/db** — Drizzle queries + types. Schema is generated from SQL via
  introspection. Integrity (triggers/RLS/constraints/invoice-counter) lives in
  `db/migrations/*.sql`, not the ORM.
- **apps/web/app/contracts** — Zod schemas. Single source of truth for shapes.
- **apps/web/app/routes** — loaders/actions are the typed client↔server boundary (no separate API).

## Hard invariants (NEVER violate)
- Money is integer **øre**, type `Øre`. Never `number`, never float math. Use addØre/subØre/mulRate.
- Ledger is **append-only**. Never UPDATE/DELETE a posted voucher or issued invoice — correct
  via motbilag / kreditnota.
- Invoice numbers are **gapless** — allocated from a per-org counter row in the issuing tx,
  not a Postgres SEQUENCE (sequences leave gaps on rollback).
- Posting is server-authoritative and enforced in SQL. Client validation is UX only.
- MVA status {under_threshold | unntatt | registered_standard | registered_zero_rated} drives all posting.
- AI proposes; the rules engine validates; a human confirms — explicitly for consequential actions
  (money leaving, filing), passively via a grace-window/untap for high-confidence routine items
  (ADR 0002). AI never writes to the ledger.
- EU AI Act: only the LLM features are AI systems (Art. 3(1)); the rules engine is NOT (Recital 12).
  Every AI-proposed value is disclosed as AI and labelled **AI-assisted** with logged provenance
  (Art. 50). AI must NEVER score/profile a natural person's creditworthiness — that makes Saldo a
  high-risk provider (Annex III §5(b)). See ADR 0022 / docs/regulatory/eu-ai-act.md.
- VAT codes & accounts come from the committed SAF-T code lists — never hardcode from memory.
- UI keeps a semantic-HTML, server-authoritative substrate; native polish is layered on top, never replaces it.

## Quality bar (non-negotiable — full text: docs/quality-bar.md)
Production-ready, held to a high bar — not a throwaway MVP. A change is done only when typecheck, lint,
format, test, and audit are green; new behavior is tested (domain: exhaustive + property); ledger
changes have a Testcontainers integrity test; UI meets WCAG 2.2 AA; inputs are Zod-validated and
tenancy honored; an ADR + STATUS are updated; and it lands via a reviewed PR — never a direct push to
main. Prefer a mechanical gate over a reminder.

## Conventions
Strict TS, no `any`. Zod at all boundaries. New VAT/posting behavior requires a test in
packages/domain. Branded types for domain primitives (Øre, OrgNr, Kid, AccountNo, VatCode).
Domain detail lives in path-scoped rules under .claude/rules/ (they load when you touch the code).

## Harness
Single-agent loop by default; escalate to subagents only on demonstrated need. Hooks enforce
typecheck/lint/tests deterministically. See docs/house-standards.md.

## Canonical sources (state a fact once; link, don't restate)
| Fact | Lives in |
|---|---|
| Hard invariants | **this file** + `.claude/rules/` (path-scoped detail) |
| Decisions (the "why") | `docs/decisions/` ADRs + `rejected.md` (the anti-ADR) |
| Current stack | `docs/tech-stack.md` (changes need an ADR) |
| Product scope / features | `docs/saldo-build-specification.md` |
| Experience, voice, design | `docs/experience-principles.md` + `.claude/rules/experience-voice.md` |
| Current state (handover) | `docs/STATUS.md` |
| Plan / reasoning | `docs/roadmap.md` |
| Task graph (what's next) | `docs/backlog/tasks.json` (`pnpm backlog`) |
| Regulatory facts (cited) | `docs/regulatory/` + raw captures in `db/reference/` |

Anything else is a pointer to one of these — don't restate a fact outside its home.
