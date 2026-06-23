# STATUS — handover

> Living handover doc. Update at the END of every session (see `.claude/skills/handover`).
> The next session reads this first, then reconciles against `git log` / actual code — **trust the code**.

**Last updated:** 2026-06-23 — session: regulatory foundation (VAT granularity + capture-not-RAG + § 3-7)
**Branch:** `claude/blixai-saldo-relevance-j1dsdj` (off `main` at PR #16 / `70410e5` — Enhetsregisteret).
Lands via a reviewed PR — never a direct push to `main`. (Trust `git log` over any hash here.)

> ⚠️ **Live external integrations vary by environment.** Criipto OIDC and the Neon control plane are
> not configured here. **This session HAD outbound egress** — Lovdata returned `mval § 3-7` verbatim and
> Skatteetaten search worked (the håndbok blocks verbatim quoting — summarise + cite). Don't assume egress
> next session — verify it. Local Postgres / Testcontainers stand in for DB work.

## This session — regulatory foundation: VAT granularity, capture-not-RAG, § 3-7 (doc-only)
A **strategy + decision** session (no engine code) prompted by two product questions: a sustainable AI
posture, and the under-served **cultural-sector ENK** VAT problem (no settled trade convention — people
guess). Outcome: two gating ADRs + the first source-grounded cultural-VAT page. **Gate green** (typecheck,
lint, `lint:repo` 57 docs / 7 sourced / 0 warn, `test`, `backlog validate`).
- **ADR 0027 (Accepted) — VAT treatment is per-line, not solely the org `mva_status`.** Revenue-side
  per-line classification (its SAF-T code) is in scope; **delt-virksomhet input-VAT apportionment (§ 8-2)
  is accepted in principle but SEQUENCED** as a source-gated increment (`vat-mixed-activity`), keeping the
  build-spec's "apportionment unsupported" line honest until that task lands. Org enum stays (no migration).
- **ADR 0028 (Accepted) — regulatory knowledge is capture-and-encode, not runtime RAG.** Deterministic
  rules engine over committed, dated sources decides postings; an LLM may *explain* a rule (read-only,
  AI-assisted, ADR 0022) but never *be* it. Keeps the engine a non-AI system (AI Act Recital 12) + the
  ledger auditable; pairs with the AI cost posture (compute the rule once, not per-transaction tokens).
- **Source-grounded § 3-7** — `db/reference/mva/2026-06-23-mval-3-7-kunst-kultur.md` (verbatim statute +
  håndbok M-3-7.4 summary) + cited `docs/regulatory/mva-kunstneriske-tjenester.md`. **Debunks the "whole
  supply chain is exempt" folklore**: the exemption is service-by-service, tied to the *performance*
  (lyd/lys/scenerigg/streaming inside; vakthold/servering/garderobe/reklame out). KMVA 8220: incorporating
  (ENK→AS) can forfeit § 3-7(4).
- **A user-supplied deep-research VAT/bokføring catalogue was reviewed** (not committed — it's research
  input). Identified Tier-1 gaps to capture next: **tidfesting/advance-invoicing, tap på krav (§ 4-7),
  uttak, justering (kap. 9), the EHF/Peppol B2G mandate**, and the **ENK personal-tax layer** (feeds
  `feat-tax-estimate`). A delta-research prompt for these was drafted (in chat).
- **Backlog:** `mva-kunst-sectoral-doc` (done) + `vat-line-level-model`, `vat-mixed-activity`,
  `vat-sectoral-exemptions`, `vat-threshold-watcher`, `bokforingslov-doc` (todo). ADR index brought current
  (0024–0028 were stale). **Next:** run the delta-research → capture Tier-1 sources → encode
  `vat-line-level-model` (per-line VAT in `@saldo/domain`, exhaustive + property tests).
- **Aside:** evaluated **blixai.com** — a Norway-hosted open-LLM inference API; relevant later as a
  data-resident option at the Phase-4 LLM-hosting decision, not now.

## Previous session — Enhetsregisteret (brreg) org lookup (`feat-enhetsregisteret`, done, PR #16)
The **first real integration + the first real UI surface.** A read-only `/oppslag` page that searches the
Brønnøysund open-data register by **org number or company name** and shows name / form / address / NACE /
**MVA-register status** — exercising the carnival tokens, the type system, and `~/copy` together for the
first time. **Full gate green** (typecheck, lint, `lint:repo` 54 docs/0 warn, `format`, `test` **101
domain + 23 web**; 34 integration skipped — no DB, `db:lint`, `build`) and **verified live end-to-end**
against `data.brreg.no`: Equinor org-nr lookup, "Viser 10 av 188 treff" name search, and the
invalid-mod11 / not-found / no-match / register-error states.
- **Integration client** `app/integrations/enhetsregisteret/client.server.ts` — server-only, **Zod at the
  boundary** (`contracts/enhetsregisteret.ts`), AbortController timeout, typed `{ok} | not-found | error`
  results (expected outcomes never throw). `lookupByOrgNr` (mod11 via `@saldo/domain` first) + `searchByName`.
- **Route** `routes/oppslag.tsx` — one smart box (9 digits → org-nr; else name), real `<Form method=get>`
  (works without JS), shadcn Card/Table, semantic tokens, Fraunces `h1`, keyed copy (nb **and** en).
  Amber **heads-up** flags for konkurs/avvikling/slettet (colour + word, never colour alone).
- **Source-grounding** `db/reference/brreg/` — real captures (Equinor ASA, a REMA name search, an empty
  envelope showing `_embedded` is absent on zero matches) + a **synthetic, PII-redacted ENK** (no real
  natural person's data committed; mod11-valid *unassigned* org-nr `311000004`). Tests assert the contract
  still accepts the captures, so live-API drift trips a test, not production.
- **Reviews (maker≠judge):** integration-auditor + privacy-reviewer + a11y-reviewer. Fixed before commit:
  dropped a link `aria-label` that clobbered the company name (WCAG 2.4.4/2.5.3); added a global
  `:focus-visible` outline (app.css); persistent `aria-live` region for status text; `nameSearchInput.max(200)`
  (outbound-query cap). **Privacy:** responses can carry an ENK's name/home address → `Cache-Control:
  private, no-store` (never edge-cache PII — residency); nothing logged (names/org-nr/query) and nothing persisted.
- **Config:** `vitest.config.ts` now loads `vite-tsconfig-paths` so unit tests resolve the `~/*` alias.
- **Deferred → backlog:** `feat-enhetsregisteret-cache` (EU-resident server cache + per-IP/session rate-limit;
  the doc's "cache results" directive, done residency-safely). **Next:** `feat-org-onboarding` (consumes this
  lookup; brings in React Hook Form + @hookform/resolvers + @tanstack/react-table).

## Previous session — typography (Fraunces + IBM Plex Sans, ADR 0026)
Locked the type system with the product owner and wired it in. **Full gate green:** typecheck, lint,
`lint:repo`, `format:check`, `test` (101 domain + 10 web), `db:lint`, `build` (fonts bundle + self-host),
`backlog validate`. **SSR-verified.**
- **Two-font system (ADR 0026):** **Fraunces** (variable soft-serif, `font-serif`) = **display only** —
  page headings + earned peaks (the honest-number reveal, post-filing), Light/Regular at large sizes,
  never at the §5.5 sober act. **IBM Plex Sans** (variable, the default `font-sans`) = body, UI, and **all
  money/tables** via its tabular figures (no mono — Plex aligns money). **Weights cap at 450**
  (`font-text` token); no medium/semibold/bold — hierarchy is size + serif/sans + colour. **Self-hosted**
  via `@fontsource-variable/*` (no CDN; EU-resident/offline); `font-optical-sizing: auto` for Fraunces;
  æøå via the latin-ext subset. Tokens in `app/app.css` (`--font-sans` / `--font-serif` / `--font-weight-text`).
- **Swept the existing UI** off `font-semibold`/`font-medium` → `font-serif`/`font-text` (routes + shadcn
  `card`/`table`); page headings now render in Fraunces. Verified: built CSS has `.font-text{font-weight:450}`,
  `.font-serif{Fraunces…}`, woff2 bundled; `/` renders.
- **Docs:** ADR 0026 + `rejected.md` R-0010 (sans+mono rejected — cold, and mono isn't needed since Plex
  has tnum); `design-system.md` typography section; backlog `design-typography` (done), `design-visual-spike`
  narrowed to illustration + the companion look.
- **Next:** the rest of `design-visual-spike` (illustration style + the companion character on these
  tokens + type), then the first real UI surface (`feat-enhetsregisteret` → `feat-org-onboarding`).
  Honest-number reveal still needs `feat-tax-estimate` (source-grounded).

## Previous session — playful experience direction + carnival tokens (ADR 0025, PR #14 merged)
Prime directive "no user ever feels stupid"; a friendly companion + the Torpedo agent (no gamification);
ten 12-step OKLCH scales in `app/app.css` (primary=electric, paid=green, overdue=red, heads-up=amber;
cold-white `neutral-1` base, plum `neutral-12` ink), light+dark, AA. Generator: scratchpad `gencss.mjs`;
spike artifacts in gitignored `reports/`. Docs reconciled (no "no mascots" contradiction).

## Previous session — keyed microcopy (`feat-keyed-microcopy`, PR #13 merged)
`apps/web/app/copy` (ADR 0024): typed `t()` over a flat nb/en catalog (nb shipped, en reference pinned by
`satisfies` + a parity test), the `saldo/no-unkeyed-jsx-text` gate, existing surfaces migrated, two
English strings fixed to NB. (Detail in ADR 0024 / `git log`.)

## Previous session — EU AI Act compliance + repo-standards consolidation (PR #12, merged)
ADR 0022 (EU AI Act posture) + `docs/regulatory/eu-ai-act.md` + `.claude/rules/ai-act.md`; proprietary
`LICENSE` + ADR 0023; AGENTS.md made canonical (CLAUDE.md imports it); roadmap renamed; 8 unused deps
pruned; repo-lint rule-glob + slop guardrails. (Detail in the ADRs / `git log`.)

## Verified state (PR #11 — merged to `main`)
- ✅ `pnpm audit --audit-level=high` (no known vulns), `typecheck`, `lint`, `lint:repo` (**47 docs**,
  0 warnings), `format:check`, **`type-coverage` 98.62%**, `db:lint` (squawk), `backlog validate`,
  `test` (**101 domain** incl. fast-check + **4 web unit**; the **34 integration tests** now run against
  a real **local Postgres** via the `SALDO_TEST_PG_URI` escape hatch — **all 38 web tests pass** — and
  still run on Testcontainers in CI, skipping cleanly where neither is present), web `build` (React 19
  SSR + Tailwind v4 + **argon2/pino externalized**).
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
**+ design-lint gates** for the incoming UI. P0 foundation is done; the **EU AI Act** compliance work landed this session.
**Next: the repo-standards consolidation (in progress), then the feature track** — `pnpm backlog next`,
with Enhetsregisteret + org-onboarding ahead.

## Done (PR #11 — merged to `main`)
- **Dev-infra: run the real integration tests without Docker + the Neon path.** Added a
  `SALDO_TEST_PG_URI` escape hatch to `db-harness.ts` (creates a throwaway DB per run on an existing
  Postgres, advisory-locked for parallel safety; CI keeps Testcontainers) — the 34 integration tests now
  pass against a local PG, de-risking the suites that previously only ran in CI. Added the
  **deploy-migrate** workflow (`dbmate up` against Neon, manual + protected `production` env) and a
  **Neon provisioning runbook** (`docs/runbooks/neon-provisioning.md`). Recommended **cloud-env setup**:
  a setup script that installs deps + starts a local Postgres; `DATABASE_URL` as a non-secret env var;
  **remove the Neon API key from the shared env-vars box** (it's a credential — rotate it).
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
- **Roadmap** — `docs/roadmap.md` (architecture decision, hardening plan, the
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

## Next up (ordered)
**EU AI Act — DONE this session** (ADR 0022 + `docs/regulatory/eu-ai-act.md`; `compliance-eu-ai-act`
marked done; forward work tracked as the `aia-*` tasks). **Current focus: repo-standards consolidation**
(against the field-guide review) — LICENSE (proprietary), kill the stale `runbook.md`,
AGENTS.md-canonical, make `knip` bite + prune unused deps, de-dup invariants, strip slop, add Vale.

**Then the feature track:** `pnpm backlog next` (`pnpm backlog ready`/`list` for the rest). Pending:
Enhetsregisteret lookup; org & contacts onboarding (the user→org
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
- `saft:validate` is a **scaffold** — now prints `NOT YET IMPLEMENTED` loudly (no longer a silent
  fake-green; CI label says SCAFFOLD). Implement SAF-T generation + XSD validation (Phase 8).
- ~~Unused frontend deps~~ — **pruned this session** (knip-clean). The choice is preserved in
  `tech-stack.md` + `.claude/rules/frontend.md`; each is `pnpm add`-ed in the feature PR that first uses
  it (annotated on `feat-org-onboarding` / `feat-mobile-companion`).
- `home.tsx` is a **throwaway scaffold** — the real home is "You're caught up" + the honest-number
  reveal, not a ledger (experience-principles §4.2 / §6).
- Local commits are **unsigned** (no signing key here); they verify on push through the proxy.
