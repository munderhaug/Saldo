---
paths: ["apps/web/app/integrations/**", "apps/web/app/jobs/**", "apps/web/app/auth/**"]
---
# Integrations rules

- Secrets come from the server environment only — never in code, never logged. The domain core
  makes NO external calls.
- Every external payload is validated with **Zod** at the boundary before use.
- Long-running / retryable work goes through **graphile-worker** jobs, not inline in actions.
- Auth: OIDC via `openid-client` + `oslo`, server-side Postgres sessions. BankID/Vipps through the
  Criipto/Signicat broker is app login; **ID-porten is separate**, scoped to Altinn filing only.
- LLM calls go through the OpenAI-compatible client abstraction (local Ollama/vLLM by default);
  output is **propose-only** and must pass the rules engine before any human commit.
- Respect provider limits noted in docs/integrations/ (e.g. GoCardless can be ~4 calls/day/account
  — cache & batch).
- SAF-T / EHF XML is validated against the official XSD / VEFA before it is considered correct.
