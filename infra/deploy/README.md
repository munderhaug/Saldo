# Deploy

Per **ADR 0015**: the app ships as a **persistent Node container** (`infra/docker/Dockerfile`) running
in **one EU-region PaaS** (Railway / Render / Fly EU — interchangeable container hosts), fronted by
**Cloudflare** (edge/CDN, WAF/DDoS, DNS) with **R2** (EU jurisdiction) for documents. The database is
**Neon EU** (ADR 0013), reached via **Hyperdrive** when fronted by Cloudflare.

- `infra/docker/Dockerfile` — the multi-stage app image (Node 22; `pnpm … start`).
- Migrations run from CI via the **`deploy-migrate`** workflow (`dbmate up` against Neon, under a
  protected `production` environment) — not from the app process. See
  `docs/runbooks/neon-provisioning.md`.
- Secrets come from the PaaS / CI environment only, never the repo.

## Sovereignty fallback (ADR 0008, revised by 0015)

A fully self-hosted stack — Docker + **Kamal** on **Hetzner EU**, with self-hosted PostgreSQL,
MinIO/Garage, and Langfuse — remains supported for operators that require maximum data sovereignty. It
trades managed convenience for operational burden; `infra/compose.yaml` runs the equivalent locally.

The runtime/storage choices and the residual go-live checklist (sign Cloudflare's EU DPA, confirm the
PaaS EU region, verify Hyperdrive preserves `SET LOCAL`) live in `docs/tech-stack.md` and
`docs/roadmap.md` (Part 0).
