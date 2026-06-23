# STATUS — handover

> Living handover doc. Update at the END of every session (see `.claude/skills/handover`).
> The next session reads this first, then reconciles against `git log` / actual code — **trust the code**.

**Last updated:** 2026-06-23 — session: P0 hardening PRs 3–6 (gates, ledger integrity, auth, observability)
**Branch:** `claude/epic-bell-u2bbx9` (off `main`). Lands via reviewed PR — never a direct push to
`main`. (HEAD moves each commit — trust `git log` over any hash written here.)

> ⚠️ **Live external integrations are not exercised in these sessions.** The Neon control plane,
> Criipto OIDC, and Brønnøysund (`data.brreg.no`) are not reachable/configured here, so auth and
> Enhetsregisteret **live** work is deferred to an env with egress + real tenants. (Web search/fetch,
> the npm registry, and Cloudflare docs MCP were available this session; local Postgres + Testcontainers
> stand in for DB work.)

## Verified state (this session — full production gate green)
- ✅ `pnpm audit --audit-level=high` (no known vulns), `typecheck`, `lint`, `lint:repo` (40 docs,
  0 warnings), `format:check`, `test` (**90 domain** incl. fast-check; Testcontainers skip locally
  without Docker — they run in CI), web `build` (**React 19** SSR + **Tailwind v4** token CSS compiles).
- ✅ **Ledger integrity proven (unchanged):** Testcontainers prove balance / immutability / period-lock /
  gapless-counter + RLS tenant isolation against real Postgres (`apps/web/test/integrity/`).
- ✅ **Zero contradictions, now ENFORCED:** `tools/repo-lint.mjs` fails CI if an `ADR NNNN` cross-ref
  doesn't resolve, a "Locked" status label reappears, or a cited `db/reference/<dir>` is missing.
- ✅ **No inline CSS, ENFORCED:** ESLint bans the JSX `style` prop in `apps/web/app/**` (negative-tested).
- ✅ **Mechanical gates (PR 3):** fail-**closed** hooks; a `Stop` green-bar (typecheck+lint+domain tests);
  `PostToolUse` `lint:repo` on docs/.claude edits; ESLint `domain ↛ web` boundary; CI now runs
  `type-coverage` (≥97%, at 98.19%) + `db:lint` (squawk, forward-migrations-only); SHA-pinned actions;
  isolated **CodeQL** + **gitleaks** + **CycloneDX SBOM** workflows; a weekly **freshness** cron
  (lint:repo+audit+knip → one rolling issue). `knip` is advisory (cron), not a blocking gate (ADR 0017).

## Active phase
**Phase 0 (Foundation) — hardening COMPLETE.** Prior sessions: steps 1–5 + hardening PRs 1 / 2 / 2.5.
This session delivered the remaining hardening **PRs 3–6** (mechanical gates, ledger-integrity gaps,
auth/identity first lock, observability) **+ a meta-PR** (agentic task graph + rejected-approaches log)
**+ design-lint gates** for the incoming UI. P0 foundation is done. **Next: the feature track** —
`pnpm backlog next` → `feat-honest-number` (the honest-number domain feature), with Enhetsregisteret +
org-onboarding behind it.

## Done (this session)
- **`feat-honest-number` — the honest-number domain feature (the feature track begins).** Pure
  `packages/domain/src/honest-number/` — `honestNumber({income, outputVatCollected, deductibleInputVat,
  estimatedTax, mvaStatus})` → `{vatHeld, estimatedTax, spendable, rawRemainder}` (experience-principles
  §6: "what's actually yours"). `vatHeld` reads the existing MVA-status fork; **`estimatedTax` is
  INJECTED** — no committed income-tax source exists, so none invented (source-grounding rule). 11
  exhaustive + fast-check tests (spendable ∈ [0, income]; conservation when solvent; unregistered ⇒ 0
  VAT). **vat-reviewer**: logic sound; documented caller preconditions on the input (reverse-charge BOTH
  legs symmetrically, deductible-portion-only, termin-timing). Follow-ups in the backlog:
  `feat-tax-estimate` (the injected number, needs a Skatteetaten source) + `feat-honest-number-surface`
  (aggregation query + the reveal UI).
- **PR 6 — observability baseline (ADR 0021).** `pino` logger (`app/observability/logger.server.ts`,
  JSON to stdout, externalizes cleanly from the build) with a `REDACT_PATHS` backstop (cookies, auth
  headers, passwords/hashes, session+PKCE tokens, email, org-nr) and `requestLogger(request)` (a child
  bound to `x-request-id`/method/path). Wired into `/auth/login|logout` — outcomes only, never PII.
  Always-on redaction unit test. Logger reads `process.env` directly (foundational; importable in tests).
