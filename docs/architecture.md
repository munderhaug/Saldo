# Architecture

> Status: **Current** (2026-06-23).

Full stack: `docs/tech-stack.md`. Domain rules: `docs/domain-model.md`. Canonical spec:
`docs/saldo-build-specification.md`.

```
Browser (RR7 client, native-feel PWA)
  │  semantic HTML + <Form>; re-runs @saldo/domain for instant feedback; authoritative for NOTHING
  │  native-feel polish layered on top; an offline outbox for receipt capture
  ▼
RR7 server (loaders/actions, persistent Node on an EU PaaS + Cloudflare — ADR 0015) ── session (BankID via Criipto) ─┐
  │  validate via @saldo/domain → persist via Drizzle → enqueue graphile-worker jobs                   │
  │                                                                                                     │
  ├── @saldo/domain  (PURE TS: money, ids, VAT, posting, rules — no I/O)                                │
  │                                                                                                     │
  ├── Drizzle ──► PostgreSQL (Neon, EU — ADR 0013)                                                          │
  │                 integrity in SQL: balance trigger, immutability trigger, period-lock,               │
  │                 per-org invoice_counter (gapless), RLS via SET LOCAL app.current_org                │
  │                                                                                                     │
  ├── Object storage: Cloudflare R2 (S3 API, EU jurisdiction — ADR 0015) — receipts/PDF/SAF-T, 5-yr                     │
  │                                                                                                     │
  ├── Integrations: Enhetsregisteret · Skatteetaten (MVA validate/submit, SAF-T) · Altinn 3/ID-porten ·│
  │                 PEPPOL · GoCardless/camt.054 · Vipps · email (EU provider) · LLM (Langfuse optional) │
  │                                                                                                     │
  └── graphile-worker (on Postgres): recurring invoices, reminders, OCR→propose, threshold/term watchers┘

LLM layer: OpenAI-compatible client → Ollama/vLLM (Qwen2.5-VL) local by default, hosted optional.
            propose-only → rules engine validates → human confirms. Never writes to the ledger.
```

## The three authority layers (client is never one)
1. **PostgreSQL** — hard integrity (append-only ledger, balance/immutability/period-lock triggers,
   invoice-counter, RLS). Last line of defense.
2. **`@saldo/domain`** — pure money/VAT/posting/rules. The brain. Runs server-side AND in the browser.
3. **RR7 server (actions/loaders)** — orchestrates: validate → persist → integrate/enqueue → hold secrets.

## Key properties
- Domain core is pure and shared (zero drift between client preview and server truth).
- Integrity is enforced in the database, not the ORM.
- Server is the single source of truth (online-first; ADR 0001).
- The UI keeps a semantic-HTML, server-authoritative substrate; native polish is enhancement.
- The AI layer only proposes.

## Module boundaries
- The ONE hard boundary is pure (`packages/domain`) vs impure (`apps/web`). `db`, `contracts`,
  `integrations`, `jobs`, `auth` are modules inside `apps/web`, not separate packages.

## Code-true structure (generated)
The diagram above is the *narrative*; the facts below are *derived from the code* by
`tools/arch-graph.mjs` and gated by `pnpm lint:repo` — they cannot drift from the repo (ADR 0049).
Adding a package, route, domain submodule, or migration changes these counts, so a stale block fails
CI until `pnpm arch:refresh` is run. The domain-purity line is mechanically enforced: a `@saldo/domain`
source file that imports anything non-relative, or reaches for `Date.now`/`Math.random`/`new Date`,
fails the build.

<!-- AUTOGEN:arch-graph -->
<!-- Generated from committed sources by tools/arch-graph.mjs — DO NOT EDIT BY HAND; run `pnpm arch:refresh`. -->
- **Workspace packages:** `@saldo/domain` (packages/domain), `@saldo/web` (apps/web), `eslint-plugin-saldo` (tools/eslint-plugin-saldo)
- **The one hard boundary — `@saldo/domain` (pure):** 47 source modules, relative-imports-only, no wall-clock/random (enforced by `pnpm arch:check`). Submodules: banking, catalog, extraction, honest-number, ids, invoice, money, mva-melding, peppol, posting, reconciliation, reporting, rules, saft, tax, time, vat, xml.
- **`apps/web` modules (impure side):** auth, components, contracts, copy, db, documents, integrations, jobs, lib, observability, routes.
- **Client↔server boundary:** 37 route/index declarations in [`apps/web/app/routes.ts`](../apps/web/app/routes.ts) — loaders/actions, no separate API.
- **SQL integrity surface** (14 migrations in `db/migrations/*.sql`): 18 tables, 21 RLS policies, 7 triggers, 16 functions. Integrity triggers: bank_transaction_append_only, invoice_immutable, invoice_line_immutable, posting_immutable, posting_period_lock, voucher_immutable, voucher_period_lock.
<!-- /AUTOGEN:arch-graph -->

