# Architecture

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
