# STATUS — handover

> Living handover doc. Update at the END of every session (see `.claude/skills/handover`).
> The next session reads this first, then reconciles against `git log` / actual code — **trust the code**.

**Last updated:** 2026-06-22 — session: Phase 0 step 5 (RLS tenancy hardening)
**Branch:** `claude/upbeat-darwin-hepsel` (off `main`, which now includes Phase 0 steps 1–4 via
PR #6 + Neon MCP via PR #8). Lands via reviewed PR — no direct pushes to `main`.

## Verified state
- ✅ Full **production gate suite** green at HEAD `2dd3e55`: `typecheck`, `lint`, `lint:repo`,
  `format:check`, `pnpm audit --audit-level=high` (**no known vulnerabilities**), `test`
  (**90 domain** incl. fast-check + **9 Testcontainers** integration), web `build`.
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
  `SECURITY DEFINER`. A **5th Testcontainers guarantee** (`rls-tenancy.integration.test.ts`, app-role
  harness) proves an org reads/writes only its own rows; up+down both apply; schema re-introspected.

## Active phase
**Phase 0 (Foundation) — in progress.** Steps 1–4 of the mission done; steps 5–6 next.

## Done (this session) — Phase 0 steps 1–4
- **(1) Infra + schema:** brought up Postgres, migrated, introspected the Drizzle schema. `88c4bea`.
- **(2) Integrity tests:** Testcontainers proofs of the four SQL guarantees. `8884f07`.
- **(3) SAF-T reference data (cited):** vendored the official Skatteetaten SAF-T Financial XSD,
  Standard Tax Codes, and GL Standard Accounts under `db/reference/saf-t/` (provenance + Regnskap
  Norge licensing in `SOURCE.md`); dated raw capture of Skatteetaten's VAT rates under
  `db/reference/mva/`; cited `docs/regulatory/mva-rates.md` mapping rate-category → 2026 rate. `77504f3`.
- **(4) Domain VAT engine, test-first:** `@saldo/domain` now has pure parsers for the SAF-T tax
  codes (deriving rate category / direction / a **reverseCharge** marker) and standard accounts,
  a cited rate-category→`Rate` map, and **the input-VAT fork** (`posting/derive.ts`):
  `derivePurchase` branches on MVA status AND explicit deductibility; `deriveSales` charges output
  VAT only when registered and hard-blocks otherwise. Exhaustive + fast-check tests. Reviewed by
  the vat-reviewer (deductibility made explicit; reverse-charge flagged + deferred). `2dd3e55`.

## In progress
- Phase 0 step 5 **auth** (Criipto OIDC + Postgres sessions + `SET LOCAL app.current_org` middleware)
  and step 6 **Enhetsregisteret lookup** are the next work on this branch.

## Next up (ordered) — Phase 0 steps 5–6 (build-spec §16)
5a. **RLS tenancy gap — ✅ DONE this session (ADR 0012).** FORCE RLS + non-owner `saldo_app` role +
   `WITH CHECK` + 5th Testcontainers guarantee. Proven on local PG and on a non-superuser-owner
   reproduction of Neon (real Neon was egress-blocked — see Known issues).
5b. **Auth (Criipto OIDC) — TODO.** Generic OIDC with `openid-client` + `oslo` (PKCE, state, nonce,
   session rotation) + **server-side Postgres sessions**, then request middleware that runs
   `SET LOCAL app.current_org` per request so the now-FORCEd RLS applies. App must connect as
   `saldo_app` (not the owner). Secrets from server env only; Zod-validate inputs; run privacy-reviewer.
6. **Enhetsregisteret lookup** (org autofill) under `app/integrations`; honor rate limits; run the
   integration-auditor. Keep CI green.
- Then Phase 1 (org & contacts onboarding).
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
- **Real Neon validation is pending** — this environment's network egress allowlist blocks Neon's
  hosts (`*.neon.tech` → 403), so the migration was validated against a local **non-superuser-owner**
  database that mirrors Neon's role model instead. Re-run the migration + isolation checks against an
  actual Neon branch from an env with Neon egress (the Neon MCP needs `NEON_API_KEY` + host allowlist).
- **App connection role** — production `DATABASE_URL` must point at `saldo_app` (not the owner);
  migrations/admin use an owner URL. `saldo_app`'s login secret is provisioned per-env (not in SQL).
  Wire this into `app/db/client.ts` + `.env.example` during the auth step.
- `saft:validate` is still a scaffold (returns 0). The XSD is now committed; implement SAF-T
  generation + XSD validation in Phase 8 (or sooner) and wire it green.
- Local commits are **unsigned** (no signing key in this env); they verify on push through the proxy.
- The custom `saldo/no-money-arithmetic` ESLint rule is heuristic — confirm it fires on a real
  `Øre + Øre`.
