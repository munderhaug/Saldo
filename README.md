# Saldo

Compliance-grade accounting & invoicing for small Norwegian **enkeltpersonforetak** (ENK) under
500,000 NOK annual revenue. An immutable ledger, correct MVA, a complete audit trail, and
trustworthy integrations — wrapped in a clean forms-and-reports UI with a native-feel mobile PWA.

## Quick start
```bash
nvm use
cp .env.example .env
pnpm install
docker compose -f infra/compose.yaml up -d
pnpm db:migrate && pnpm db:introspect
pnpm dev
```

## Where things live
| Path | What |
|---|---|
| `packages/domain` | `@saldo/domain` — PURE accounting core (money, ids, VAT, posting, rules). No I/O. |
| `apps/web` | React Router 7 app (loaders/actions, shadcn UI, db, contracts, integrations, jobs, auth). |
| `db/migrations` | Raw SQL — the source of truth for schema + all ledger integrity. |
| `db/reference/saf-t` | Committed official SAF-T codes/accounts/XSD. |
| `tools/eslint-plugin-saldo` | Custom lint rule banning raw arithmetic on money. |
| `docs/` | Overview, glossary, domain model, architecture, **tech-stack (current)**, ADRs, integrations. |
| `.claude/` | Agentic harness: AGENTS.md + CLAUDE.md, path-scoped rules, subagents, skills, hooks. |

## Read first
- **Current stack:** [`docs/tech-stack.md`](docs/tech-stack.md)
- **Canonical spec:** [`docs/saldo-build-specification.md`](docs/saldo-build-specification.md)
- **Architecture:** [`docs/architecture.md`](docs/architecture.md) · **Decisions:** [`docs/decisions/`](docs/decisions/)
- **Build sequencing:** spec §16 (start with Phase 0).

## Hard invariants
The non-negotiables (integer øre · append-only ledger · gapless invoice numbers · SQL-enforced
posting · MVA-status-driven posting · propose-only AI) live in **[`AGENTS.md`](AGENTS.md)** — the
single source. Read them there before touching money, the ledger, VAT, or posting.
