# Runbook

## Prerequisites
- Node 22 (`nvm use`), pnpm 9, Docker (for local Postgres/MinIO/Langfuse).
- `dbmate` (via `pnpm db:migrate`) and, optionally, Ollama for local LLM extraction.

## First-time setup
```bash
cp .env.example .env          # fill in values; .env is git-ignored and agent-denied
pnpm install
docker compose -f infra/compose.yaml up -d   # postgres, minio, langfuse
pnpm db:migrate               # apply SQL migrations (creates the ledger + integrity)
pnpm db:introspect            # generate apps/web/app/db/schema.ts from the DB
pnpm dev                      # RR7 dev server on http://localhost:3000
```

## Everyday commands
| Task | Command |
|---|---|
| Dev server | `pnpm dev` |
| Unit/property tests | `pnpm test` |
| Watch tests | `pnpm test:watch` |
| Typecheck | `pnpm typecheck` |
| Lint | `pnpm lint` · fix: `pnpm format` |
| New migration | `pnpm db:migrate:new <name>` then edit, then `pnpm db:migrate` |
| Regenerate Drizzle schema | `pnpm db:introspect` |
| SAF-T validate | `pnpm saft:validate` |

## Local LLM (optional)
```bash
ollama pull qwen2.5-vl        # vision model for receipt extraction
# LLM_BASE_URL=http://localhost:11434/v1 in .env (default). Swap for vLLM or a hosted endpoint.
```

## Deploy (Hetzner EU, Kamal)
```bash
kamal deploy                  # builds the Docker image and ships to the EU host
```
Postgres, MinIO, and Langfuse are provisioned alongside; secrets live in the server env only.

## CI (GitHub Actions)
`typecheck → lint → test → build → migration check → SAF-T XSD validation`, on an ephemeral
Postgres (Testcontainers). See `.github/workflows/ci.yml`.
