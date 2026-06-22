# ADR 0008 — Open-source & self-hostable across the stack

- **Status:** Accepted
- **Date:** 2026-06-22

## Context
Saldo holds immutable financial records that must survive a decade and a tax audit, with EU data
residency. Vendor longevity and lock-in are first-order risks for a system of record.

## Decision
Every layer is open-source and self-hostable: PostgreSQL, MinIO/Garage (storage), graphile-worker
(jobs), Langfuse (LLM observability), SigNoz/Grafana + GlitchTip (APM/errors), Ollama/vLLM (LLM),
Docker + Kamal on Hetzner EU (deploy). The only unavoidable non-OSS dependency is the BankID/Vipps
eID broker (Criipto/Signicat), which Norwegian law effectively requires.

## Consequences
- No vendor can pull the rug; the whole stack can run on owned EU infrastructure.
- More ops responsibility than a managed-everything stack — accepted for sovereignty and longevity.
- Directly mitigates the "young trendy stack" longevity risk: we hold the code.

## Alternatives considered
- Managed SaaS (Neon/Supabase/Inngest/Sentry/Vercel) — faster to start, but reintroduces lock-in and
  residency questions the OSS path removes.
