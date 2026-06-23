# STATUS — handover

> Living handover doc. Update at the END of every session (see `.claude/skills/handover`).
> The next session reads this first, then reconciles against `git log` / actual code — **trust the code**.

**Last updated:** 2026-06-22 — session: Phase 0 step 5 (RLS tenancy hardening + tenancy middleware)
**Branch:** `claude/upbeat-darwin-hepsel` (off `main`, which now includes Phase 0 steps 1–4 via
PR #6 + Neon MCP via PR #8). HEAD `014f38c`. Lands via reviewed PR — no direct pushes to `main`.

> ⚠️ **This environment blocks ALL external network egress except the npm registry.** Neon
> (`*.neon.tech`), Criipto, and Brønnøysund (`data.brreg.no`) all return 403 "Host not in allowlist",
> and the `brreg`/Neon MCP servers fail for the same reason. Local Postgres 16 (run via `initdb`/
> `pg_ctl`, since Docker is also unavailable) stood in for migrate/introspect/RLS verification. This
> is why step-5 auth's live OIDC and step-6 Enhetsregisteret could not be built+validated here.

## Verified state
- ✅ Full **production gate suite** green at HEAD `014f38c`: `typecheck`, `lint`, `lint:repo`,
  `format:check`, `pnpm audit --audit-level=high` (**no known vulnerabilities**), `test`
  (**90 domain** incl. fast-check + **17 Testcontainers** integration, of which 8 are the new RLS
  suite), web `build`. (Testcontainers needs Docker; absent here so they skip locally — they run in CI.)
- ✅ **Local ledger DB live + introspected:** `infra/compose.yaml` Postgres up; `pnpm db:migrate`
  applied the core ledger; `pnpm db:introspect` generated the real `apps/web/app/db/schema.ts`
  (+ `relations.ts`). Generated Drizzle output is now treated as generated (gitignored journal,
  Prettier/ESLint-ignored) so hand-formatting never fights the generator.
- ✅ **SQL integrity is PROVEN, not asserted:** Testcontainers tests in
  `apps/web/test/integrity/` spin up real Postgres and show each guarantee blocks the bad case —
  imbalance (deferred trigger at commit), posted-voucher/posting mutation, locked-period posting,
  and gapless `allocate_invoice_number` across a rolled-back tx.
- ✅ Dev-only `testcontainers` added; its vulnerable transitives pinned via pnpm overrides
  (`undici >=6.27.0`, `uuid >=11.1.1`) — audit stays clean.
- ✅ **RLS tenancy now bites at runtime (ADR 0012).** Migration `20260622225726_tenancy_force_rls_app_role`
  adds a non-owner `saldo_app` role, `FORCE ROW LEVEL SECURITY` + explicit `WITH CHECK` on all tenant
  tables (incl. the previously-unprotected `invoice_counter`), and makes `allocate_invoice_number`
  `SECURITY DEFINER` (now also rejects an org arg ≠ `app.current_org`). The **5th Testcontainers
  guarantee** (`rls-tenancy.integration.test.ts`, separate app-role harness `db.appSql`) proves an org
  reads/writes only its own rows and cannot bypass; up+down both apply; schema re-introspected.
- ✅ **Tenancy middleware** `withOrgTx(db, orgId, fn)` (`app/auth/middleware.ts`) — per-request
  `SET LOCAL app.current_org` in a transaction; proven to scope RLS through the real Drizzle path.
- ✅ **Privacy-reviewer** ran on the branch: no blockers; its findings folded in (the allocate
  arg-vs-GUC guard) or recorded in ADR 0012 (the `TO public` and DELETE-grant rationale).
- ✅ Verified beyond local PG: the migration applies and isolates correctly on a **non-superuser-owner
  database** built to mirror Neon's role model (FORCE RLS bites the owner; cross-tenant allocate
  blocked via `WITH CHECK`).

## Active phase
**Phase 0 (Foundation) — in progress.** Steps 1–4 merged to `main`. Step 5 RLS/tenancy DONE this
session; step-5 auth (OIDC + sessions) and step-6 Enhetsregisteret remain (blocked from live build
here by the egress allowlist — see top banner + Known issues).

## Merged to `main` (prior session, PR #6/#8) — Phase 0 steps 1–4
- (1) infra + introspected schema; (2) Testcontainers proofs of the 4 SQL guarantees; (3) cited SAF-T
  reference data + 2026 MVA rates; (4) domain VAT engine with the input-VAT fork. (90 domain + 9
  integration tests.)

## Done (this session) — Phase 0 step 5 (tenancy)
- **RLS hardening** — `2c9ee52` (migration + 5th Testcontainers guarantee + ADR 0012 + rule + STATUS).
- **Tenancy middleware** `withOrgTx` — `a579627` (`app/auth/middleware.ts` + ORM-path Testcontainers test).
- **Privacy-review hardening** — `014f38c` (allocate arg-vs-GUC guard + ADR 0012 notes).

## In progress
- (nothing mid-change — clean tree at `014f38c`)

