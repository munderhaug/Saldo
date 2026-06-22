# Deploy

Persistent Node server via **Docker + Kamal** on **Hetzner EU** (ADR 0008). Companions:
self-hosted PostgreSQL, MinIO/Garage, Langfuse, and (optionally) a GPU box for the local LLM.

- `infra/docker/Dockerfile` — the app image.
- `config/deploy.yml` — Kamal config (add when provisioning: servers, registry, env, accessories
  for postgres/minio). Secrets come from the server environment, never the repo.
- Fly.io EU is an acceptable non-OSS shortcut if you want managed hosting early.

Run: `kamal setup` (first time), then `kamal deploy`.
