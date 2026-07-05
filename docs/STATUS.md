# STATUS — handover

> Living handover doc. Update at the END of every session (see `.claude/skills/handover`).
> The next session reads this first, then reconciles against `git log` / actual code — **trust the code**.
> Forward-looking only: where the build is, what's in flight, what's next. The record of *what changed*
> is `git log` + the ADRs — per-session history is NOT accumulated here (that bloat is the thing this
> doc keeps fighting). Volatile counts are generated into the `AUTOGEN:repo-status` block, never typed.

**Last updated:** 2026-07-05 — session `feat-companion` (**ADR 0059** — the companion/guide system,
the embodied voice of ADR 0025 in ADR 0058's look: typed `<Companion>`/`<CompanionGuide>` components
(`apps/web/app/components/companion.tsx` — closed expression set, honest 96→12 px ladder), the
`--companion`/`--companion-foreground` semantic tokens (closes PR #66's design-review advisory), a
cookie-backed no-JS dismissal via the `/companion` resource route with the settings way-back, and the
first placements: home onboard/empty/à-jour header + the invoices empty list. Deterministic — NOT an
AI system (Recital 12); every string addresses "hjelperen" structurally, so naming after
`companion-user-validation` is a string change. All gates green locally (typecheck/lint/format/test/
lint:repo/backlog/audit); design-review pass clean; the a11y-reviewer's two findings (guide-as-aside
landmark demotion, 24px dismiss target) fixed in-session. **This branch was STACKED on the
then-unmerged PR #66**: the spike commit was cherry-picked (identical content, clean merge whichever
lands first). Earlier same day: session `visual-identity-spike` (the `design-visual-spike` task:
**ADR 0058** — the flat "papirklipp" illustration grammar + the round balance-ball companion, working
name **Øre** — with the committed visual reference `docs/design/visual-identity-spike.html`
(self-contained, real OKLCH tokens, light/dark verified by screenshot), the rules distilled into
`.claude/rules/design-system.md`, and the `companion-user-validation` gate task added; landed via PR
from `claude/visual-identity-spike-65veo9`). Earlier same day: session
`dependabot-dev-deps-migration` — the PR #61 dev-dependencies group landed as a real toolchain
migration (TypeScript 6, ESLint 10, fast-check 4, vitest 4, @types/node 26, testcontainers 12,
knip 6.24, prettier 3.9 + tailwind plugin 0.8, @react-router/dev 8 aligned with the RR8 runtime),
**merged to main as `36b4015`**. Prior sessions `review-2026-07-03-fixes` (the 2026-07-03 repo review,
P0 through P2 + docs), `feat-supplier-invoices` (Purchases completed, ADR 0056) and `harness-hardening`
(ADR 0057 — the harness keeps its own promises: `review:check`, `eval:validate`, incremental gates;
the `.claude/settings.json` allowlist sync + `review-reminder.sh` registration are still pending —
see the harness-verification-gates task notes); `review-followups` (2026-06-28 review,
archived at `docs/archive/repo-code-review-2026-06-28.md`).

### Visual identity (2026-07-05, ADR 0058)
Illustration is the flat **papirklipp** grammar (fields = sky/lilac/mint 4–6, focal = brand step-9
solids max two per scene, ink = neutral-12, paper-white props; no gradients/outlines/shadows; semantic
green/red/amber never decorative; never inside money/tables, never at §5.5). The companion is the round
balance ball **Øre** (electric-9 body, theme-stable white features, degrades 96→12 px where 12 px = the
ambient status dot; no blame/alarm expressions; dismissible; LLM speech AI-labelled — ADR 0022/0036).
The Torpedo is a sibling grape dart, purre-flow only. **Final name/face is gated on
`companion-user-validation`** (real users) — the grammar and rules bind now. `feat-companion` is DONE
(ADR 0059): the semantic-token advisory is closed and the character ships as the typed component —
future surfaces compose `Companion`/`CompanionGuide` with a new copy key, nothing else.

