# STATUS — handover

> Living handover doc. Update at the END of every session (see `.claude/skills/handover`).
> The next session reads this first, then reconciles against `git log` / actual code — **trust the code**.
> Forward-looking only: where the build is, what's in flight, what's next. The record of *what changed*
> is `git log` + the ADRs — per-session history is NOT accumulated here (that bloat is the thing this
> doc keeps fighting). Volatile counts are generated into the `AUTOGEN:repo-status` block, never typed.

**Last updated:** 2026-06-26 — session `invoice-pdf-email` (ADR 0046: invoice PDF + Postmark-EU email +
EHF/PEPPOL local gen); prior decision `transactional-email-provider` (ADR 0045). Branch + HEAD live in `git`
(`git rev-parse --abbrev-ref HEAD`), not restated here where they would only go stale.

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
- **Persistence + tenancy proven by Testcontainers:** the SQL ledger (voucher/posting/account/period/
  invoice-counter), the 6 integrity triggers, the gapless counter, FORCE-RLS isolation — now including
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
- **Decisions:** 46 ADRs (0001–0046) — index in [`docs/decisions/README.md`](decisions/README.md).
- **Backlog:** 78 tasks (34 done, 44 todo) — the DAG is [`docs/backlog/tasks.json`](backlog/tasks.json) (`pnpm backlog`).
- **Highest-value ready task:** `feat-banking-import` [high/L] — Banking import — GoCardless PSD2/AIS + camt.054 + CSV
<!-- /AUTOGEN:repo-status -->

## In progress
Nothing mid-flight. The most recent work — **invoice PDF + email + EHF** (`feat-invoice-pdf-email`, ADR
0046) — landed via a reviewed PR; see `git log`. Its **go-live** prerequisites are NOT exercised locally:
a Postmark EU account + DPA + a verified sending domain (SPF/DKIM/DMARC) + the API key in the deploy env,
and **verifying the configured SMTP host IS the EU region** (the `EMAIL_REGION` flag is an operator
assertion, not host geolocation). Known follow-ons it deferred: the send orchestration runs inline (an
at-most-once gap on a crash between send and record) — move it to a graphile-worker job with idempotency
when the jobs surface lands; the EHF is the **subset + well-formedness**, with the full VEFA Schematron +
transmission + structured buyer address in **`feat-peppol-send`** (Phase 9). Supplier invoices build on
`recordReverseChargePurchase` (ADR 0044) via **`feat-supplier-invoices`**. Recurring/reminders remain
`feat-recurring-invoices-reminders`. Below-threshold § 3-30 self-accounting on foreign-service purchases
is sequenced to `vat-threshold-watcher`. The project-wide privacy gap is still tracked: data export in
`feat-audit-trail-export`, GDPR erasure in `feat-gdpr-erasure`.

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
- **`saft:validate` is a scaffold** — prints `NOT YET IMPLEMENTED` loudly (CI label: SCAFFOLD). Implement
  SAF-T generation + XSD validation (Phase 8).
- **Account-chart curation** — a fresh org carries all 745 SAF-T accounts; `feat-account-chart-curation`
  filters pickers to a used/favourites subset.
- **Build-spec consolidation** — `docs/saldo-build-specification.md` still has a stale dir tree + inlined
  harness copies (tracked: `docs-consolidate-build-spec`).
- **Local commits are unsigned** (no signing key here); they verify on push through the proxy.
