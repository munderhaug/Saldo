# ADR 0008 — Open-source & self-hostable across the stack

- **Status:** Accepted — partially revised by ADR 0015 (deploy / storage / host)
- **Date:** 2026-06-22

> **Revised 2026-06-23 (ADR 0015):** the deploy/host/storage stance below is superseded. Saldo now
> runs as a persistent Node server on an EU-region PaaS with **Cloudflare** as edge/CDN and **R2** for
> documents, and **Neon EU** (ADR 0013) for the database. The OSS-and-portability *principle* stands —
> the domain core, Postgres, Drizzle, and SQL migrations remain open and portable, and anti-lock-in is
> guaranteed by the SAF-T + raw data export — but "self-host every layer" is relaxed to "EU-resident,
> managed where it lowers ops, portable by export." Self-host Hetzner/Kamal is retained as the
> sovereignty fallback.
>
> **See ADR 0023:** Saldo's *own application code* is **proprietary**. ADR 0008 governs the
> open-source **stack/dependencies** and self-hostability of the architecture — not Saldo's own
> source licence.

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
