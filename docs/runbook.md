# Runbook

## Prerequisites
- Node 22 (`nvm use`), pnpm 9, Docker (for local Postgres; MinIO emulates the S3/R2 API locally).
- `dbmate` (via `pnpm db:migrate`) and, optionally, Ollama for local LLM extraction.

## First-time setup
```bash
cp .env.example .env          # fill in values; .env is git-ignored and agent-denied
pnpm install
docker compose -f infra/compose.yaml up -d   # local Postgres + MinIO (S3/R2 emulation)
pnpm db:migrate               # apply SQL migrations (creates the ledger + integrity)
pnpm db:introspect            # generate apps/web/app/db/schema.ts from the DB
pnpm dev                      # RR7 dev server on http://localhost:3000
```

First run: with `DEV_AUTH=true` in `.env`, create the first account via «Opprett konto» on the login
page (ADR 0064 — the dev provider only; production auth is BankID/Vipps via OIDC).

## Everyday commands
| Task | Command |
|---|---|
| Dev server | `pnpm dev` |
| Unit/property tests | `pnpm test` |
| Typecheck · Lint · Format | `pnpm typecheck` · `pnpm lint` · `pnpm format:check` (write: `pnpm format`) |
| Repo hygiene · migration lint | `pnpm lint:repo` · `pnpm db:lint` |
| Backlog (what's next) | `pnpm backlog` (`ready` · `list` · `validate`) |
| New migration | `pnpm db:migrate:new <name>` then edit, then `pnpm db:migrate` |
| Regenerate Drizzle schema | `pnpm db:introspect` |
| SAF-T validate | `pnpm saft:validate` (generate + tie-out + well-formedness + XSD — a real CI gate) |
| MVA-melding validate | `pnpm mva:validate` (well-formedness + grounded subset + tie-out) |
| EHF/PEPPOL validate | `pnpm ehf:validate` (well-formedness + BIS Billing 3.0 subset) |

## Local LLM (optional)
```bash
ollama pull qwen2.5-vl        # vision model for receipt extraction
# LLM_BASE_URL=http://localhost:11434/v1 in .env (default). Swap for vLLM or a hosted endpoint.
```

## Deploy
Per **ADR 0015**: a persistent **Node server on an EU-region PaaS**, with **Cloudflare** as edge/CDN
and **R2** (EU jurisdiction) for documents; the database is **Neon EU** (ADR 0013). Migrations run via
the **`deploy-migrate`** GitHub Actions workflow (`dbmate up` against Neon, protected `production`
env) — see [`docs/runbooks/neon-provisioning.md`](runbooks/neon-provisioning.md). Self-host
Hetzner/Kamal is retained only as the sovereignty fallback (ADR 0008/0015). Secrets live in the
server/CI environment only, never in the repo.

## Disaster recovery + document retention
Per **ADR 0038**: Neon point-in-time restore (PITR) with a **tested** restore drill, and R2 bucket-lock
WORM for the 5-year statutory document hold vs. ledger immutability — see
[`docs/runbooks/disaster-recovery.md`](runbooks/disaster-recovery.md). Rehearse the restore chain
locally with `pnpm dr:drill` (`tools/restore-drill.sh` + `db/dr/verify-restore.sql`).

## CI (GitHub Actions)
`ci.yml` gates on `audit → typecheck → lint → lint:repo → backlog validate → format:check →
type-coverage → test → db:lint → db:migrate → db:introspect → build → saft:validate` against an
ephemeral Postgres service (the integrity suite uses Testcontainers). Separate workflows:
`codeql.yml` (SAST), `security.yml` (gitleaks + CycloneDX SBOM), `freshness.yml` (weekly cron),
`deploy-migrate.yml`. See `.github/workflows/`.
