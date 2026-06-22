# STATUS — handover

> Living handover doc. Update at the END of every session (see `.claude/skills/handover`).
> The next session reads this first, then reconciles against `git log` / actual code — **trust the code**.

**Last updated:** 2026-06-22 — session: Phase 0 foundation (steps 1–4)
**Branch:** `claude/phase-0-foundation-gej8rk` (off `main`). HEAD `2dd3e55`. Lands via reviewed PR —
no direct pushes to `main`.

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
- (nothing mid-change — clean tree at `2dd3e55`)

## Next up (ordered) — Phase 0 steps 5–6 (build-spec §16)
5. **Auth + tenancy.** eID broker = **Criipto** (decided). Build generic OIDC with `openid-client` +
   `oslo` (PKCE, state, nonce, session rotation) + **server-side Postgres sessions**, and request
   middleware that runs `SET LOCAL app.current_org` so RLS applies. ⚠️ **RLS gap to close here:** the
   policies `ENABLE` but don't `FORCE` RLS, and Postgres **exempts the table owner** — so the app must
   connect as a **non-owner role** (or add `FORCE ROW LEVEL SECURITY`), and `organization`/INSERT
   policies need a `WITH CHECK` story. Add a migration + a Testcontainers RLS-isolation test (the 5th
   guarantee) as part of this. The integrity-test harness currently connects as owner by design.
6. **Enhetsregisteret lookup** (org autofill) under `app/integrations`; honor rate limits; run the
   integration-auditor. Keep CI green.
- Then Phase 1 (org & contacts onboarding).
- Phase-2 carry-overs surfaced by the vat-reviewer: reverse-charge **dual-leg** derivation (branch on
  the `reverseCharge` flag) and the non-deductible rules (representasjon / vehicle / private-use).

## Open decisions (need the human — build-spec §18)
- eID broker — **DECIDED: Criipto** (this session).
- Database — **recommended: Neon** (ADR 0013 default; per-PR branching for agentic CI; Supabase's
  Auth+Storage value is unused since identity is BankID + object store is MinIO/Garage). Self-hosted
  Postgres is the sovereignty fallback (ADR 0008). **Awaiting human confirmation** before step 5
  hardens the session store + RLS connection role.
- Hosted LLM vs local default — before Phase 4 (default is local).
- Persistent server (Fly.io/Hetzner) vs serverless; transactional email provider — see §18.
- Working name "Saldo" (placeholder).

## Known issues / to verify
- **RLS owner-bypass** (see step 5) — tenancy is not yet enforced at runtime; the policies exist but
  need a non-owner app role / FORCE RLS to bite. Highest-priority Phase-0 correctness item.
- `saft:validate` is still a scaffold (returns 0). The XSD is now committed; implement SAF-T
  generation + XSD validation in Phase 8 (or sooner) and wire it green.
- Local commits are **unsigned** (no signing key in this env); they verify on push through the proxy.
- The custom `saldo/no-money-arithmetic` ESLint rule is heuristic — confirm it fires on a real
  `Øre + Øre`.
