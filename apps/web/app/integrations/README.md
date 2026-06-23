# integrations/

External-system clients. One folder per system. Rules: `.claude/rules/integrations.md`.
Docs: `docs/integrations/`.

Live: `enhetsregisteret/`. Planned: `skatteetaten/` · `altinn/` · `peppol/` · `banking/` (GoCardless +
camt.054) · `vipps/` · `email/` (nodemailer) · `llm/` (OpenAI-compatible client → Ollama/vLLM).

Each client: validates payloads with Zod at the boundary, keeps secrets in the server env, and pushes
long/retryable work to `app/jobs` (graphile-worker). LLM output is propose-only.
