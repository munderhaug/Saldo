# STATUS — handover

> Living handover doc. Update at the END of every session (see `.claude/skills/handover`).
> The next session reads this first, then reconciles against `git log` / actual code — **trust the code**.

**Last updated:** 2026-06-23 — session: `feat-tax-estimate` + `vat-sectoral-exemptions` (ADR 0029, 0030)
**Branch:** `claude/practical-edison-20f9p6` (off `main` at PR #18 / `3e86e1b` — per-line VAT engine).
Lands via a reviewed PR — never a direct push to `main`. (Trust `git log` over any hash here.)

> ⚠️ **Live external integrations vary by environment.** Criipto OIDC and the Neon control plane are
> not configured here. **This session HAD outbound egress and USED it** (verified + fetched: Lovdata
> statute text fetches verbatim; Skatteetaten reachable for cross-confirm; data.brreg reachable). Don't
> assume egress next session — verify it. Local Postgres / Testcontainers stand in for DB work.

## This session (1/2) — `feat-tax-estimate`: source-grounded ENK income-tax estimate (ADR 0029)
Grounded the **ENK personal-tax layer** and encoded it, taking the honest-number's `estimatedTax` from
**INJECTED** to **source-grounded**. A full vertical slice: capture verbatim primaries → distil a cited
page → pure domain estimator (exhaustive + property tests) → ADR. **Domain-only, no migration.** Full gate
green (typecheck, lint, format, `test` **145 domain** / 23 web incl. fast-check, `lint:repo` 59 docs / 8
sourced / 0 warn). **Independent maker≠judge review: SHIP** (recomputed the oracle + every constant vs. the
captures; clean on all 7 axes).
- **Captured verbatim from Lovdata** (statute is not copyrighted — åndsverkloven § 14) into
  `db/reference/skatt/`: Stortingets skattevedtak 2026 (FOR-2025-12-18-2747 — trinnskatt § 3-1, fellesskatt
  § 3-2, kommune/fylke § 3-8, personfradrag § 6-3, minstefradrag § 6-1) + avgifter til folketrygden 2026
  (FOR-2025-12-18-2748 — trygdeavgift §§ 6–8) + folketrygdloven § 23-3 (nedre grense / 25 % opptrapping).
  Cross-confirmed 2026 figures against Skatteetaten (summarised, not reproduced). Distilled into
  **`docs/regulatory/skatt-enk-personskatt.md`** (cited, verify-by 2026-12-31).
- **Two facts pinned that are widely gotten wrong:** a *person's* 22 % alminnelig inntekt = fellesskatt
  8,25 + kommune 11,35 + fylke 2,40 (the § 3-3 "22 %" is the **company** rate, not an ENK owner's); and
  **minstefradrag does NOT apply to næringsinntekt**. Personfradrag 2026 = **114 540 kr** (a websearch
  summary claimed 45 000 — wrong; verbatim § 6-3 settled it). Trygdeavgift næring **10,8 %** with a **99 650
  kr** floor and a **25 %** phase-in cap (binds ≈ 99 650 → 175 440 kr, then flat 10,8 %).
- **`packages/domain/src/tax/`** — `params.ts` (the cited 2026 rate table, keyed by year, **fail-closed**
  for un-captured years; same pattern as `saft/rates.ts`) + `income-estimate.ts`:
  `estimateEnkIncomeTax(profit, year)` → `{ alminneligInntektSkatt, trinnskatt, trygdeavgift, total }`.
  Pure, integer-øre (marginal-bracket + floor/cap math via `mulRate`/`subØre`, rounded once). A **loss → 0**.
- **The estimate is honest, not fake-precise (ADR 0029):** a conservative forskuddsskatt-style "set aside"
  on a single input (estimated annual profit), with stated assumptions — single income source; beregnet
  personinntekt ≈ alminnelig næringsinntekt ≈ profit (no skjermingsfradrag); klasse 1, full-year, **mainland**
  (Finnmark 18,5 % out of scope); no formuesskatt. Biased to set aside slightly too much.
- **Tests:** `income-estimate.test.ts` — **19 tests**: a hand-computed oracle (exact øre at 11 income points
  across all 3 trygde regimes + all 5 trinn bands, independent of the SUT) + fail-closed-year cases + 5
  fast-check properties (non-negativity, total = Σ components, total ≤ profit, monotonic, trygde floor/cap).
- **Integration boundary unchanged:** `honest-number.ts` still **takes** `estimatedTax` as input (no edit);
  the future aggregation layer (`feat-honest-number-surface`) calls `estimateEnkIncomeTax(...).total`.
- **Files:** new — `db/reference/skatt/{2026-06-23-stortingets-skattevedtak-2026.md, 2026-06-23-trygdeavgift-2026.md, SOURCE.md}`,
  `docs/regulatory/skatt-enk-personskatt.md`, `docs/decisions/0029-enk-income-tax-estimate.md`,
  `packages/domain/src/tax/{params.ts, income-estimate.ts, income-estimate.test.ts}`; edited —
  `packages/domain/src/index.ts`, `docs/regulatory/README.md`, `docs/decisions/README.md`, `docs/backlog/tasks.json`.
- **Next:** wire `feat-honest-number-surface` (aggregation query + the reveal UI — now has a real number to
  show); or continue the regulatory foundation — `vat-sectoral-exemptions` (mval kap. 3, on the new gate) or
  the VAT/bokføring Tier-1 gaps (tidfesting / tap på krav / uttak / justering / EHF-Peppol; `bokforingslov-doc`).

## This session (2/2) — `vat-sectoral-exemptions`: the activity dimension on the VAT gate (ADR 0030)
Extended the freshly-landed line-treatment gate with the **sectoral-exemption (activity)** dimension, so a
user can't charge VAT on an *unntatt* activity (the § 3-7 musician problem, generalized to helse / sosiale /
undervisning / finansielle / idrett / fast eiendom). **Domain-only, no migration, DB-independent.** Same
discipline as 1/2: capture verbatim → distil cited page → pure gate → ADR. Full gate green (typecheck, lint,
format, `test` **158 domain** / 23 web, `lint:repo` 61 docs / 9 sourced / 0 warn). **`vat-reviewer`: SHIP**
(source-grounding, logic, test-independence clean; one boundary disclosed + locked — see below).
- **Captured mval kap. 3 unntak verbatim** from Lovdata (`db/reference/mva/2026-06-23-mval-kap3-unntak.md`:
  §§ 3-2 helse, 3-4 sosiale, 3-5 undervisning, 3-6 finansielle, 3-8 idrett, 3-11 fast eiendom; § 3-7 already
  captured). Distilled **`docs/regulatory/mva-sektorunntak.md`** (cited, verify-by 2026-12-31).
- **`packages/domain/src/vat/activity.ts`** — `VatActivity` enum (the named kap. 3 sectors + `avgiftspliktig`)
  + `activityIsExempt` + `checkVatActivityLine(activity, code)`: blocks an exempt-sector line coded as
  output/fritatt VAT, and a taxable line coded *unntatt* (code 6). **Composes with `checkVatLine`** (a line
  is valid iff both pass) — the activity gate catches what registration alone can't (a *registered* org still
  may not VAT a § 3-2 health line). Derived from the committed SAF-T list, never memory.
