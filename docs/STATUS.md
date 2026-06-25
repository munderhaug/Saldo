# STATUS — handover

> Living handover doc. Update at the END of every session (see `.claude/skills/handover`).
> The next session reads this first, then reconciles against `git log` / actual code — **trust the code**.

**Last updated:** 2026-06-25 — session: `aia-provenance-logging` (the durable half of EU AI Act Art. 50(2): a confirmed AI proposal now persists its provenance — model · version · confidence — to an `ai_provenance` table FK'd to the voucher, plus a structured log; ADR 0037)
**Branch:** a per-session `claude/<topic>` branch off `main`, landing via a reviewed PR — never a
direct push to `main`. The exact branch and HEAD live in `git` (`git rev-parse --abbrev-ref HEAD`) and
are not restated here, where they would only go stale.

> ⚠️ **Live external integrations vary by environment.** Criipto OIDC and the Neon control plane are
> not configured here. This session was **DB + compliance** (a new SQL migration), run against local
> Postgres / Testcontainers — no external egress needed; don't assume egress next session — verify it.

## This session — `aia-provenance-logging`: the durable Art. 50(2) audit trail (ADR 0037)
Built the **persisted half** of EU AI Act **Art. 50(2)** provenance: when a human confirms an AI-proposed
value and it posts to the ledger, a queryable record that the voucher **came from an AI proposal** is now
persisted + logged. The code-level provenance contract (ADR 0035) and the UI disclosure (ADR 0036) were
already in place; what was missing was the durable record — the confirm action previously **discarded**
the provenance. Full gate green. Landing as a reviewed PR.
- **Decision: a table, not logging-only.** A dedicated **`ai_provenance`** table FK'd **1:1** to the
  voucher (`model` · `model_version` · `confidence` + linkage **only**) — durable, queryable, joinable to
  the system of record; logs rotate and can't be joined. The structured **pino** log line stays as the
  observability signal (ADR 0021). Recorded in **ADR 0037**.
- **Privacy by construction (`data-handling.md`).** The table has **no** column for the supplier
  (// personal — an ENK supplier may be a natural person), the amounts (PII), or the image. The log shape
  is `aiProvenanceLogFields` — the single, **tested** definition of what reaches the log.
- **Tenancy + immutability.** FORCE RLS + a USING/WITH CHECK `org_isolation` policy; a composite
  `(voucher_id, organization_id)` FK makes a cross-tenant link impossible at the storage layer; the
  `saldo_app` grant is **SELECT + INSERT only** (no UPDATE/DELETE) so the audit trail is append-only,
  matching the immutable voucher it annotates.
- **AI never writes the ledger (ADR 0002).** The confirm action re-validates the provenance carried
  through the review round-trip as **hidden fields** (`receiptConfirmInput`) and posts **and** records
  provenance in **one** tenant transaction — the provenance sits *alongside* the human-confirmed post.
- **Tests.** Testcontainers integrity (FK 1:1, RLS isolation, append-only grant, *manual-post-writes-none*,
  minimal columns) + the `receiptConfirmInput` contract + a redaction/no-leak unit test. `ai_provenance`
  added to the RLS-coverage allowlist. Web suite **117 passing**.

## Previous session — `aia-transparency-ui`: the shared AI-disclosure primitive (ADR 0036)
Generalised the **first-interaction AI disclosure** (EU AI Act **Art. 50**) from the bespoke receipt
block (ADR 0035) into **one reusable, accessible primitive** so every current and future AI surface
discloses consistently — by the **2 Aug 2026** transparency deadline. **App-layer only; no schema, no
domain, no posting/VAT change** — disclosure-only (never scores/profiles a natural person, Annex III
§5(b)). Full gate green (typecheck · lint · format · `test` 195 domain / 106 web incl. the new render
test · lint:repo · status:check · backlog validate). Folds into the ADR 0022 posture (records *how*,
not a new *that*). Landing as a reviewed PR.
- **`components/ui/ai-assisted.tsx` (`<AiAssisted>`)** — a real labelled region (`<section
  aria-labelledby>` named by a real `<h2>`); the **"AI-assistert" badge as text** + a
  `data-ai-assisted` marker (the machine-readable label, Art. 50(2)); the first-interaction disclosure
  (Art. 50(1)) and the provenance line, all keyed microcopy via `t()`; `focusOnMount` to move focus to
  the heading on the server round-trip (WCAG 2.4.3 / 4.1.3). The surface passes heading/disclosure/
  provenance + its reviewed fields as `children`: **the primitive owns the disclosure, the surface owns
  the content.**
- **Shared label, stated once.** The machine-readable label lives in one new microcopy key
  `ai.assistedLabel` (nb+en) — the bespoke `receipts.new.aiAssisted` key is **removed**. nb/en parity
  is covered by the existing keyed-microcopy parity test.
- **Receipt review migrated** to `<AiAssisted>` with **no behaviour regression** — the focus-to-
  disclosure on the server round-trip is preserved via `focusOnMount`; the `<dl>` of fields + the
  non-standard-VAT heads-up are passed as children.
- **Render test (no new dependency).** `ai-assisted.test.tsx` renders via `react-dom/server`
  `renderToStaticMarkup` (no jsdom/testing-library added; vitest `include` widened to `*.test.tsx`):
  asserts the label + `data-ai-assisted` marker, the disclosure + provenance, the real labelled `<h2>`
  region, focusability on reveal, and that wrapped surface content renders.
- **Sequenced:** durable provenance **logging** (Art. 50(2)'s persisted half) — **done this session**
  (`aia-provenance-logging`, ADR 0037; see above).

## Earlier — `feat-receipt-extraction`: the first AI-system surface (ADR 0035)

## Repo status (generated — do not edit; `pnpm status:refresh`)
The volatile facts below are rendered from committed sources (ADR files + the task DAG) by
`tools/status-block.mjs` and gated by `pnpm lint:repo` — they cannot drift from the graph (ADR 0031).
<!-- AUTOGEN:repo-status -->
<!-- Generated from committed sources by tools/status-block.mjs — DO NOT EDIT BY HAND; run `pnpm status:refresh`. -->
- **Decisions:** 37 ADRs (0001–0037) — index in [`docs/decisions/README.md`](decisions/README.md).
- **Backlog:** 51 tasks (26 done, 25 todo) — the DAG is [`docs/backlog/tasks.json`](backlog/tasks.json) (`pnpm backlog`).
- **Highest-value ready task:** `ops-dr-runbook` [high/M] — DR runbook: Neon PITR + restore drills, R2 retention
<!-- /AUTOGEN:repo-status -->

## This session — `feat-receipt-extraction`: the first AI-system surface (ADR 0035)
Shipped Saldo's **first AI system** (EU AI Act Art. 3(1)): a user uploads a receipt image; a vision-LLM
proposes a structured extraction that flows **image → `extractReceipt` (OpenAI-compatible) → Zod at the
boundary → `mapExtractionToProposal` (@saldo/domain) → a human reviews/edits/confirms → `recordManualVoucher`**
(the EXISTING posting path, ADR 0034). AI proposes, the rules engine validates, a human confirms (ADR 0002)
— the model never writes the ledger. **App + integration + one pure domain module; NO schema change.** Full
gate green (typecheck · lint · format:check · `test` **195 domain / 105 web (16 files incl. the new
propose→validate→confirm Testcontainers path)** · lint:repo · status:check · backlog validate). Reviewed by
vat- (SOUND), privacy-, integration-, and a11y-reviewers; their substantive findings were fixed (below).
Landing as a reviewed PR.
- **Propose-only, local-first (ADR 0009).** `integrations/llm/client.server.ts` speaks the
  OpenAI-compatible `/v1/chat/completions` vision wire format; backend is config not code
  (`LLM_BASE_URL/_API_KEY/_MODEL`), default a **local** Ollama/vLLM → zero external calls out of the box.
  Unset/blocked → the surface is cleanly unavailable (UI points to the manual path).
- **Provenance is in the contract (Art. 50(2)).** `contracts/receipt-extraction.ts`: `aiProvenance` with
  `aiAssisted` as a **literal `true`** + model/version/confidence is a REQUIRED field — an undisclosed
  proposal can't type-check or parse (a unit test pins this code-level gate). The UI **discloses
  AI-assisted at first interaction** (Art. 50(1)) on the review step.
- **Pure domain mapping.** `packages/domain/src/extraction/mapExtractionToProposal` — direction→event
  (sale→income/purchase→expense), NOK-only + positive-net gate, and a **status-independent** 25 %
  sanity signal (the org's VAT fork stays solely in `deriveStandard*`). Exhaustive + fast-check tested.
- **Residency is a mechanical fail-closed gate** (privacy review): an on-prem host (loopback/RFC1918/
  `.internal`/`.local`) is allowed; any other host needs `LLM_EU_RESIDENT=true` or the feature stays
  off — receipt image bytes never silently leave the EU. Image is **transient, never persisted, never
  logged**; `supplier` tagged `// personal` at the boundary.
- **a11y fixes applied:** the review step moves focus to the AI-disclosure `<h2>` on the server
  round-trip (2.4.3/4.1.3), and the kind radio group now links a `role="alert"` error (mirrors the
  manual voucher form).
- **Capture (Art. 53):** `db/reference/llm/2026-06-24-…md` — the OpenAI-compatible vision wire contract
  + the Qwen2.5-VL model card (Apache-2.0), dated, cited.
- **Sequenced (depends on this task):** durable provenance **logging** = `aia-provenance-logging`
  (paired with the observability baseline); systematic disclosure = `aia-transparency-ui` (now the
  highest-value ready task); receipt **image storage** (EU R2) is later work.
- **Next:** `aia-transparency-ui` [high/S] is the highest-value ready task; or sales-invoice issuance /
  `feat-org-active-context` (home still reveals the alphabetically-first org).

## Previous session — `feat-honest-number-surface`: the reveal (ADR 0033)
Delivered org-onboarding's payoff — the honest-number reveal ("what's actually yours",
experience-principles §6). **App + domain + docs; no schema change** (read-only over the existing
ledger). `db/ledger.server.ts#aggregateLedger` sums one fiscal year's POSTED vouchers by **kontoklasse
(`account.type`) + `vat_code.direction`** (output/input VAT restricted to the klasse-2 liability legs, so
the output code on the revenue line doesn't double-count); the pure `honestNumberFromLedger` composes
`income = revenueNet + outputVatCollected`, `profit = revenueNet − expenseNet → estimateEnkIncomeTax`.
`home.tsx` is the reveal (Fraunces spendable peak + a calm "you're caught up" empty state). **NOT AI /
NOT profiling** (ADR 0022). Testcontainers aggregation suite: partition correctness, drafts excluded,
year-scoped, RLS-isolated.

## Earlier session — `feat-org-onboarding`: the product gateway (ADR 0032)
Turned the foundation into a usable product: a logged-in user creates an org, becomes its `owner`, and
the org is provisioned with a complete, standards-grounded chart + VAT codes — making `withOrgTx` real
per user. **App-layer + domain + docs; no schema change** (every table already existed). Full gate green
(typecheck · lint · format · `test` **161 domain / 61 web** incl. the new Testcontainers provisioning
suite · lint:repo · backlog validate · status:check). Landing as a reviewed PR.
- **Provisioning (the keystone, ADR 0032).** `createOrganization` runs ONE `withOrgTx(newOrgId)`
  bootstrap: insert the `organization` row, then the **full committed SAF-T 4-char kontoplan (745
  accounts)** + **all 30 standard tax codes**, then the creator's `membership` (`owner`) — atomic. Data
  is mechanical + source-grounded (numbers/names/rates from the committed CSVs via the pure
  `@saldo/domain` parsers + `rateForCategory`; **no curation**). Account `type` = kontoklasse via a new,
  exhaustively-tested `classifyAccountType` in the domain. A duplicate org-nr is a typed outcome that
  rolls back wholesale (no partial chart). CSVs are inlined with Vite `?raw` (no runtime fs).
- **First real forms/tables surface.** `pnpm add react-hook-form @hookform/resolvers @tanstack/react-table`
  (chosen in `frontend.md`, installed here in their first consumer). `/orgs/new` = RHF + zodResolver over
  the `app/contracts/organization.ts` schema, but the real `<Form>` + server action is authoritative
  (works without JS). `/orgs/:orgId` = a TanStack Table of the provisioned VAT codes. `/orgs` = the
  multi-membership selection list.
- **Consumes `/oppslag`.** The brreg detail card now has a "Bruk dette foretaket" CTA → `/orgs/new?orgnr=…`;
  the create loader prefills name + a **proposed** MVA status from the public VAT-register flag (a
  deterministic register read, **not** AI). MVA status forks all posting, so the human confirms it
  explicitly (sober §5.5 framing, each option explained in plain language; keyed nb+en microcopy).
- **Tenancy.** Multi-membership listing reads each org through its own `withOrgTx` (RLS-correct on every
  topology — no SECURITY-DEFINER/BYPASSRLS assumption, which stays unverified on Neon). The integrity
  test proves: provisioned counts scoped to the org, the owner membership, **RLS isolation** between two
  tenants, and **atomic rollback** on a duplicate org-nr — run via the non-owner `saldo_app` connection.
- **Follow-ups added:** `feat-org-active-context` (session-scoped active org) and
  `feat-account-chart-curation` (filter pickers to a used/favourites subset over the full chart).
- **Next:** `feat-honest-number-surface` (now has org + provisioned codes/accounts to aggregate against —
  it needs a ledger-aggregation query + the reveal UI), or `feat-receipt-extraction` (the vision-LLM
  track — `backlog next`; now has a posting surface forming + a real org to receive proposals).

## Previous session — doc-freshness mechanism + knowledge graph (ADR 0031, A→B)
Closed the recurring doc-staleness at its root, *mechanically*. STATUS/roadmap used to **restate** facts
that already live in the ADR set + the task DAG (counts, what's-next), so they rotted. Now those volatile
facts are **generated** from committed sources and **gated** — they cannot drift from the graph. Both
assigned tasks (`harness-doc-freshness` A, `harness-knowledge-graph` B) are done; `harness-status-autopr`
(C) stays deferred (the "why" is in ADR 0031 / `rejected.md`). Landing as a reviewed PR.
- **A — generate + gate.** `tools/status-block.mjs` (dependency-free ESM) renders the volatile facts —
  ADR count+range (from `docs/decisions/0*.md`), backlog total/done/todo, and the highest-value ready
  task (reusing `load`/`readyTasks` from `backlog.mjs`) — into the `AUTOGEN:repo-status` block near the
  top of this file. `pnpm status:refresh` writes it; `pnpm status:check` (and `repo-lint` **check J**)
  re-render and fail on drift, with whitespace normalized so a `pnpm format` tweak can't false-fail.
  `backlog.mjs`'s CLI is now **guarded** (`import.meta.url`) so it imports without side effects. The
  hand-typed "Decisions: ADRs …" line is gone — the block is the only home for those numbers.
- **B — typed edges + evidence checks.** `tasks.json` gained optional `implements_adr` / `touches` /
  `sources` edges (populated on the clear cases). `backlog validate` type-checks their shapes;
  `repo-lint` **check K** verifies them against the repo: `implements_adr` must resolve to a real ADR;
  **stale-done** (a done/in_progress task whose `touches` are gone) is an error; **orphan-ADR** (an ADR
  no task implements/references) is one warning — 8 foundational ADRs (0001/0004/0005/0006/0008/0010/0011/0023)
  are accepted as task-less. The regulatory-page-past-`verify-by`-with-dependents check is left for later.
- **Gotchas honored:** no HEAD/branch/commit-date/test-counts in the gated block (self-reference +
  live-run traps); facts derive only from committed files; both tools are plain-Node ESM.
- **Proof it works:** flipping the two harness tasks to `done` without refreshing made `pnpm lint:repo`
  fail (stale block) until `pnpm status:refresh` re-rendered it — the staleness is now caught by a gate,
  not an audit. **Next:** the product keystone `feat-org-onboarding` (see "Next up").

## Previous session — repo-wide consistency audit + remediation (doc-quality)
An owner-requested audit of the **entire repo** against the AGENTS.md standard, then a full remediation —
landing as a reviewed PR to `main`. Audit report: `docs/repo-consistency-audit-2026-06-23.md` (carries a
resolution banner). Full gate green (typecheck · lint · test · lint:repo · format:check · backlog validate).
- **P0 correctness:** bokføringsplikt no longer conflated with the 50k MVA threshold (grounded in the
  committed Skatteetaten capture); the LLM-default contradiction; deploy docs → ADR 0015; the CI-step
  order vs `ci.yml`; the auth-broker ADR ref (0008 → 0020).
- **Neutral voice:** removed reader-addressing "You chose…" (roadmap) and editorial "we/our" (the ADR
  template + ~14 ADRs, tech-stack, SECURITY, READMEs, …) — and **added a `repo-lint` voice gate**
  (check I) so it can't recur (proven to bite; runs in CI + the docs PostToolUse hook).
- **State a fact once:** condensed duplicated/stale content to pointers — build-spec §4.2/§6/§14/§15/§17/§18
  (~650 → ~424 lines), domain-model, decisions/README prose, the tech-stack agentic block,
  house-standards §3a/§4. Closes `docs-consolidate-build-spec`.
- **De-staling + structure:** STATUS current-state facts (branch/HEAD/counts/ENK rates) → pointers; dead
  integration refs → "(planned)"; emoji → text; status banners on the four narrative docs; ADR
  supersession reciprocity (0002→0022/0028, 0022→0028, 0027→0030).
- **Source-grounding:** captured **mval § 2-1** verbatim (the 50k/140k registration threshold) into
  `db/reference/mva/` and grounded `mva-registration-threshold.md` (dropped its "not yet committed"
  caveat). Egress was available and used.
- **Harness:** `.claude/settings.json` — allow `pnpm db:lint`; gate `pnpm db:rollback` (not raw `dbmate down`).
- **Next:** the assigned `harness-doc-freshness` (status-block.mjs) then `harness-knowledge-graph` (the brief
  at the top). The doc corpus is now clean + voice-gated, so the generator lands on solid ground.

## Previous session — `feat-tax-estimate`: source-grounded ENK income-tax estimate (ADR 0029)
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
- **Two facts pinned that are widely gotten wrong** (now canonical in
  `docs/regulatory/skatt-enk-personskatt.md`): a *person's* 22 % alminnelig inntekt is the sum of
  fellesskatt + kommune + fylke (the § 3-3 "22 %" is the **company** rate, not an ENK owner's), and
  **minstefradrag does NOT apply to næringsinntekt**. The exact 2026 figures (personfradrag,
  trygdeavgift rate/floor/phase-in) live on that cited page — not restated here.
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

## Previous session — `vat-sectoral-exemptions`: the activity dimension on the VAT gate (ADR 0030)
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

## Verified state (current — see `git rev-parse HEAD` for the exact commit)
Full gate green at HEAD:
- Static gates green: `pnpm typecheck` · `lint` · `format:check` · `lint:repo` · `backlog validate`
  (run them or see CI for the live counts — not restated here).
- `pnpm test` green (domain: exhaustive + fast-check; web; the integration suite skips cleanly with no
  DB and runs on **Testcontainers in CI**).
- **Decisions / backlog counts:** see the generated "Repo status" block near the top (ADR count+range
  and backlog totals are rendered from committed sources by `pnpm status:refresh`, never hand-typed).
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
- **Domain core is well-developed** (`packages/domain`, pure + 171 tests): money/`Øre`, ids, the VAT engine
  (`status` → per-line `line-treatment` → sectoral `activity` gate), the ENK income-`tax` estimate,
  `honest-number`, `posting`/balance, the `rules` engine, the `saft` code/account/rate model.
- **Persistence + tenancy proven**: the SQL ledger (voucher/posting/account/period/invoice-counter),
  integrity triggers, gapless counter, FORCE-RLS — proven by Testcontainers.
- **Auth/identity landed**: sessions + argon2id dev provider; OIDC wired but **not live-verified**.
- **The application/UI surface is growing** — `/oppslag` (brreg lookup) and now the **org-onboarding
  gateway** (`/orgs`, `/orgs/new`, `/orgs/:orgId`: create + provision + multi-membership selection) are
  real feature routes, and `home.tsx` is now the **honest-number reveal** (ADR 0033). There is still
  **no invoice or posting UI** — the reveal reads a ledger that stays empty until `feat-manual-voucher-entry`.
- **Keystone DONE:** `feat-org-onboarding` (ADR 0032) — create an org + owner membership + provision its
  per-org `vat_code`/`account` lists from the committed SAF-T data, atomically. This unblocks the
  DB-dependent features (`feat-honest-number-surface`, invoicing, posting).

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
- The **doc-freshness mechanism + knowledge graph** (this session, ADR 0031) is landing via a reviewed
  PR to `main` — see the "This session" block above. Nothing else is mid-flight.

## Next up
**The task graph is the source of truth — `pnpm backlog` (`next` / `ready` / `list`), per ADR 0019.**
Don't re-derive "what's next" in prose here; this is just the orientation.
- **Fill the ledger: `feat-manual-voucher-entry`** [high/M] — the first posting surface (added this
  session). The org gateway (ADR 0032) and the honest-number reveal (ADR 0033) are both live, but the
  ledger is empty: nothing posts vouchers yet, so the reveal shows zero. A minimal manual-voucher slice
  (derive via `@saldo/domain` → rules-engine gate → `withUserOrg` insert → `posted_at`) makes the reveal
  show real numbers and is the base for invoice issuance + receipt-extraction landing.
- **Other high-value ready:** `feat-receipt-extraction` (vision-LLM proposals — now has both an org and a
  forming posting surface to land into), `test-stateful-ledger` (model-based ledger testing), `ops-dr-runbook`.
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
- **`vat_code` / `account` per-org provisioning — DONE** (ADR 0032, `feat-org-onboarding`). A fresh org
  is seeded with the full committed SAF-T kontoplan + 30 tax codes inside the org-creation `withOrgTx`.
  Open refinement: a fresh org carries all 745 accounts — `feat-account-chart-curation` filters pickers.
- **OIDC is not live-verified** — needs a Criipto tenant + egress. Org-**selection** UX (multi-membership)
  landed in `feat-org-onboarding`; a persisted *active* org (so feature routes need no `orgId` in the
  path) is `feat-org-active-context`.
- **`.env.example` not updated for auth** — `env.ts` is the Zod contract (`DATABASE_URL`=saldo_app,
  `APP_URL`, optional `OIDC_*`, `NODE_ENV`); `.env.example` is agent-deny'd, so update it by hand. Deploy
  runs migrations as a separate OWNER `DATABASE_URL`; the app process uses the `saldo_app` one.
- **Live integrations deferred** — verify Neon EU + custom-role RLS, and that **Hyperdrive preserves
  `SET LOCAL`**, when wiring auth/DB live (needs egress + tenants).
- **`saft:validate` is a scaffold** — prints `NOT YET IMPLEMENTED` loudly (CI label: SCAFFOLD). Implement
  SAF-T generation + XSD validation (Phase 8).
- **The honest-number reveal shows zero until there's posting data** — `home.tsx` is the real reveal now
  (ADR 0033), but the ledger is empty until `feat-manual-voucher-entry` lands a posting surface. The
  empty state ("you're caught up") is intentional, not a bug.
- **Build-spec consolidation pending** — `docs/saldo-build-specification.md` has a stale dir tree + inlined
  harness copies (tracked: `docs-consolidate-build-spec`).
- **Local commits are unsigned** (no signing key here); they verify on push through the proxy.
