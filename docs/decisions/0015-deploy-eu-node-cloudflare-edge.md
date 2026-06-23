# ADR 0015 — Deployment: persistent Node on an EU PaaS, Cloudflare as edge/CDN + R2 (revises ADR 0008)

- **Status:** Accepted
- **Date:** 2026-06-23

## Context
ADR 0008 committed to self-hosting every layer for sovereignty. For a **solo-maintained** system of
record, that operational burden (running Postgres, object storage, observability, an LLM host, and a
Kamal/Hetzner deploy) is the dominant long-term sustainability risk. Separately, the app's compute is
**server-shaped** (invoice PDF rendering, SAF-T XML build + XSD validation, OCR/vision-LLM
extraction, durable background jobs) and **single-country** (Norway) — so a global serverless **edge**
runtime (e.g. Cloudflare Workers) is a poor fit: it fights those workloads (CPU/time limits, no
persistent process, non-standard Node) while buying global-edge benefits Saldo does not need.

## Decision
Deploy the React Router 7 app as a **persistent Node server on an EU-region PaaS** (e.g.
Railway / Render / Fly EU — interchangeable container hosts), with **Cloudflare as the edge layer**
(CDN, WAF/DDoS, DNS) and **Cloudflare R2** (EU jurisdiction) for document storage. The database is
**Neon EU** (ADR 0013), reached via **Hyperdrive** when fronted by Cloudflare. Anti-lock-in is
guaranteed at the **product** level by the SAF-T + raw data export, not by self-hosting every layer.

Because this keeps a standard Node runtime, **graphile-worker stays in-process (ADR 0010 stands)** and
the **local-LLM option stays open (ADR 0009 stands)**.

## Consequences
- Near-zero server ops vs self-hosting, while keeping standard Node (no edge-runtime limits on
  PDF / SAF-T / LLM / jobs) and clean EU data-at-rest (Neon EU + R2 `eu`).
- **Revises ADR 0008**: "self-host every layer" becomes "EU-resident, managed where it lowers ops,
  portable by data export." Object storage moves MinIO/Garage → **R2** (or any S3-compatible EU store
  behind a swappable interface). Self-host Hetzner/Kamal is retained as the sovereignty fallback.
- Must sign Cloudflare's **EU DPA** and confirm edge / Regional-Services residency for personal data.

## Alternatives considered
- **Cloudflare Workers-native** — lowest ops, first-class RR7 support, but the edge runtime fights
  server-shaped compute and adds lock-in on Workers/Workflows glue; kept as the documented runner-up.
- **Self-host Hetzner/Kamal** (ADR 0008 original) — max sovereignty, max ops; retained as fallback.
- **Vercel** — weaker EU-compute residency for a financial app. **Big cloud (AWS/GCP EU)** — ops
  overkill for a single-app, solo-maintained system.