- **Scope (ADR 0030):** the **revenue/output gate only**. Reduced-rate (12/15 %) sector↔rate matching (mval
  kap. 5) + rule/DB wiring → new task **`vat-reduced-rate-activity`**; input-VAT apportionment (§ 8-2) →
  `vat-mixed-activity`; reverse charge → `vat-reverse-charge`. **Disclosed + test-locked boundary:** domestic
  reverse-charge *turnover* (code 51) classifies as reverse-charge, so it isn't gated against exempt sectors
  yet (a `vat-reviewer` catch — fixed by disclosure in code/doc/ADR + an explicit test, not a silent gap).
- **Tests:** `vat/activity.test.ts` — **13 tests**: exhaustive (8 activities × 30 committed codes vs. an
  independent hand-listed oracle) + the two-gate composition + the code-51 boundary + 4 fast-check properties.
- **Files:** new — `db/reference/mva/2026-06-23-mval-kap3-unntak.md`, `docs/regulatory/mva-sektorunntak.md`,
  `docs/decisions/0030-sectoral-vat-exemptions.md`, `packages/domain/src/vat/activity.{ts,test.ts}`; edited —
  `packages/domain/src/index.ts`, `db/reference/mva/SOURCE.md`, `docs/regulatory/README.md`,
  `docs/decisions/README.md`, `docs/backlog/tasks.json` (sectoral done + `vat-reduced-rate-activity` added).