## Next up (ordered) — Phase 0 steps 5–6 (build-spec §16)
5a. **RLS tenancy gap — ✅ DONE this session (ADR 0012).** FORCE RLS + non-owner `saldo_app` role +
   `WITH CHECK` + middleware + 5th Testcontainers guarantee.
5b. **Auth (Criipto OIDC) — TODO (needs an env with egress + a Criipto tenant).** Build it on the
   tenancy primitive already in place (`withOrgTx`). Grounding gathered this session:
   - Use **`openid-client` v6** (the modern functional API; v5's `Issuer`/`Client` classes are gone).
   - **`oslo` is DEPRECATED** — use **`@oslojs/crypto` + `@oslojs/encoding`** for the session token
     (random token → store its SHA-256 hash; the Lucia pattern) instead. Update the `auth/README` line.
   - Pieces: `oidc.ts` (discovery, authorize URL w/ PKCE+state+nonce, callback exchange + iss/nonce
     checks), `session.ts` (server-side Postgres sessions: new `app_user` + `user_session` tables via a
     migration — NOT org-RLS'd since they're looked up pre-org by token/subject; grant `saldo_app`),
     routes `/auth/login` `/auth/callback` `/auth/logout`. Cookies `HttpOnly`/`Secure`/`SameSite=Lax`;
     rotate on login. Validate the callback params with Zod. Then resolve user→org and call `withOrgTx`.
   - App must connect as `saldo_app`; wire `DATABASE_URL`=app-role + a separate owner URL for migrate
     into `app/db/client.ts` + `.env.example`. Run privacy-reviewer. BankID provider is onboarding-gated
     (Phase 1 per `docs/integrations/bankid-criipto.md`); email/password is the acceptable early-dev path.
6. **Enhetsregisteret lookup — TODO (needs egress to `data.brreg.no`).** `app/integrations/enhetsregisteret/`:
   `GET https://data.brreg.no/enhetsregisteret/api/enheter/{orgnr}` (open API, no auth), validate orgnr
   via `@saldo/domain` `OrgNr` (mod11) first, Zod-parse the response (capture a raw sample to
   `db/reference/brreg/` per the doc's Sources), surface `registrertIMvaregisteret` for MVA status,
   cache results, handle 404 (absent org) + errors gracefully. The `brreg` MCP is available for dev
   lookups once egress is open. Run the integration-auditor.
- Then Phase 1 (org & contacts onboarding) — where the user→org membership model + org-settings
  (org_nr/mva_status write control) land.
- Phase-2 carry-overs surfaced by the vat-reviewer: reverse-charge **dual-leg** derivation (branch on
  the `reverseCharge` flag) and the non-deductible rules (representasjon / vehicle / private-use).

## Open decisions (need the human — build-spec §18)
- eID broker — **DECIDED: Criipto** (this session).
- Database — **DECIDED: Neon** (this session; confirms ADR 0013's default). Per-PR branching for
  agentic CI; Supabase's Auth+Storage value is unused since identity is BankID + object store is
  MinIO/Garage. Single-user cost ≈ **$0 (Free tier)**; only heavy-CI months tip into Launch
  pay-as-you-go (a few $/mo). Self-hosted Postgres remains the sovereignty fallback (ADR 0008) and
  the cleanest place to enforce FORCE-RLS via a non-owner role. Step 5 targets Neon (EU region) for
  the session store + RLS connection role; verify Neon EU + custom-role RLS when wiring it.
- Hosted LLM vs local default — before Phase 4 (default is local).
- Persistent server (Fly.io/Hetzner) vs serverless; transactional email provider — see §18.
- Working name "Saldo" (placeholder).

## Known issues / to verify
- ~~**RLS owner-bypass**~~ — ✅ RESOLVED this session (ADR 0012; FORCE RLS + `saldo_app`).
- **Egress allowlist blocks every external service here** (see top banner): real-Neon validation,
  live Criipto OIDC, and `data.brreg.no` could not be exercised. Neon was substituted with a local
  non-superuser-owner reproduction; auth/ER live work is deferred to an env with egress. To validate
  Neon later: `NEON_API_KEY` is set, but `mcp.neon.tech`/`console.neon.tech` must be allowlisted, then
  create a branch DB, apply both migrations, set the `saldo_app` password, and re-run the isolation checks.
- **App connection role** — the `withOrgTx` middleware is in place, but production `DATABASE_URL` must
  still be pointed at `saldo_app` (not the owner) with a separate owner URL for migrations; wire this
  into `app/db/client.ts` + `.env.example` during the auth step. `saldo_app`'s login secret is per-env.
- `saft:validate` is still a scaffold (returns 0). The XSD is now committed; implement SAF-T
  generation + XSD validation in Phase 8 (or sooner) and wire it green.
- Local commits are **unsigned** (no signing key in this env); they verify on push through the proxy.
- The custom `saldo/no-money-arithmetic` ESLint rule is heuristic — confirm it fires on a real
  `Øre + Øre`.
