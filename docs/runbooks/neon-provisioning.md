# Runbook — provision & build the Neon database

How to stand up the hosted Postgres (Neon EU, **ADR 0013**) and apply Saldo's schema. The schema +
integrity (triggers, RLS, the gapless counter, the auth tables) is **migration-driven** — `dbmate`
applies `db/migrations/*.sql` over a normal connection string. None of it needs the Neon API/MCP; that
API is only for control-plane actions (creating the project), which you do once in the console.

## 1. Create the project (Neon console, once)

- New project, region **EU** (`aws-eu-central-1`) — residency matters (`.claude/rules/data-handling.md`).
- Copy the **owner** connection string. Ensure it ends with `?sslmode=require` (Neon requires TLS).
- This owner role runs migrations; the app connects later as the non-owner `saldo_app` role
  (**ADR 0012 / 0020**).

## 2. Apply the migrations (build the schema)

Pick one:

- **CI (recommended):** add the owner URL as the `production` Environment secret **`NEON_DATABASE_URL`**
  (repo Settings → Environments → `production`; add a required reviewer there). Run the
  **Deploy migrations** workflow (`.github/workflows/deploy-migrate.yml`) → it runs `pnpm db:migrate`
  against Neon. Idempotent and re-runnable.
- **From your machine:** `DATABASE_URL='postgres://…neon…?sslmode=require' pnpm db:migrate`. Keeps the
  credential off any shared environment entirely.

Either way this builds every table + the four SQL guarantees + RLS + the `app_user`/`user_session`/
`membership` auth tables, and **creates the `saldo_app` role** (without a password).

## 3. Give the app role a secret and point the app at it

The app must connect as `saldo_app` so RLS actually applies (**ADR 0012**) — the owner bypasses it.

```sql
-- once, as the owner (psql against Neon):
ALTER ROLE saldo_app WITH PASSWORD '<a strong, stored secret>';
```

- The **app runtime** `DATABASE_URL` = the `saldo_app` connection string (a *separate* secret from the
  owner URL). `env.ts` expects this.
- **Migrations** keep using the **owner** URL; the running app uses the **`saldo_app`** URL. Two roles,
  two secrets — never the owner URL at runtime.

## 4. Verify on Neon (the deferred checks from STATUS)

- **RLS bites for `saldo_app`:** connect as `saldo_app`, `SET app.current_org`, confirm cross-tenant
  reads/writes are blocked. (The committed `rls-tenancy` / `rls-coverage` suites encode exactly this —
  point `SALDO_TEST_PG_URI` at a throwaway Neon database to run them against Neon itself.)
- **`SET LOCAL app.current_org` is preserved end-to-end**, especially once Cloudflare **Hyperdrive**
  fronts Neon (it pools connections; `withOrgTx` relies on transaction-scoped `SET LOCAL`). Verify in a
  staging round-trip before go-live.
- **Residency / DPA:** confirm the EU region and sign Cloudflare's EU DPA + SCCs (world-class-roadmap
  Part 6) before production data lands.

## Notes

- Secrets never go in the cloud-environment "Environment variables" box (it's shared/visible) — use a
  CI/Environment secret or your own machine.
- Local dev uses a throwaway local Postgres (the environment setup script), not Neon; Neon is real
  Postgres, so what passes locally / in CI passes here.

See: ADR 0013 (Neon), ADR 0012 (FORCE RLS + app role), ADR 0020 (auth), `docs/STATUS.md` known issues.
