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

## Verified state (current — at branch HEAD `cfbe475`)
Full gate green at HEAD:
- `pnpm typecheck` · `lint` · `format:check` · `lint:repo` (**61 docs / 9 sourced / 0 warn**) ·
  `backlog validate` (**44 tasks**, acyclic).
- `pnpm test` — **158 domain** (incl. fast-check) **+ 23 web**; the **34 integration tests** skip cleanly
  where no DB is present and run on **Testcontainers in CI** (here: local Postgres via `DATABASE_URL`;
  Docker is **not** available, so Testcontainers can't run locally).
- **Decisions current:** ADRs **0001–0030** (index in `docs/decisions/README.md`).
- **Enduring proven invariants** (unchanged): ledger balance / immutability / period-lock /
  gapless-counter + tenant **FORCE-RLS** isolation, proven by Testcontainers (`apps/web/test/integrity/`);
  the **no-contradiction** repo-lint gate (every `ADR NNNN` ref resolves, no "Locked" label, cited
  `db/reference/<dir>` exists, regulatory `verify-by` dates not past); the **no-inline-CSS** + design-lint
  ESLint bans; fail-closed hooks + the `Stop` green-bar (typecheck+lint+domain tests).

## Active phase
**Phase 0 (Foundation) — COMPLETE** (Option-2 architecture + ADRs, frontend tokens + React 19,
auth/identity, ledger-integrity gaps, mechanical gates, observability, EU AI Act posture; merged through
GitHub PR #12). We are now in the **feature + regulatory-engine track** (GitHub PRs #13–#18 + this branch).
The honest picture of where the build is:
- **Domain core is well-developed** (`packages/domain`, pure + 158 tests): money/`Øre`, ids, the VAT engine
  (`status` → per-line `line-treatment` → sectoral `activity` gate), the ENK income-`tax` estimate,
  `honest-number`, `posting`/balance, the `rules` engine, the `saft` code/account/rate model.
- **Persistence + tenancy proven**: the SQL ledger (voucher/posting/account/period/invoice-counter),
  integrity triggers, gapless counter, FORCE-RLS — proven by Testcontainers.
- **Auth/identity landed**: sessions + argon2id dev provider; OIDC wired but **not live-verified**.
- **The application/UI surface is still thin** — only the read-only `/oppslag` (brreg lookup) is a real
  feature route; `home.tsx` is a throwaway scaffold; there is **no org, invoice, posting, or reveal UI yet**.
- **Keystone next:** `feat-org-onboarding` — create an org + membership + provision its per-org
  `vat_code`/`account` lists from the committed SAF-T data; it unblocks every DB-dependent feature
  (`feat-honest-number-surface`, invoicing, posting).

## Phase 0 — Foundation (done; detail in `git log` + ADRs, not duplicated here)
Per the handover rule, STATUS is forward-looking and git/ADRs are the record. The foundation + hardening
landed through GitHub PR #12 and is fully captured in **ADRs 0013–0023** (+ 0002 refined, 0006, 0016) and
the commit history. In brief: Option-2 architecture + the zero-contradiction repo-lint gate (0013–0015);
frontend tokens + shadcn + React 19; identity & sessions (0020); four ledger-integrity gaps closed in SQL
(0018); mechanical gates + supply-chain — squawk/gitleaks/CodeQL/SBOM/SHA-pin, fail-closed hooks, the
`Stop` green-bar (0017); pino observability with redaction (0021); the agentic task graph + rejected-log
(0019); EU AI Act posture (0022) + proprietary license (0023); the **honest-number** domain feature (with
`estimatedTax` INJECTED — now source-grounded by `feat-tax-estimate`, this branch). The copy / experience /
typography foundations of the UI followed in ADRs **0024–0026** (PRs #13–#15).

## In progress
- Branch `claude/practical-edison-20f9p6` carries this session's **2 commits** — `feat-tax-estimate`
  (ADR 0029) + `vat-sectoral-exemptions` (ADR 0030) — on top of the merged #18 base. **No PR opened yet**
  (awaiting go-ahead). Nothing else mid-flight.

## Next up
**The task graph is the source of truth — `pnpm backlog` (`next` / `ready` / `list`), per ADR 0019.**
Don't re-derive "what's next" in prose here; this is just the orientation.
- **Recommended keystone:** `feat-org-onboarding` [high/L] — the gateway that turns the foundation into a
  usable product (org + membership + per-org `vat_code`/`account` provisioning, consuming `/oppslag`).
  Unblocks `feat-honest-number-surface` (the reveal now has a real, source-grounded number behind it) and
  all invoicing/posting. (`backlog next` mechanically returns `feat-receipt-extraction`, the vision-LLM
  track — hold it until a posting surface + org exist to receive proposals.)
- **Other high-value ready:** `feat-honest-number-surface` (needs org + a ledger-aggregation query first),
  `test-stateful-ledger` (model-based ledger testing), `ops-dr-runbook`.
- **VAT/tax engine continuation:** `vat-reduced-rate-activity` (capture mval kap. 5 → rate-matching + the
  rules/DB activity wiring), `vat-threshold-watcher` (the 50k registration threshold), `vat-reverse-charge`,
  `vat-mixed-activity` (§ 8-2 apportionment).
- **Regulatory grounding gaps:** `bokforingslov-doc` + the uncaptured Tier-1 sources (tidfesting,
  tap på krav § 4-7, uttak, justering kap. 9, EHF/Peppol B2G).
- **Sustaining discipline (roadmap Part 3, P1/P2):** make the quality bar mechanical (`ci-pr-template`),
  `test-e2e-axe`, OTel, mutation testing.

## Open decisions
- **Decided & in effect:** architecture = **Option 2** (persistent Node on an EU PaaS + Cloudflare
  edge/CDN + R2; Neon EU via Hyperdrive) — ADR 0015 (Workers-native is the documented runner-up);
  **Neon EU** (0013) + **Testcontainers** CI DB (0014); **shadcn + Tailwind v4 + React 19** (0006);
  **adaptive two-surface** design (0016); **grace-window** passive confirm (0002 refined); **Criipto**
  eID broker; **capture-and-encode** regulatory model, not runtime RAG (0028).
- **Still open:** Cloudflare **EU DPA + edge residency** confirm before go-live; **LLM hosting**
  (Phase 4; default local — the OpenAI-compatible abstraction keeps it a base-URL swap); **transactional
  email** provider (before Phase 3); **PEPPOL access point + Altinn onboarding** (Phase 9); **product name**
  ("Saldo" is a working name).

## Known issues / to verify
- **`vat_code` / `account` are per-org and NOT yet seeded.** The tables exist (FORCE-RLS); a static
  migration can't seed per-org rows, so provisioning from the committed SAF-T lists must run inside the
  org-creation transaction — i.e. it belongs to `feat-org-onboarding`.
- **OIDC is not live-verified** — needs a Criipto tenant + egress. Org-**selection** UX (multi-membership)
  is part of `feat-org-onboarding`.
- **`.env.example` not updated for auth** — `env.ts` is the Zod contract (`DATABASE_URL`=saldo_app,
  `APP_URL`, optional `OIDC_*`, `NODE_ENV`); `.env.example` is agent-deny'd, so update it by hand. Deploy
  runs migrations as a separate OWNER `DATABASE_URL`; the app process uses the `saldo_app` one.
- **Live integrations deferred** — verify Neon EU + custom-role RLS, and that **Hyperdrive preserves
  `SET LOCAL`**, when wiring auth/DB live (needs egress + tenants).
- **`saft:validate` is a scaffold** — prints `NOT YET IMPLEMENTED` loudly (CI label: SCAFFOLD). Implement
  SAF-T generation + XSD validation (Phase 8).
- **`home.tsx` is a throwaway scaffold** — the real home is "You're caught up" + the honest-number reveal
  (experience-principles §4.2 / §6).
- **Build-spec consolidation pending** — `docs/saldo-build-specification.md` has a stale dir tree + inlined
  harness copies (tracked: `docs-consolidate-build-spec`).
- **Local commits are unsigned** (no signing key here); they verify on push through the proxy.