- **Next:** `vat-reduced-rate-activity` (capture mval kap. 5, then rate-matching + the rules/DB activity
  wiring); or `feat-honest-number-surface` (needs org provisioning + a ledger-aggregation query first — note
  `vat_code`/`account` are per-org and not yet seeded; provisioning is `feat-org-onboarding`).

## Previous session — `vat-line-level-model`: per-line VAT in @saldo/domain (ADR 0027 → engine code)
Turned the freshly-merged **ADR 0027** into engine code: VAT treatment is now a property of the
**voucher/invoice line** (its SAF-T tax code), validated against the org's `mva_status` (which stays the
registration/default state — **no migration**; `posting.vat_code_id` has carried per-line codes since
Phase 0). **Domain-only**; full gate green (typecheck, lint, format, `test` **126 domain** incl. fast-check,
`lint:repo` 57/7/0). **Two `vat-reviewer` passes** (maker≠judge); the second clean.
- **`vat/line-treatment.ts`** — `deriveVatTreatment(code)` classifies a committed SAF-T code into a posting
  treatment (`output-vat | zero-rated-output | exempt | input-deductible | reverse-charge | no-treatment`),
  **derived** from the list's `direction`/`rateCategory`/`reverseCharge` + the `utenfor merverdiavgiftsloven`
  description — never the code number. `checkVatLine(status, code)` is the registration gate, built on the
  cited `chargesOutputVat`/`deductsInputVat` predicates (the same fork `posting/derive.ts` uses).
- **The § 3-7 expressiveness (the point):** output-VAT/fritatt/input-deduction codes require registration;
  **exempt (code 6) + no-treatment are valid for ANY status** — so a `registered_standard` musician posts a
  code-6 *unntatt* performance line beside a code-3 taxable teaching line in one voucher. No apportionment
  (forholdsmessig fradrag) — that stays `vat-mixed-activity`, **now unblocked**.
- **Reverse-charge boundary (honest, not fake-green):** RC codes (51, 81–92, import family incl. 20) are a
  **non-blocking advisory** pointing at `vat-reverse-charge` — EXCEPT the one dimension decidable today: a
  "med fradragsrett" RC code (81/83/86/88/91) **claims an input deduction**, so it's **blocked for an
  unregistered org** (it must use the "uten fradragsrett" 87/89). A `vat-reviewer` catch.
- **`rules/vat-line.ts`** — `vatLineRule({status, codes})` wraps the gate into the `Rule` contract; runs via
  `runRules`. Unknown code → error; blocked combo → error (fail-closed fallback); RC → warning; uncoded
  lines ignored.
- **Tests:** `line-treatment.test.ts` (exhaustive **30 codes × 4 statuses** vs. a hand-derived oracle
  independent of the SUT + 4 fast-check properties) and `vat-line.test.ts` (the § 3-7 mixed voucher, the
  block/advisory/unknown cases, `runRules` integration). **25 new tests.**
- **Next:** capture the Tier-1 sources (tidfesting / tap på krav / uttak / justering / EHF-Peppol / the ENK
  personal-tax layer for `feat-tax-estimate`), or encode `vat-sectoral-exemptions` (mval kap. 3) on this gate.

## Previous session — regulatory foundation: VAT granularity, capture-not-RAG, § 3-7 (doc-only)
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