- **Design-lint gates (review follow-up).** Two `eslint-plugin-saldo` rules — `no-arbitrary-tailwind`
  (bans `bg-[#fff]`/`h-[100vh]`; allows shadcn `[&_tr]:` variants) + `no-raw-color-utility` (bans
  `text-black`/`bg-red-500`; use semantic tokens) — enforced now so the first UI is on-bar. Anti-vibe
  "tells" folded into `design-system.md`. (RuleTester coverage tracked as `harness-design-lint`.)
- **PR 5 — identity & session foundation / auth (ADR 0020).** The missing FIRST lock. Migration
  `app_user` / `user_session` / `membership` (auth tables, intentionally NOT org-RLS'd — allowlisted in
  the RLS-coverage test). Lucia-pattern sessions (160-bit opaque token stored only as SHA-256 via
  `@oslojs/*`; HttpOnly/Secure/SameSite=Lax cookie; 30d absolute + 15d sliding). argon2id dev
  email/password provider (`@node-rs/argon2`); **openid-client v6** OIDC (PKCE+state+nonce) wired but
  not live-verified. Zod **`env.ts`**; `requireUser → requireOrgAccess(membership) → withUserOrg →
  withOrgTx`; CSRF via SameSite + Origin check. Routes `/auth/login|callback|logout`. Validated against
  real local PG (17 checks incl. membership FK-under-RLS) + an always-on argon2id unit test + a 7-case
  Testcontainers suite; **build externalizes argon2** cleanly. `DATABASE_URL` now = the `saldo_app` role.
- **Agentic memory — task graph + rejected-approaches log (ADR 0019).** Reviewed 3 external repos for
  repo/harness (not product) value: **piyaz** (dependency-aware task DAG + abandoned-approach records —
  valuable *idea*, but a SaaS; built natively instead), **vibecoded-design-tells** (anti-vibe checklist
  → folded into `design-system.md`), **korrodesign** (design-lint ESLint rules → noted for when UI
  lands). Built `docs/backlog/tasks.json` + `tools/backlog.mjs` (`pnpm backlog` next/ready/list/validate;
  orders by value→leverage→effort; CI-validated) and `docs/decisions/rejected.md` (seeded with 7 real
  rejections from this session). Wired into the `/backlog` skill + handover ritual. `backlog next`
  currently → **pr5-auth** (highest value, unblocks the most downstream work).
- **PR 4 — ledger integrity gaps (ADR 0018).** One migration closes four holes, each proven by a
  Testcontainers test of the BAD case (10 new assertions): (1) **period-lock** now fires on `posting`
  too (and voucher DELETE), so postings can't be added to an unposted voucher in a now-locked period;
  (2) **posted ⇒ ≥2 postings & balanced** (deferred constraint trigger); (3) **no overlapping**
  `fiscal_period` ranges (`EXCLUDE` + `btree_gist`); (4) **same-org `period_id`** (composite FK). Plus
  an **RLS-coverage** test asserting every `public` table has ENABLE+FORCE RLS + policy + `saldo_app`
  grant. Validated end-to-end against a real local PG (apply, all bad cases blocked, down/up round-trip,
  squawk clean via inline greenfield ignores).
- **PR 3 — mechanical gates & supply chain (ADR 0017).** Fixed both fail-open hooks
  (`precommit-check.sh` blocks when `node_modules` is missing; `block-generated.sh` fails closed on a
  JSON parse error). New `Stop` green-bar hook (`green-bar.sh`: typecheck + lint + domain tests, skips
  Testcontainers, honors `stop_hook_active`). New `PostToolUse` `lint:repo` hook for docs/.claude edits.
  ESLint `no-restricted-imports` enforcing **domain ↛ web**. Added **type-coverage** (≥97%) and
  **squawk** (`db:lint`, forward-migrations-only via `tools/migrations-up.mjs` + `squawk.toml`) to the
  core gate; **SHA-pinned** all 3 setup actions. New isolated workflows: **codeql.yml** (SAST),
  **security.yml** (gitleaks + CycloneDX SBOM via `cdxgen -t pnpm`), **freshness.yml** (weekly cron →
  one rolling issue). New **`/new-adr`** skill; wired **`/verify`** into the new-feature loop (maker≠judge).
  `knip` is advisory (cron), not blocking — see ADR 0017 (would force suppressing real pending findings).
  ⚠️ **Action needed:** the `Stop` + new `PostToolUse` hooks are wired in `.claude/settings.json` and
  active next session.

## Done (prior session — PRs 1 / 2 / 2.5)
- **World-class roadmap** — `docs/world-class-roadmap.md` (architecture decision, hardening plan, the
  24-item contradiction kill-list, master backlog).