### Toolchain migration notes (2026-07-05, PR #61)
The TS 6 `node:`-import resolution change moved the domain purity gate: `packages/domain/tsconfig.json`
is now the full project (tests get node types; typescript-eslint's project service needs every file in
a project) and **`tsconfig.src.json` is the purity gate** (`types: []`, production sources only) —
`pnpm typecheck` runs it first, so the no-I/O invariant stays mechanical. `fc.fullUnicodeString` →
`fc.string({ unit: 'binary' })` (same code-point domain). `apps/web` dropped the TS-6-deprecated
`baseUrl`. Advisory-only peer warnings to watch for upstream releases: eslint-plugin-jsx-a11y peers at
eslint ^9 (passes on flat config), type-coverage peers at TS ≤5 (runs correctly on 6) — dependabot may
open PRs for both; merging those closes the two warnings.

### Review 2026-07-03 — landed this session (details: git log on the branch)
**P0:** a credit-note draft can no longer revert to a positive invoice (kind/creditsInvoiceId are
immutable in `updateDraft` + the editor locks kind); the vision-LLM receipt extract requires org
membership + a per-user rate limit; posting append-only now covers INSERT (new trigger
`posting_immutable_insert`, same-tx carve-out, in the DR verifier's required list). **P1:** rate
limiters key on the trusted right-most XFF hop; reconciliation serializes concurrent confirms (FOR
UPDATE + guarded UPDATEs + CAS `transitionInvoice`; concurrency tests); a shared pending-aware
`SubmitButton` backs every submit; `issueInvoice` locks before allocating (a raced issue never wastes
a gapless number); **ADR 0054 — category-level VAT rounding** (BR-CO-17) across totals/voucher legs/
frozen breakdown/preview; MVA-melding reports code 6 unntatt turnover per the official example; CI
gained the introspect-drift gate, digest-pinned PG, RuleTester coverage for eslint-plugin-saldo, and
lost `--passWithNoTests`. **P2:** contracts correlate kind↔creditsInvoiceId (+ email/quantity bounds);
CSV import validates currency + reports true file lines; domain dedups (isoDayOrdinal, oreToAmount,
SAF-T CSV prelude, tax-code test fixture) + negative-amount guards + dead-export prune; same-org FK on
`bank_transaction.matched_voucher_id` + hot-path indexes + DR counter-vs-max(invoice_number) check;
web dedups (Money everywhere, MoneyText, report total row, TextField amounts, route-param guard) +
a11y (keyboard-scrollable tables, titles, decimal inputMode, --paid/--overdue badge tokens, review
state survives a failed receipt confirm, no-JS invoice form round-trip keeps input) + real PWA icons/
favicon; root loader re-issues the sliding session cookie; **ADR 0055 — dev auth requires explicit
`DEV_AUTH=true` and never runs in prod** (set it in local `.env` for password login); `Origin: null`
→ 403. Docs reconciled with the manifests (RHF/TanStack installed; the deferred set marked), the CI
gate list single-sourced to `ci.yml`, ADR 0010 marked deferred, the Skatteetaten validation client
explicitly quarantined until `wire-skatteetaten-validation`.

**Open follow-ups from that review:** the two remaining §12/13 nice-to-haves — consolidating the
remaining bespoke labelled fields beyond the amount inputs, and per-table `aria-label`s at call sites
(the component accepts one). `recordReverseChargePurchase` is intentionally kept for the
supplier-invoices PR (#58, since merged), and `saftClosingBalanceNet` is kept as the SAF-T export integrity
tie-out (both were flagged dead). The review report landed on main via #62
(`docs/repo-code-review-2026-07-03.md`); every finding was cross-checked against it after it
surfaced, and the last gaps (db:lint pipe swallow, lockfile-pinned squawk/cdxgen, quote-aware SAF-T
splitter, the orgs.new/bank.new local Field copies, likviditet total row, CardTitle-as-heading,
manifest orientation lock, remaining tech-stack rows, the 2026-06-23 audit archived, the
termMonths/BIMONTHLY_TERMS/imbalance dead exports) were closed in follow-up commits.

### Latest landed — Purchases completed (feat-supplier-invoices, ADR 0056)
The accounts-payable side of purchases is now end-to-end. **Domain:** `derivePurchaseInvoice` merges
per-line `derivePurchase` / `deriveReverseChargePurchase` into one balanced AP voucher (the input-VAT
fork reused, payable credited net on reverse-charge lines); `expense-deductibility` encodes the
representasjon / restricted-vehicle / private-use non-deductible reasons (human-recorded → gross to
cost); `deriveOwnerOutlay` + `deriveDrawing` post the ENK owner-economy events (utlegg, privatuttak,
kjøregodtgjørelse/diett) as **equity movements, not payroll** — all exhaustive + fast-check tested.
**DB:** `supplier_invoice` + `supplier_invoice_line` tables (no gapless number; draft→posted;
append-only once posted) + `voucher.supplier_invoice_id` link; Testcontainers integrity tests prove the
posted AP voucher balances, the reverse-charge dual leg lands on the melding, immutability holds, and
RLS scopes the new tables. **Web:** the `purchases` list/new/detail routes + the `owner/new` posting
surface, with a route-test suite. `relations.ts` was re-hand-corrected after introspect (the FK-join
fix is locked by `relations.integration.test.ts`).

### Deferred from this slice (tracked in the backlog)
Recurring expenses (`feat-recurring-expenses` — needs the graphile-worker runner stood up, like
recurring invoices); goods-withdrawal output VAT (uttaks-mva); AP aging / supplier reskontro (a
reporting surface); auto-*suggesting* a non-deductible reason from the chosen account (kept
human-confirmed). Branch + HEAD live in `git`, not restated here where they would only go stale.

> ⚠️ **Live external integrations vary by environment.** Confirmed locally: the Neon control plane is
> NOT wired here (`DATABASE_URL`/`SALDO_TEST_PG_URI` point at a LOCAL Postgres, not Neon) and there is
> no live R2 bucket. The Testcontainers / integrity work needs only a real Postgres (the local cluster
> provides it) — but don't assume egress for the Neon/R2 follow-ons.

## Current state (the honest picture)
**Phase 0 (Foundation) — COMPLETE** (Option-2 architecture + ADRs, frontend tokens + React 19,
auth/identity, ledger-integrity gaps, mechanical gates, observability, EU AI Act posture). Now in the
**feature + regulatory-engine track**. Reconcile this summary against `git log` + the ADRs.

- **Domain core (`packages/domain`, pure + property-tested):** money/`Øre`, ids, the VAT engine
  (`status` → per-line `line-treatment` → sectoral `activity` gate), the ENK income-`tax` estimate,
  `honest-number`, `posting`/balance, the `rules` engine, the `saft` code/account/rate model.
  - *Sectoral activity gate (kap. 3) is pure but NOT yet wired into the voucher rules engine:*
    `vatLineRule` runs only the registration gate (`checkVatLine`); `checkVatActivityLine` is enforced
    only where an `activity` is in hand, because the voucher/posting line model carries no `activity`
    field. Deferred per ADR 0030 (sequenced to `vat-mixed-activity`); the open boundary is locked by a
    test in `rules/vat-line.test.ts`.
- **Persistence + tenancy proven by Testcontainers:** the SQL ledger (voucher/posting/account/period/
  invoice-counter), the 7 integrity triggers, the gapless counter, FORCE-RLS isolation — now including
  **stateful, model-based property testing** that drives random histories through the real Postgres
  (ADR 0039).
- **Auth/identity landed:** sessions + argon2id dev provider; OIDC wired but **not live-verified**.
- **UI surface (real feature routes):** `/oppslag` (brreg lookup), the org-onboarding gateway
  (`/orgs`, `/orgs/new`, `/orgs/:orgId`: create + provision + multi-membership), `home.tsx` = the
  honest-number reveal (ADR 0033), manual voucher entry (ADR 0034), receipt extraction — the first
  AI system (ADR 0035) — with the shared AI-transparency primitive (ADR 0036) and durable provenance
  (ADR 0037), the **contacts register** (`/orgs/:orgId/contacts` list/new/edit — customers &
  suppliers in one table, brreg autofill, per-contact MVA status + defaults, ADR 0040), and the
  **products & services catalogue** (`/orgs/:orgId/products` list/new/edit — goods/service items with
  a net øre price, a derived incl-VAT preview, unit, and same-org default account/VAT code, ADR 0041),
  and **sales invoicing** (`/orgs/:orgId/invoices` list/new/detail — quote/invoice/credit-note in one
  `kind` model; a draft editor with dynamic ad-hoc or catalogue-prefilled lines + live net/VAT/gross
  preview; per-line MVA HARD BLOCK reusing the domain `checkVatLine`; GAPLESS numbering + per-invoice
  KID on issue; an issued document append-only via SQL triggers; lifecycle draft→issued→sent→viewed→
  paid + overdue; credit-note creation; ADR 0042), and **invoice → ledger posting** (issuing a sales
  invoice / credit note now posts a BALANCED AR voucher — debit receivable gross, credit revenue per
  line, credit output VAT per rate — atomically in the issuing tx, via the pure `deriveSalesInvoice`
  reusing `deriveSales`; a credit note posts the reversing motbilag; `voucher.invoice_id` links the
  document to its ledger entry; VAT is treatment-gated so the voucher ties out to the frozen `vat_ore`;
  ADR 0043), and **reverse-charge / non-deductible VAT** (snudd avregning) hardening the slice:
  `deriveReverseChargePurchase` posts the buyer's DUAL leg (self-accounted output 2704–2709 + deductible
  input 2714–2718) so both land on the MVA basis even when net cash is zero; non-deductible (`uten
  fradragsrett`, representasjon/vehicle/private) books the VAT to cost; deductibility + the VAT-account
  kind are classified from the committed SAF-T descriptions (`reverseChargeInputDeductible` /
  `reverseChargeKind`); `checkSalesLine` now allows the domestic RC sale (51, revenue-at-net) and BLOCKS
  the buyer-self-account purchase codes on a sales document; `recordReverseChargePurchase` + a
  Testcontainers integrity test prove both legs balance and aggregate (ADR 0044). The org page carries a
  registers nav linking all three. EU AI Act Art. 50 disclosure +
  Art. 50(2) audit trail are in place. The invoicing→ledger loop is now closed, and **invoice delivery**
  (`feat-invoice-pdf-email`, ADR 0046) landed: an issued document renders to **PDF** (`@react-pdf/renderer`,
  a `.pdf` resource route) with the per-rate MVA-grunnlag summed from FROZEN amounts (`frozenVatBreakdown`,
  never recomputed); **email delivery** via the provider-agnostic nodemailer SMTP interface (Postmark EU —
  fail-closed `EMAIL_REGION=eu` gate + `requireTLS`, credentials from `env.ts` only, recipients/bodies never
  logged) as a §5.5 explicit-confirm act that advances draft/issued→sent and records to the append-only
  `invoice_email` log (RLS + same-org FK); and **EHF/PEPPOL BIS 3.0** generated locally (pure UBL builder +
  grounded rule validator in `@saldo/domain/peppol`, `pnpm ehf:validate` gate) — the subset + well-formedness
  "start now", with the full VEFA Schematron + transmission + structured buyer address split to
  `feat-peppol-send`. Recurring/reminders (`feat-recurring-invoices-reminders`) remain split out.

**Gates (run them or see CI for live counts — not restated here):** `pnpm typecheck` · `lint` ·
`format:check` · `lint:repo` (harness + cited-docs + link integrity + no-contradiction + the generated
status block, ADR 0031) · `backlog validate` · `test` (domain: exhaustive + fast-check; web; the
integrity suite skips cleanly with no DB and runs on Testcontainers in CI).

## Repo status (generated — do not edit; `pnpm status:refresh`)
The volatile facts below are rendered from committed sources (ADR files + the task DAG) by
`tools/status-block.mjs` and gated by `pnpm lint:repo` — they cannot drift from the graph (ADR 0031).
<!-- AUTOGEN:repo-status -->
<!-- Generated from committed sources by tools/status-block.mjs — DO NOT EDIT BY HAND; run `pnpm status:refresh`. -->
- **Decisions:** 61 ADRs (0001–0061) — index in [`docs/decisions/README.md`](decisions/README.md).
- **Backlog:** 84 tasks (51 done, 33 todo) — the DAG is [`docs/backlog/tasks.json`](backlog/tasks.json) (`pnpm backlog`).
- **Highest-value ready task:** `aia-gpai-docs` [medium/S] — EU AI Act: capture the upstream GPAI model's Annex XII docs (Art 53)
<!-- /AUTOGEN:repo-status -->

## In progress
Nothing mid-flight. The most recent work — **SAF-T Financial export** (`feat-saft-export`, ADR 0052) —
is the standardised bokettersyn file, generated **read-only** from the posted ledger: a new RLS-scoped
`readSaftFinancial(year)` reads account masters (opening/closing balances), every posted voucher as
Journal→Transaction→Line, and the customers/suppliers register; the pure `@saldo/domain/saft/financial`
(`generateSaftFinancial` + `buildSaftXml`) composes the XSD-valid `AuditFile` and ties it out
(TotalDebit = TotalCredit, closing balances net to zero). `pnpm saft:validate` now does **real XSD
validation** against the committed v1.10 schema (`xmllint-wasm`) + tie-out + well-formedness — the
SCAFFOLD label is gone. A `/orgs/:orgId/saft` view + `saft.xml` resource route preview/download it.
Deterministic — **NOT an AI system** (Recital 12). Domain exhaustive + property tests + a Testcontainers
tie-out/RLS integration test (XSD-validates real seeded data). **Deferred (ADR 0052):** line-level
`CustomerID`/`SupplierID` subledger refs; the optional `SourceDocuments` section; multi-year
result-account opening balances (they carry prior-year cumulative until `feat-year-end-close` — a
first-year export is fully honest); Altinn delivery. The prior **Reporting** (`feat-reporting`, ADR 0051) — landed via a
reviewed PR; see `git log`. Resultat/balanse/hovedbok/reskontro/likviditet are derived **read-only**
from the posted ledger: a new RLS-scoped `aggregateAccountBalances(year)` sums Σdebit/Σcredit per
account, and the pure `@saldo/domain/reporting` functions compose the reports by kontoklasse. The hard
tie-outs (resultat + balanse balance — incl. klasse-8 privatuttak landing on equity, not in årsresultat;
reskontro reconciles to the 1500 control account) are proven by a Testcontainers test; figures carry an
accessible currency label (WCAG 2.2 AA). Deterministic — **NOT an AI system** (Recital 12). The hovedbok
is the explicit depth-on-demand surface (§4.2). **Deferred (ADR 0051):** open AP + leverandørreskontro
(`feat-supplier-invoices`); multi-year opening balances + year-end close (`feat-year-end-close`);
period-over-period comparison; the reskontro→control reconciliation line for manual/partial 1500 moves.

The prior **MVA-melding generation** (`feat-mva-melding`, ADR 0050) — also landed. The VAT return is
generated **read-only** from the posted
ledger: a new RLS-scoped query (`aggregateVatByCode`) sums one fiscal year PER SAF-T VAT code into
`grunnlag` (net basis on revenue/cost lines) + `merverdiavgift` (signed VAT on the code's klasse-2
legs); the pure `@saldo/domain/mva-melding` then composes the `mvaMeldingDto` model (`generateMvaMelding`
+ `buildMvaMeldingXml` + the grounded `validateMvaMelding`), with the **tie-out by construction**
(`fastsattMerverdiavgift` = Σ line VAT = `outputVatCollected − deductibleInputVat`, the honest-number
quantity). The **MVA-status fork** decides whether a melding exists; reverse charge lands both legs
(output via the rate's output code, deduction + basis under the RC code). A `/orgs/:orgId/mva` view route
+ `mva.xml` resource route (NO/EN, §5.5 sober) preview + download it. Deterministic — **NOT an AI
system** (Recital 12 — no Art. 50). Grounded in the committed Skatteetaten schema/examples/code lists
(`db/reference/skatt/mva-melding/`, `docs/regulatory/mva-melding.md`). Validation is local — `pnpm
mva:validate` (generate → well-formedness → subset + exact tie-out, the EHF precedent) — with
Skatteetaten's **validation API behind a fail-closed, EU-resident, Zod-at-boundary client**
(`app/integrations/skatteetaten/`, off with no external call until onboarding + egress). Domain
exhaustive + fast-check tests + a Testcontainers integration test (per-code partition, the RC dual leg,
drafts excluded, RLS isolation) prove it; vat-reviewer + privacy-reviewer + integration-auditor ran.
**Deferred (ADR 0050):** full XSD / live-API validation (onboarding + egress); **bimonthly terms** (the
domain is ready — needs a per-voucher *bilagsdato*); **submission** via Altinn 3 (`feat-altinn-mva-
submission`, Phase 9); the 50k registration threshold (`vat-threshold-watcher`).

Banking import (`feat-banking-import`, ADR 0047) remains the import + persistence layer beneath it (the
append-only `bank_account` + `bank_transaction` substrate, the GoCardless/camt.054/CSV normaliser).
**Still deferred there:** the AIS fetch runs **inline-with-idempotency** (move to a graphile-worker job
when the jobs surface lands); the PSD2 **consent/link flow** is out of scope; go-live needs a GoCardless
account + secrets + `BANKING_EU_RESIDENT=true` in the deploy env (no egress exercised locally).

Earlier deferrals still open: invoice **email/EHF go-live** (`feat-invoice-pdf-email`, ADR 0046 — Postmark
EU account/DPA/SPF-DKIM-DMARC, EHF subset → full VEFA in `feat-peppol-send`); supplier invoices
(`feat-supplier-invoices`); recurring/reminders (`feat-recurring-invoices-reminders`); below-threshold
§ 3-30 self-accounting (`vat-threshold-watcher`); the project-wide privacy gap — data export
(`feat-audit-trail-export`) + GDPR erasure (`feat-gdpr-erasure`).

## Next up
**The task graph is the source of truth — `pnpm backlog` (`next` / `ready` / `list`), per ADR 0019.**
Don't re-derive "what's next" in prose here; this is orientation, not the record.
- **Highest-value ready task** comes from `pnpm backlog next` — see the generated block above.
- **AI-Act follow-ons (transparency thread):** `aia-conformity-checklist` (Art. 5/6/50 self-assessment),
  `aia-gpai-docs` (capture the upstream GPAI model's Annex XII docs, Art. 53), `aia-literacy-note` (Art. 4).
- **VAT/tax engine continuation:** `vat-reduced-rate-activity` (capture mval kap. 5 → rate-matching +
  the rules/DB activity wiring), `vat-threshold-watcher` (the 50k registration threshold),
  `vat-mixed-activity` (§ 8-2 apportionment). (`vat-reverse-charge` is DONE — ADR 0044.)
- **Regulatory grounding gaps:** `bokforingslov-doc` + the uncaptured Tier-1 sources (tidfesting,
  tap på krav § 4-7, uttak, justering kap. 9, EHF/Peppol B2G).
- **Sustaining discipline (roadmap Part 3, P1/P2):** make the quality bar mechanical (`ci-pr-template`),
  `test-e2e-axe`, OTel, mutation testing.

> **Forward plan (re-evaluated 2026-06-25):** the build-spec §16 phases 1(rest)–9 are now **modelled as
> backlog tasks** (contacts/products/opening-balances; sales invoicing + PDF/email + recurring; supplier
> invoices; banking import + reconciliation; MVA-melding + Altinn submission; reporting + year-end; SAF-T
> export + audit log + accountant access; PEPPOL/Vipps) — so `pnpm backlog next` now surfaces the product
> core (`feat-contacts-register`) rather than UI polish. Dependencies follow §16; **the phase ordering is
> proposed and awaits owner confirmation** (the roadmap is a historical P0 record — the task graph is now
> the live forward plan, per ADR 0019).

## Open decisions
- **Decided & in effect:** architecture = **Option 2** (persistent Node on an EU PaaS + Cloudflare
  edge/CDN + R2; Neon EU via Hyperdrive) — ADR 0015 (Workers-native is the documented runner-up);
  **Neon EU** (0013) + **Testcontainers** CI DB (0014); **shadcn + Tailwind v4 + React 19** (0006);
  **adaptive two-surface** design (0016); **grace-window** passive confirm (0002 refined); **Criipto**
  eID broker; **capture-and-encode** regulatory model, not runtime RAG (0028); **transactional email =
  Postmark (EU region)** behind the swappable nodemailer interface (0045) — needs a live account + DPA +
  SPF/DKIM/DMARC at go-live.
- **Still open:** Cloudflare **EU DPA + edge residency** confirm before go-live; **LLM hosting**
  (Phase 4; default local — the OpenAI-compatible abstraction keeps it a base-URL swap); **PEPPOL access
  point + Altinn onboarding** (Phase 9); **product name** ("Saldo" is a working name).

## Known issues / to verify
- **OIDC is not live-verified** — needs a Criipto tenant + egress. A persisted *active* org (so feature
  routes need no `orgId` in the path) is `feat-org-active-context`.
- **`.env.example` not updated for auth** — `env.ts` is the Zod contract (`DATABASE_URL`=saldo_app,
  `APP_URL`, optional `OIDC_*`, `NODE_ENV`); `.env.example` is agent-deny'd, so update it by hand. Deploy
  runs migrations as a separate OWNER `DATABASE_URL`; the app process uses the `saldo_app` one.
- **Live integrations deferred** — verify Neon EU + custom-role RLS, and that **Hyperdrive preserves
  `SET LOCAL`**, when wiring auth/DB live (needs egress + tenants).
- **DR live-verification pending (ADR 0038)** — restore *mechanics* are tested locally (`pnpm dr:drill`),
  but the live-only steps await a wired control plane (Neon history-retention window, first real Neon
  restore drill, the R2 `statutory-5yr` bucket lock + `tmp/` lifecycle rule, EU DPA). Checklist:
  `docs/runbooks/disaster-recovery.md`.
- **`saft:validate` is real now** (ADR 0052) — generate + tie-out + well-formedness + **XSD validation**
  against the committed v1.10 schema via `xmllint-wasm`. (`mva:validate` is generate + well-formedness +
  grounded subset + exact tie-out, ADR 0050; its full XSD/live-API validation still awaits
  onboarding+egress — SAF-T's schema is committed + self-contained, so full XSD validation lands now.)
- **Account-chart curation** — a fresh org carries all 745 SAF-T accounts; `feat-account-chart-curation`
  filters pickers to a used/favourites subset.
- **Build-spec consolidation** — `docs/saldo-build-specification.md` still has a stale dir tree + inlined
  harness copies (tracked: `docs-consolidate-build-spec`).
- **Local commits are unsigned** (no signing key here); they verify on push through the proxy.
- **Six superseded remote branches can't be deleted from a session** — `git push --delete` gets a
  hard 403 from the git proxy (tried in the 2026-07-04 merge session and again 2026-07-05; batched
  and single), and the GitHub MCP toolset has no delete-ref tool. Needs the owner, via UI or `gh`:
  `claude/phase-0-foundation-gej8rk`, `claude/vigilant-curie-gydm6s`, `claude/upbeat-darwin-hepsel`,
  `claude/tech-stack-review-kspak0`, `claude/neonctl-init-qdn54p`, `claude/quality-hardening`.