- **PR 1 — decisions & consistency.** Option 2 architecture (**ADR 0015** persistent Node on an EU PaaS
  + Cloudflare edge/CDN + R2; **ADR 0013** Neon EU; **ADR 0014** Testcontainers). Eliminated all 24
  cross-doc contradictions; "Locked"→Current/Intended/Superseded; `oslo`→`@oslojs/*`; SECURITY.md
  truthed-up; created `db/reference/{brreg,llm,auth}/`; the **repo-lint contradiction gate**; `AGENTS.md`;
  the exemplar-sibling rule line.
- **PR 2 — frontend foundation.** Tailwind v4 `@theme` tokens (light/dark + debit/credit/paid/overdue);
  shadcn `components/ui` **Card + Table** (React 19 ref-as-prop); `home.tsx` rewritten with **zero inline
  styles**; root `ErrorBoundary`; **React 18.3 → 19**; the **inline-`style` ESLint ban**.
- **PR 2.5 — experience principles + design ADRs.** `docs/experience-principles.md` (source of truth) +
  `.claude/rules/experience-voice.md`; **ADR 0016** (adaptive two-surface design system); **ADR 0002
  refined** to the grace-window confirmation model (+ matching CLAUDE.md invariant).

## In progress
- (PR 3 committed; PRs 4–6 next this session)

## Next up (ordered) — the feature track (P0 hardening is complete)
**Ask the graph:** `pnpm backlog next` → currently **`feat-honest-number`** (high value, unblocks the
mobile companion). `pnpm backlog ready` for the full ordered list; `pnpm backlog list` for blockers.
**The feature track (Phase 1+):** Enhetsregisteret lookup; org & contacts onboarding (the user→org
membership UI); the **honest-number domain feature** (spendable = income − VAT held − estimated tax —
pure + exhaustively tested) + its reveal; the Norwegian-first **keyed microcopy** system; the **mobile
companion** surface (`components/mobile`, per ADR 0016, built per feature); reverse-charge dual-leg +
non-deductible VAT rules (Phase 2 carry-overs).
**Continuous-improvement Layer-3 (a small "PR 3.5" when ready):** a monthly refactor pass
(`/code-review` + `/simplify` on one rotating module) + a quarterly tech-radar (`/deep-research` →
dated ADOPT/MINE/SKIP, adoption gated by an ADR) + a `docs/improvements.md` ledger.

## Open decisions (most now decided this session)
- **Architecture/hosting — DECIDED: Option 2** (persistent Node on an EU PaaS + Cloudflare edge/CDN + R2;
  Neon EU via Hyperdrive) — ADR 0015. Workers-native is the documented runner-up.
- **Database — DECIDED: Neon (EU)** (ADR 0013). **CI DB — DECIDED: Testcontainers** (ADR 0014).
- **UI — DECIDED: shadcn + Tailwind v4 tokens, React 19** (ADR 0006 + PR 2).
- **Design system — DECIDED: adaptive two-surface** (ADR 0016). **Confirm model — DECIDED: grace-window
  passive confirm** (ADR 0002 refined). **eID broker — DECIDED: Criipto.**
- **Still open:** Cloudflare **EU DPA + Worker/edge residency** confirm before go-live; **LLM hosting**
  (Phase 4; default local); **transactional email** provider (before Phase 3); **PEPPOL access point +
  Altinn onboarding** (Phase 9); **product name** ("Saldo" is a working name).

## Known issues / to verify
- ~~No auth yet~~ — **first lock landed in PR 5** (ADR 0020). `withUserOrg` now resolves the org from the
  authenticated user's membership before `withOrgTx`. Remaining: **OIDC is not live-verified** (needs a
  Criipto tenant + egress); org-**selection** UX (multi-membership) is the org-onboarding feature.
- ~~Period-lock SQL hole~~ — **closed in PR 4** (ADR 0018; posting-side trigger + proof).
- **`.env.example` not updated for auth** — `env.ts` is the Zod contract (`DATABASE_URL`=saldo_app,
  `APP_URL`, optional `OIDC_*`, `NODE_ENV`); `.env.example` is agent-deny'd so update it by hand. Deploy
  runs migrations as a separate OWNER `DATABASE_URL`; the app process uses the `saldo_app` one.
- **Live integrations deferred** — verify Neon EU + custom-role RLS, and that **Hyperdrive preserves
  `SET LOCAL`**, when wiring auth/DB live (needs egress + tenants).
- `saft:validate` is still a **scaffold** (returns 0) — implement SAF-T generation + XSD validation.
- **Unused frontend deps** (motion, vaul, recharts, lucide-react, react-hook-form, @hookform/resolvers,
  @tanstack/react-table) remain in `apps/web/package.json` — wire or prune per feature (RHF + TanStack
  are imminent; `knip` in PR 3 tracks this).
- `home.tsx` is a **throwaway scaffold** — the real home is "You're caught up" + the honest-number
  reveal, not a ledger (experience-principles §4.2 / §6).
- Local commits are **unsigned** (no signing key here); they verify on push through the proxy.
