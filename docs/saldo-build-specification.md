# Build Specification — Saldo
### Accounting & invoicing system for small Norwegian enkeltpersonforetak

> **Working name:** Saldo *(placeholder — rename freely)*.
> **Audience of this document:** Claude Code (and the human steering it). This is the canonical build bible. It is the source of truth for *what* to build, *how* it must behave, *what stack* to use, and *how the repository and agents are configured*. When this document and an offhand instruction conflict, this document wins until it is explicitly revised.

> **Revision note (tech-stack review):** This copy incorporates corrections from a stack/spec review. Changed since the original draft: invoice numbering uses a serialized counter-row, not a Postgres `SEQUENCE` (§4.2/§5.2/§5.4); Neon is now the default database (§6.3/§18); background jobs default to an in-Postgres queue for data-residency coherence (§6.5/§17); OCR defaults to vision-model-direct (§6.6); a transactional email provider is added (§6.5/§9); KID/OrgNr validation is made explicit (§4.2/§13); and the RR7 rationale is reworded honestly (§6.1). Architecture and domain model are unchanged — they were already correct.

---

## 0. How to use this document

This file is written to be split into the repository once scaffolding begins:

- **§1–§3** → `docs/overview.md` and `docs/glossary.md`
- **§4–§5** (domain rules + data model) → `docs/domain-model.md` — the most important file in the repo.
- **§6–§7** (stack + architecture) → `docs/architecture.md`
- **§8–§10** (features, integrations, smart layer) → `docs/` (one file each).
- **§11–§13** (security, testing, conventions) → `docs/` + path-scoped rules.
- **§14–§15** (repo + `.claude/`) → the actual repo root and `.claude/` directory.
- **§16–§18** (sequencing, decisions, open questions) → `docs/decisions/` (ADRs) and the issue tracker.

Keep `CLAUDE.md` itself **lean** (see §15.1). Detail lives in `docs/` and in path-scoped rules, loaded on demand. Do not inline this whole document into `CLAUDE.md`.

---

## 1. Product overview

Saldo is a **compliance-grade financial system of record** for Norwegian sole proprietorships (*enkeltpersonforetak*, "ENK") with **under 500,000 NOK in annual revenue**. It is a deliberately simple alternative to Fiken/Conta, tailored to one well-defined life stage of a business.

The defining legal fact: a sub-500k ENK is **bokføringspliktig** (bookkeeping obligation) but **not regnskapspliktig** (no statutory annual accounts). That single fact removes the heaviest features other systems carry (årsregnskap, revisor, payroll) and shapes the entire scope.

The product's value is **server-side correctness** — an immutable ledger, correct VAT, a complete audit trail, and trustworthy integrations — wrapped in a clean forms-and-reports UI. It is not an interactive/graphical app; it is data entry, ledgers, reports, workflows, and document capture.

**Primary user:** a solo operator (freelancer, consultant, tradesperson) who keeps their own books and files their own taxes, often from a phone for receipt capture and a desktop for everything else.

---

## 2. Scope

### In scope
Onboarding & company setup · contacts (customers/suppliers) · products/services · sales invoicing (quotes → invoices → credit notes) · purchases & expenses with receipt capture · double-entry bookkeeping · banking & reconciliation · VAT (MVA) handling and reporting · financial reports · year-end figures for the tax return · SAF-T export · the "smart accounting" assistance layer · the platform shell (PWA, auth, accountant access).

The full feature breakdown is **§8**.

### Explicitly out of scope (this is what keeps Saldo simple — do not build these)
- **Payroll, a-melding, employees.** An ENK owner is not an employee.
- **Årsregnskap to Brønnøysund, noter, kontantstrømoppstilling, revisor flows.** Not required below the regnskapsplikt thresholds (assets > 20M NOK or > 20 årsverk).
- **Inventory / warehouse management.**
- **Multi-company, consolidation, intercompany.**
- **Full project accounting, dimensions/departments** beyond a single optional project tag.
- **Budgeting/forecasting** beyond a simple liquidity view.
- **Foreign VAT / VAT OSS / multi-jurisdiction.**
- **Delt virksomhet input-VAT apportionment** — flag as unsupported; advise the user to engage an accountant.
- **Full in-app debt collection or kassasystem (cash-register) certification.**

The boundary rule: every excluded item exists to serve a business that has crossed a size/complexity/legal threshold the target user has not. When a user needs one, the honest answer is "you've outgrown Saldo" — and a clean SAF-T export makes that exit painless.

---

## 3. Glossary (Norwegian accounting terms)

Claude Code must treat these as precise domain terms, not approximate translations.

| Term | Meaning |
|---|---|
| **Enkeltpersonforetak (ENK)** | Sole proprietorship; the target legal form. Owner is personally liable; not an employee of the business. |
| **Bokføringsplikt** | Statutory bookkeeping obligation (kicks in above 50,000 NOK turnover). |
| **Regnskapsplikt** | Statutory annual-accounts obligation (ENK only above 20M assets / 20 årsverk). **Out of scope.** |
| **MVA / merverdiavgift** | Value-added tax (VAT). |
| **Merverdiavgiftsregisteret** | The VAT register. Registration is mandatory above 50,000 NOK taxable turnover (rolling 12 months). |
| **Utgående MVA** | Output VAT (charged on sales). |
| **Inngående MVA** | Input VAT (paid on purchases; deductible only when registered). |
| **Bilag** | A voucher — the documented accounting transaction. |
| **Motbilag / korrigeringsbilag** | A reversing/correction voucher. The *only* way to fix a posted bilag. |
| **Kreditnota** | Credit note. The *only* way to correct an issued invoice. |
| **Faktura** | Invoice. |
| **Kontoplan** | Chart of accounts (Norwegian standard is NS 4102-based). |
| **Hovedbok** | General ledger. |
| **Reskontro** | Subsidiary ledgers for customers (kundereskontro) and suppliers (leverandørreskontro); the basis of AR/AP aging. |
| **Resultatregnskap** | Profit & loss statement. |
| **Balanse** | Balance sheet. |
| **Næringsspesifikasjon** | The business-income specification filed with the tax return (replaced "næringsoppgave"). |
| **Skattemelding** | Tax return. Due **31 May**. |
| **Saldoavskrivning** | Declining-balance depreciation, by standard saldo groups. |
| **Periodisering** | Accrual (matching income/cost to the correct period). |
| **Privatuttak / privat innskudd** | Owner's drawings / owner's capital injection. |
| **KID** | Customer Identification number on Norwegian payments; enables automatic reconciliation. |
| **Purring** | Payment reminder. |
| **Forsinkelsesrenter** | Statutory late-payment interest. |
| **Unntatt** | "Exempt" = *outside* the VAT Act (e.g. health, teaching, financial services). No output VAT, no input deduction. |
| **Fritatt / 0-sats** | Zero-rated (e.g. exports, books). Registered, 0% output, **input VAT IS deductible.** |
| **Snudd avregning** | Reverse charge (e.g. buying services from abroad); the buyer accounts for both sides of the VAT. |
| **Kontantsalg** | Cash sale. |
| **Årsoppgjør** | Year-end close. |
| **Altinn** | The government digital-services platform; tax submissions are made through Altinn 3. |
| **ID-porten** | National user-authentication gateway (used for the Altinn filing flow). |
| **BankID / Vipps Login** | The eID methods Norwegian users expect for login. |
| **Enhetsregisteret** | Central Coordinating Register of Legal Entities (Brønnøysund); open API for company lookup + VAT-register status. |
| **SAF-T** | Standard Audit File for Tax; the mandatory export format for accounting data. |
| **EHF** | Norwegian e-invoice format (= PEPPOL BIS Billing 3.0). |
| **Skatteetaten** | The Norwegian Tax Administration. |
| **Brønnøysundregistrene** | The Brønnøysund Register Centre. |

---

## 4. Domain model & business rules

This section is the correctness contract. Most defects in accounting software are violations of the rules below.

### 4.1 The three authority layers
Authority lives in three layers; **the client is never one of them.**

1. **Postgres** — hard integrity: append-only ledger, balance constraints, immutability triggers, invoice-number allocation, tenant isolation. *Last line of defense.*
2. **Domain core** (a pure TypeScript package, no I/O) — money math, VAT logic, posting derivation, the rules engine. *The brain.* Runs **both** server-side (in route actions/loaders) and in the browser (for instant form feedback) — one implementation, zero drift.
3. **Server** (the app's route actions) — orchestrates: validates via the domain core → persists → calls integrations/jobs → holds secrets.

The client renders, captures input, and re-runs the domain core for optimistic UX. It is authoritative for nothing.

### 4.2 Hard invariants (NEVER violate)
1. **Money is integer øre.** Type `Øre = number & { readonly __brand: 'øre' }`. Never `number`, never floating-point arithmetic on money. Construct via `øre()`; combine via helpers (`addØre`, `subØre`, `mulRate`). Norwegian øre rounding (**round half away from zero**) only at presentation/settlement boundaries, never mid-calculation.
2. **The ledger is append-only.** A posted bilag is immutable. Never UPDATE or DELETE a posted voucher or its postings. Corrections happen via a **motbilag** (reversing voucher).
3. **Issued invoices are immutable.** Once issued, an invoice is frozen. Corrections happen via a **kreditnota**. Invoice numbers are **gapless, monotonic, never reused, never edited**, allocated from a **per-org counter row inside the issuing transaction** — *not* a Postgres `SEQUENCE`. A plain `SEQUENCE` is explicitly rejected here: `nextval()` is non-transactional and does **not** roll back, so any aborted issuing transaction would burn a number and leave a gap, violating gaplessness. Allocate with `UPDATE invoice_counter SET next = next + 1 WHERE organization_id = $1 RETURNING next;` — the row lock serializes issuance per org and the number only persists if the transaction commits (§5.4).
4. **Every voucher balances.** For every voucher, Σ debit = Σ credit (in øre). Enforced by a database constraint trigger, not only in app code.
5. **Posting is server-authoritative AND enforced in SQL.** Client validation is UX only.
6. **MVA status drives all posting.** Every organization (and, where relevant, each line of activity) is in exactly one state: `under_threshold | unntatt | registered_standard | registered_zero_rated`. This state forks invoice rendering, input-VAT treatment, and reporting throughout.
7. **AI never writes to the ledger.** The smart layer proposes; the rules engine validates; a human confirms. No exceptions.
8. **Norwegian identifiers are validated, branded types.** `OrgNr` (mod11 control digit) and `Kid` (mod10 or mod11, per issuer config) are validated at construction in `@saldo/domain`, never passed around as raw strings.

### 4.3 MVA (VAT) logic
**Registration threshold:** mandatory once taxable turnover exceeds **50,000 NOK over a rolling 12-month window** (140,000 NOK for charitable/non-profit bodies). The app tracks this continuously and warns as the user approaches it (§8.8).

**Output VAT (on sales):**
- Only charged when `registered_standard` or `registered_zero_rated`.
- When `under_threshold` or `unntatt`: invoices must **not** show MVA or the "MVA" org-number suffix. This is a hard validation block, not a default.
- Rates: 25% standard, 15% (foodstuffs), 12% (passenger transport, accommodation, cinema), 0% (zero-rated), plus exempt/outside-scope.

**Input VAT (on purchases) — the fork:**
- `registered_standard` / `registered_zero_rated` → split input VAT to the input-VAT account (deductible).
- `under_threshold` / `unntatt` → **no deduction**; book the gross amount to the cost account.
- The *same* purchase posts differently depending solely on the org's MVA status. Implement this as a **single posting function that branches on status**, not scattered conditionals.

**Non-deductible cases** (even when registered): representasjon (entertainment), restricted vehicle costs, and the private-use portion of mixed expenses. Encode these as explicit rules.

**Reverse charge / snudd avregning** (importing services from abroad — common even for tiny ENKs buying foreign SaaS): the buyer accounts for **both** output and input VAT. Net cash effect is often zero, but **both sides must appear on the MVA-melding**. Post both legs.

**Source of truth for codes:** Use the official **SAF-T standard VAT codes and standard chart of accounts** from `github.com/Skatteetaten/saf-t`. **Do not hardcode VAT-code numbers or account numbers in business logic from memory** — load them from a versioned, committed copy of the official code lists, and map postings to those codes. This keeps the app correct as codes evolve and makes SAF-T export and MVA-melding generation trivially consistent.

### 4.4 Bookkeeping
- **Double-entry** on the standard kontoplan. Every economic event becomes a balanced voucher.
- **Manual journal entries** for adjustments; corrections via motbilag only.
- **Period locking** tied to MVA terms and year-end: no postings into a locked period.
- **Accruals (periodisering)** — light, for AR/AP at period boundaries.
- **Saldoavskrivning** — declining-balance depreciation by standard saldo groups; simplified, no full asset register.
- **Owner transactions** — privatuttak / privat innskudd as distinct, clearly-posted events.
- **Year-end close (årsoppgjør)** — lock the year, carry balances forward, produce the figures for the tax return.

### 4.5 Documents, retention, SAF-T
- **Every voucher links to its documentation** (bilag): a receipt image/PDF, supplier invoice, or generated sales invoice.
- **Retention: 5 years**, securely stored.
- **SAF-T Financial export is mandatory** because the books are electronic (the small-business exemption is void for electronic bookkeeping). It must produce an XSD-valid SAF-T file **on demand** (for a tax audit / bokettersyn), not on a schedule. Validate output against the official XSD in CI.

### 4.6 Filing obligations
- **MVA-melding (VAT return):** generated from postings mapped to SAF-T VAT codes → XML per Skatteetaten's schema → **validated against Skatteetaten's validation API** → submitted via **Altinn 3 (ID-porten)** *or* exported for manual filing in the "Min mva" portal. Default cadence is 6 bimonthly terms; under 1M NOK the user may use an annual term (årstermin).
- **Skattemelding + næringsspesifikasjon:** due **31 May**. Map resultat + balanse to the næringsspesifikasjon figures. **Initial product: export the figures** for the user to file in Skatteetaten's pre-filled return; the full submission API is approval-gated (see §9) and deferred.

---

## 5. Data model

A sketch sufficient to drive the schema and migrations. Refine in `docs/domain-model.md`. All monetary columns are **`bigint` øre**. Every business table carries `organization_id` and is tenant-scoped (§11).

### 5.1 Core entities
- **organization** — the ENK. `org_nr`, `name`, `mva_status`, `mva_term_cadence`, fiscal settings, branding, default bank account, address.
- **app_user** — owner; plus optional **accountant** linkage with limited role.
- **membership** — `(app_user, organization, role)` where role ∈ `owner | accountant`.
- **contact** — customers and suppliers (a `kind` flag, can be both). `org_nr` (nullable for private), `mva_status` (looked up), `ehf_capable` (ELMA lookup), default payment terms, default account, currency, language.
- **item** — product/service catalog. Default income/expense account, default VAT code, unit, price, goods/service flag.
- **fiscal_year** / **period** — with `locked_at`.
- **account** — chart-of-accounts entry (from the SAF-T standard kontoplan), `number`, `name`, `type`.
- **vat_code** — SAF-T VAT code, rate, direction, reporting mapping.
- **invoice_counter** — `(organization_id, next)`; the serialized source of gapless invoice/credit-note numbers (§5.4).

### 5.2 Sales
- **quote** — draft offer; converts to invoice.
- **invoice** — header; **immutable once `status = issued`**. `number` allocated from the per-org **`invoice_counter` row** inside the issuing transaction (gapless — see §5.4). `status ∈ draft | issued | sent | paid | overdue | credited`. `kid`. Lines reference `item`/account/VAT code with net, VAT, gross in øre.
- **invoice_line**.
- **credit_note** — references the invoice it corrects; immutable once issued; number allocated from the same per-org counter mechanism.

### 5.3 Purchases
- **purchase** — supplier invoice / expense. Links to one or more **document** rows (receipt/PDF). Status for payment.
- **purchase_line**.

### 5.4 The ledger (integrity-critical)
- **voucher (bilag)** — the accounting document. `type` (sales, purchase, manual, bank, reversal), `posted_at`, `period_id`, optional `reverses_voucher_id`. **Immutable once posted.**
- **posting (postering)** — a single debit or credit line of a voucher: `account_id`, `vat_code_id` (nullable), `debit_øre`, `credit_øre`. **Immutable.**
- **Invariants enforced in SQL:**
  - A **constraint trigger** verifies Σ debit = Σ credit per voucher at commit.
  - A **trigger blocks UPDATE/DELETE** on `voucher` and `posting` once `posted_at` is set.
  - A **trigger/`SET LOCAL`** blocks any posting whose `period` is locked.
  - Invoice/credit-note numbering uses a **per-organization counter row** (`invoice_counter`), incremented with a row-locking `UPDATE … RETURNING` inside the issuing transaction. This guarantees **gapless** numbering because the allocation rolls back with the transaction. **Do not use a Postgres `SEQUENCE`** — sequences are non-transactional and leave gaps on rollback, which breaks the gaplessness invariant (§4.2). The row lock serializes concurrent issuance for the same org, which is acceptable at this scale.

### 5.5 Banking & reconciliation
- **bank_account**.
- **bank_transaction** — imported (PSD2/camt.054/CSV); `kid` (nullable), amount, date, raw payload, `matched_voucher_id` (nullable).
- **reconciliation** — running matched/unmatched state per account/period.

### 5.6 VAT, documents, audit
- **vat_return** — per term; generated figures, XML, validation result, submission state.
- **document** — stored file (receipt, invoice PDF, SAF-T export); behind access control; 5-year retention.
- **audit_log** — append-only record of who/what/when across all mutations. Never updated or deleted.

---

## 6. Tech stack

Chosen for *this* system — a forms/mutations/server-authoritative financial app — and for **agentic build efficiency**. Not inherited from any other project.

### 6.1 Application framework
- **React Router 7 (framework mode)** — the merged Remix. Its loader/action model is purpose-built for forms, server-authoritative mutations, and co-located data loading with progressive enhancement. Routes via `routes.ts` config; typed loaders/actions; native `<Form>`.
- **Why not Next.js:** its RSC server/client-component boundary is a recurring source of subtle errors for humans *and* agents → token churn. RR7's simpler model means fewer agent-error modes. **Honest trade-off:** Next.js has a *deeper* training corpus (which would, in isolation, favor agent reliability), but here the simpler mental model is worth more than corpus depth — and we offset RR7's thinner corpus by pinning version-correct docs through Context7 (§15.5). (Next.js remains the conservative fallback if ecosystem breadth ever outweighs this.)
- **Why not an SPA + tRPC + separate API:** unnecessary here. In a full-stack framework, loaders/actions *are* the typed client↔server boundary. Dropping the separate API is a real simplification.

### 6.2 Language & UI
- **TypeScript (strict)** — `noUncheckedIndexedAccess`, no `any`. Load-bearing for money/VAT correctness.
- **Mantine** as the component library — ships strong **data tables, form hooks, number inputs, and date pickers** out of the box, which is most of this app's surface, so we build less. (shadcn/ui is the alternative if owning every component matters more than batteries-included.)
- **Typography:** a font with **tabular (lining) numerals** is mandatory — accounting figures must align in columns. Use `font-variant-numeric: tabular-nums` with Inter / IBM Plex Sans or similar. This is a domain requirement, independent of branding.
- **Palette:** a fresh, restrained neutral with one trustworthy accent, plus **semantic colors for debit / credit / paid / overdue**. Not a mood-driven brand palette.

### 6.3 Data & persistence
- **PostgreSQL** — non-negotiable; relational integrity, constraints, triggers are exactly what a ledger needs.
- **Neon** (default) — Postgres in an **EU region**, chosen specifically for **database branching**: ephemeral per-PR databases pair beautifully with agentic CI, which this build leans on heavily. Pair Neon with an **EU-region S3-compatible object store** (e.g. Cloudflare R2 EU, Scaleway, AWS S3 eu-*) for `document` storage. **Supabase** is the named alternative — but note that this design does **not** use Supabase Auth (identity is BankID via Criipto/Signicat, §6.4) and uses RLS via a GUC rather than `auth.uid()`, so most of Supabase's bundled value would go unused; Neon's branching is the deciding factor. Either way, see the §18 open decision.
- **Drizzle ORM** for application queries + inferred types (TS-native, coexists with raw SQL).
- **Raw SQL migrations** for the hard integrity — triggers, constraints, RLS, the invoice-counter mechanism. **Ledger integrity lives in SQL, not the ORM.**
- **Money:** branded integer-øre type (§4.2). `decimal.js` *optional*, for VAT-rate multiplication only — integer-only VAT math (`net_øre × rate`, rounded once via the øre helper) is sufficient and is the simpler default; keep `decimal.js` only if a reviewer prefers its explicitness. Amounts always stay integer øre.
- **Validation:** **Zod** at every boundary (form input, action input, integration payloads). Schemas are the single source of truth for shapes, colocated with the domain/contracts.

### 6.4 Authentication & tenancy
- **Production identity:** **BankID / Vipps Login**, brokered via **Criipto or Signicat** (Norwegian eID providers) over OIDC. Implement the OIDC flow in RR7 route actions (e.g. `remix-auth` + an OIDC strategy / `openid-client`), establish a server-side **session cookie**, and store users in Postgres. Email/password may be used only for early development/testing.
- **ID-porten** is a **separate** integration, scoped specifically to the **Altinn tax-filing authorization** flow — not the app login.
- **Tenancy:** enforced **primarily at the app layer** — every Drizzle query is filtered by `organization_id` from the authenticated session. **Defense-in-depth:** Postgres **RLS** policies referencing a per-transaction GUC (`SET LOCAL app.current_org = …`) set at request start. (Note: because we are not using Supabase Auth JWTs as the identity layer, `auth.uid()`-based RLS does **not** apply; use the GUC pattern instead.)

### 6.5 Background jobs & integrations runtime
- **Default: an in-Postgres durable queue** — **`pg-boss`** or **`graphile-worker`**, running inside the persistent Fly.io Node process (§6.8). This keeps recurring-invoice generation, reminder/purring cadences, the OCR→propose pipeline, the 50k-threshold watcher, and MVA-term reminders **inside our own EU-resident Postgres** — coherent with the §11 data-residency stance and one fewer external vendor. A hosted workflow engine (**Inngest** / **Trigger.dev**) is an option *only if* EU-region processing of payloads is confirmed; their DX is nice but not load-bearing here, and receipt/invoice payloads passing through a US SaaS is a residency question we avoid by default.
- **Inbound webhooks** (bank/PSD2, Vipps, PEPPOL) → thin RR7 routes (or a small serverless function) → enqueue jobs.
- **Transactional email** (invoice delivery, purring/reminders): an **EU-compatible provider** — e.g. **Postmark EU**, **AWS SES (eu-*)**, or **Scaleway TEM**. Required for §8.4; data-residency-checked like every other integration.
- `pg_cron` (or the queue's own scheduler) only for trivial periodic pokes.

### 6.6 AI / smart-accounting layer
- **OCR / extraction — vision-model-direct by default.** Feed the receipt/invoice image straight to a vision-capable model; modern vision LLMs outperform a Tesseract/PaddleOCR pre-processing step on real-world receipts and are simpler. Classical OCR (Tesseract / PaddleOCR) is a **cost-driven fallback only**.
- **Extraction model — a genuine data-sovereignty decision** (see §11): hosted **Anthropic API** (quality/reliability) **vs** self-hosted **Qwen vision** (data never leaves the jurisdiction). Either way: **propose-only**, every output validated by the rules engine before a human commits.
- **Langfuse** for traces, evals, and cost tracking on the extraction layer.

### 6.7 Documents
- **`@react-pdf/renderer`** for invoice PDFs — stays in React/TS, no headless browser. Generate from the same invoice data that produces EHF XML.
- **EHF/PEPPOL XML** via a typed UBL builder; validate with the **VEFA validator** (`anskaffelser/vefa-validator`).

### 6.8 Quality, observability, ops
- **Testing:** **Vitest** (unit), **fast-check** (property-based tests on accounting invariants), **Playwright** (e2e), **Testing Library** (components).
- **Lint/format:** `typescript-eslint` + Prettier + a **custom ESLint rule banning `number`/float for money**.
- **Observability:** **Sentry** (errors, EU region), **pino** (structured logs), **Langfuse** (LLM).
- **CI:** GitHub Actions — typecheck → lint → test → build → migration check → **SAF-T XSD validation**. Per-PR ephemeral DB via Neon branching.
- **Deploy:** the RR7 app as a persistent Node server on **Fly.io** (EU region) — warm process for OAuth/Altinn flows, SAF-T/PDF generation, the in-Postgres job worker, and integration work. Neon for DB; an EU object store for documents.

### 6.9 Repo tooling
- **pnpm workspaces + Turborepo.** Lean monorepo: **one full-stack app** plus **one pure domain-core package** (the single hard internal boundary). `db`, `contracts`, `ui`, and `integrations` live inside the app as modules — fewer seams to reason about, while preserving the one boundary that matters (pure vs impure).

---

## 7. Architecture

```
Browser (RR7 client)
  │  renders forms/tables; re-runs @saldo/domain for instant feedback; authoritative for NOTHING
  ▼
RR7 server (loaders/actions on Fly.io)   ── session (BankID via Criipto/Signicat) ──┐
  │  validates via @saldo/domain → persists via Drizzle → enqueues jobs             │
  │                                                                                  │
  ├── @saldo/domain  (PURE TS: money, VAT, posting, rules engine — no I/O)           │
  │                                                                                  │
  ├── Drizzle ──► PostgreSQL (Neon, EU)                                              │
  │                 integrity in SQL: balance trigger, immutability trigger,         │
  │                 period-lock, per-org invoice-counter, RLS via SET LOCAL          │
  │                                                                                  │
  ├── Integrations: Enhetsregisteret · Skatteetaten (MVA validate/submit, SAF-T) ····┤
  │                 Altinn 3 / ID-porten · PEPPOL access point · GoCardless/camt.054 │
  │                 · Vipps · email (Postmark EU/SES) · OCR+LLM (Langfuse)           │
  │                                                                                  │
  └── In-Postgres jobs (pg-boss): recurring invoices, reminders, extraction, watchers┘
```

Key properties: the **domain core is pure and shared** (runs in actions and in the browser); **integrity is enforced in the database**; **the server is the single source of truth** (online-first — see §17); the **AI layer only proposes**.

---

## 8. Feature specification by module

(The complete target — not an MVP. Build order is §16.)

**8.1 Onboarding & company setup** — Enhetsregisteret org-number autofill (name, address, NACE, VAT-register status); MVA-status configuration (the four states + voluntary registration); fiscal/term settings; branding & payment details; **opening balances (inngående balanse)** for mid-year migration; BankID identity binding.

**8.2 Contacts** — customers & suppliers in one register; Enhetsregisteret autofill + per-contact MVA status; per-contact defaults (terms, account, VAT code, currency, language); **ELMA/PEPPOL capability lookup**; contact persons & multiple addresses.

**8.3 Products & services** — catalog with default account + VAT code + unit + price; goods/service classification; line/document discounts; reusable line templates.

**8.4 Sales & invoicing** — quotes → invoices (immutable, gapless numbering) → credit notes; per-line MVA across all rates with hard-block when not registered; lifecycle (draft→issued→sent→viewed→paid→overdue); PDF + email (EU provider, §6.5); **EHF/PEPPOL** send for B2B/B2G; **KID** per invoice; recurring/subscription invoices; reminders (purring), late interest (forsinkelsesrenter), structured inkasso hand-off (generate file/notice only); multi-currency & multi-language; simple cash-sale voucher (no kassasystem); light **time-tracking → invoice lines** (the one project concession).

**8.5 Purchases & expenses** — receipt capture (mobile photo / PDF / email-in) → OCR+LLM extraction → proposed voucher; supplier-invoice entry; the **input-VAT fork** by MVA status; encoded non-deductible rules; **reverse charge on foreign services**; recurring expenses; owner outlays (utlegg) & drawings (privatuttak); mileage/travel-deduction log (kjøregodtgjørelse/diett) as deductions, not payroll.

**8.6 Bookkeeping core** — double-entry on the SAF-T standard kontoplan; manual journals; corrections via motbilag; period locking; light accruals; saldoavskrivning; year-end close with balance carry-forward.

**8.7 Banking & reconciliation** — import via PSD2/AIS (GoCardless), camt.054 file, or CSV; auto-match KID → amount/date → manual; reconciliation workflow; multiple accounts.

**8.8 VAT (MVA)** — MVA report per term (or annual) on SAF-T VAT codes; validation against Skatteetaten's validation API; submission via Altinn 3 / ID-porten or export for portal; **rolling-12-month 50k threshold tracking** with proactive alerts and a guided "you've crossed it" transition.

**8.9 Reporting** — resultatregnskap; balanse; hovedbok/kontospesifikasjon drill-down; reskontro with AR/AP aging; MVA-spesifikasjon; liquidity & outstanding-invoice dashboard; period-over-period comparison.

**8.10 Year-end & tax** — næringsspesifikasjon figure generation; **beregnet personinntekt** basis; saldoavskrivning schedules; year-end checklist; export/handoff to Skatteetaten's pre-filled return (full API submission deferred).

**8.11 Compliance & data integrity** — **SAF-T Financial export**; immutable audit trail (sporbarhet); bokføringsforskrift conformance; **full data export** (SAF-T + raw) to prevent lock-in; backups & secure document storage.

**8.12 Smart-accounting layer** — see §10.

**8.13 Platform / cross-cutting** — PWA, mobile-first for capture; online-first sync; BankID/Vipps Login; **accountant access** (limited role); notifications; NO/EN localization; a real home dashboard.

---

## 9. Integrations

For each: purpose, auth, access status (start-now / onboarding-gated / self-build), and phase. (Full detail and primary-source links live in `docs/integrations/`.)

| Integration | Purpose | Auth | Status | Phase |
|---|---|---|---|---|
| **Enhetsregisteret** (Brønnøysund) | Org lookup, name/address, **VAT-register status** (`registrertIMvaregisteret`) | None (open, NLOD) | **Start now** — free, no key | 1 |
| **SAF-T reference data** (`Skatteetaten/saf-t`) | Standard kontoplan + VAT codes; SAF-T XSD | None | **Start now** (committed copy) | 1 |
| **Transactional email** (Postmark EU / AWS SES eu-* / Scaleway) | Invoice delivery, purring/reminders | API key | **Start now** (EU region) | 3 |
| **EHF/PEPPOL validation** (VEFA) | Validate generated EHF XML locally | None | **Start now** | 2 |
| **PEPPOL access point** (commercial: Storecove/Tickstar/etc.) | Send/receive EHF | API key + merchant agreement | Onboarding-gated; defer self-hosting | 4 |
| **Skatteetaten MVA-melding** (validate + submit) | VAT-return validation & submission via Altinn 3 | **ID-porten** OIDC; request scopes from Skatteetaten | Free but **onboarding-gated** | 3 |
| **Altinn 3 instance API** | The submission transport | Altinn token (exchanged from ID-porten); Altinn role/rights | Onboarding-gated | 3 |
| **Skatteetaten skattemelding + næringsspesifikasjon** | File the tax return | Approved end-user-system vendor access | **Heavy approval** — defer; export figures instead | later |
| **GoCardless Bank Account Data** (PSD2 AIS) | Bank transaction import | OAuth/AIS; free tier (≈50 connections/mo) | **Start now** (free tier) | 2 |
| **Bank files (camt.054)** | Reconciliation files | Bank agreement (user-side) | Parsing is self-build | 2 |
| **Vipps MobilePay** (ePayment/Recurring/Login) | Get paid by Vipps; Vipps Login | Merchant agreement + API keys | Onboarding-gated | 4 |
| **BankID via Criipto/Signicat** | App login (eID) | OIDC; provider account | Onboarding-gated (set up early) | 1 |
| **OCR + LLM extraction** | Receipt → structured proposal | API key or self-hosted | **Start now** (sovereignty choice, §11) | 2 |

**Cautions to bake in:** the Altinn 2→3 transition and the new systembruker/tilgangspakke model are in flux — confirm the current onboarding flow at build time; Skatteetaten supports inquiries from the *system supplier*, not the supplier's customers; GoCardless rate limits (as low as 4 calls/day/account) require caching/batching; the SAF-T standard-accounts list is copyright Regnskap Norge AS, licensed only for SAF-T mapping.

---

## 10. Smart-accounting layer

**Pattern: propose → validate → confirm.** A model/heuristic proposes; a deterministic rules engine validates against Norwegian bookkeeping rules; a human confirms. **The AI never writes to the ledger.** Build the deterministic layers first; the AI is the last enhancement and is only safe *because* the rules layer exists.

1. **Pattern learning (highest ROI, not AI).** Counterparty → account + VAT code, learned from the user's own history. ~80% of the "magic" with zero model risk.
2. **KID & bank matching (deterministic).** Match on KID first, then amount + date proximity. This is what makes reconciliation feel automatic.
3. **Rules engine (the compliance backbone, deterministic).** Encode the non-obvious rules: the input-VAT fork by MVA status; non-deductible cases (representasjon, vehicles, private use); valid account↔VAT-code combinations; reverse-charge dual posting. Lives in `@saldo/domain`, exhaustively tested.
4. **LLM extraction (where AI earns its place).** Vision extraction of structured fields from receipts/invoices (vendor, date, net, VAT, lines) and free-text → *proposed* account. Output flows into layer 3 for validation before a human commits.
5. **Lint/validation at posting time.** Debits = credits; period open; bilag attached; MVA reconciles. Block on hard errors; warn on soft ones.
6. **Anomaly flags & explanations.** Duplicate invoice/voucher, missing documentation, unusual amount vs history; plus plain-language explanations of each booking (the user does their own books — teach as you go).
7. **Deadline & threshold alerts.** MVA terms, skattemelding (31 May), the 50k threshold.

---

## 11. Security, compliance, data residency

- **Data residency:** all personal + financial data stays in the **EU/EEA**. Neon EU region; EU object store for documents; **background jobs run in-Postgres** (§6.5) so payloads don't transit a non-EU SaaS; transactional email via an EU provider; if using the hosted LLM, confirm EU residency/handling — otherwise route extraction to the **self-hosted Qwen** path. This is a first-class architectural decision, not an afterthought, given the data class.
- **Tenancy isolation:** app-layer org filtering on every query **plus** Postgres RLS via the `SET LOCAL app.current_org` GUC pattern (§6.4) as defense-in-depth.
- **Secrets:** never in the repo. `deny` reads of `.env*` and `secrets/**` in the Claude Code permission config (§15.4). OAuth client secrets (Criipto, Altinn, Vipps) live in the server environment only.
- **Audit trail:** append-only `audit_log`; immutable ledger and invoices (enforced in SQL).
- **Retention:** 5 years for vouchers and documentation.
- **GDPR:** data export + deletion paths (note that ledger immutability and statutory retention constrain deletion — document the lawful basis and retention exception).
- **Bokføringsforskrift conformance:** numbering, documentation, traceability, SAF-T availability.
- **Build with a hosted model, ship a sovereign extraction path** — these need not match, and that split is a coherent, defensible position.

---

## 12. Testing strategy

- **Domain core is exhaustively tested** — it is both the crown jewel and the agent's safety net. Every VAT scenario and posting rule is a test case.
- **Property-based tests (fast-check)** for accounting invariants: for all generated vouchers, Σ debit = Σ credit; posting is idempotent; immutability holds; the input-VAT fork is correct for every MVA status; reverse charge posts both legs; KID/OrgNr validators accept valid and reject invalid control digits.
- **Integration tests** against a real Postgres (Drizzle migrations applied) to verify the SQL triggers actually block mutation/imbalance/locked-period postings, and that the invoice-counter yields gapless numbers under concurrent issuance and across rolled-back transactions.
- **E2E (Playwright)** for the critical flows: issue invoice → it's immutable → credit it; capture receipt → propose → confirm → posted; reconcile a KID payment; generate + validate an MVA-melding; produce a valid SAF-T export.
- **SAF-T XSD validation in CI** on every change touching export logic.
- **Definition of done** for any ledger-touching change: types pass, lint passes, domain tests pass, SQL-integrity tests pass, and the relevant invariant is covered by a test.

---

## 13. Coding conventions

- **Strict TypeScript, no `any`.** Prefer branded types for domain primitives (`Øre`, `OrgNr`, `Kid`, `AccountNo`, `VatCode`).
- **Money:** only `Øre`; only via helpers; the custom lint rule blocks `number` arithmetic on money.
- **Identifiers:** `OrgNr` (mod11) and `Kid` (mod10/mod11) are validated at construction in `@saldo/domain` and never handled as raw strings.
- **Zod at all boundaries**, schemas colocated and shared; infer types from schemas.
- **The domain core is pure** — no imports of DB, network, framework, or `Date.now()`/`Math.random()` (inject those). This keeps it testable and runnable in the browser.
- **Integrity logic is SQL**, written as reviewed migrations; the ORM never owns ledger integrity.
- **New VAT/posting behavior requires a test in `@saldo/domain`.**
- **Semantic commits**; small, focused files; one concern per module.
- **No secrets in code**; no calls to external services from the domain core.

---

## 14. Repository structure

```
saldo/
├── CLAUDE.md                       # LEAN (~300–400 tokens). Loaded every session.
├── .claude/
│   ├── rules/                      # PATH-SCOPED — load only when editing matching files
│   │   ├── money.md                # paths: packages/domain/**, app/**/*money*
│   │   ├── ledger-integrity.md     # paths: db/migrations/**, app/db/**
│   │   ├── vat.md                  # paths: packages/domain/vat/**
│   │   ├── frontend.md             # paths: app/routes/**, app/components/**
│   │   └── integrations.md         # paths: app/integrations/**
│   ├── agents/                     # SUBAGENTS — isolated context, read-only by default
│   │   ├── explore.md
│   │   ├── vat-reviewer.md
│   │   ├── migration-author.md
│   │   ├── test-runner.md
│   │   └── integration-auditor.md
│   ├── skills/                     # ON-DEMAND workflows — body costs nothing until invoked
│   │   ├── new-feature/SKILL.md
│   │   ├── add-migration/SKILL.md
│   │   ├── new-vat-scenario/SKILL.md
│   │   └── saft-validate/SKILL.md
│   └── settings.json               # hooks + permissions
├── .mcp.json
├── docs/
│   ├── overview.md
│   ├── glossary.md
│   ├── domain-model.md             # §4–§5 expanded — the most important file
│   ├── architecture.md
│   ├── decisions/                  # ADRs (§17)
│   ├── integrations/               # one file per external system (§9)
│   └── runbook.md
├── turbo.json
├── pnpm-workspace.yaml
├── package.json
├── packages/
│   └── domain/                     # @saldo/domain — PURE core. The one hard boundary.
│       ├── money/                  # Øre type + helpers + rounding
│       ├── ids/                    # OrgNr / Kid validation (mod10/mod11)
│       ├── vat/                    # MVA states, code mapping, the fork, reverse charge
│       ├── posting/                # voucher derivation, balance rules
│       ├── rules/                  # the rules engine (validation)
│       └── *.test.ts               # exhaustive + fast-check property tests
├── app/                            # the React Router 7 application
│   ├── routes/                     # loaders/actions = the typed client↔server boundary
│   ├── components/                 # Mantine-based UI
│   ├── db/                         # Drizzle schema + queries (NOT integrity)
│   ├── contracts/                  # Zod schemas (shared with domain where useful)
│   ├── integrations/               # enhetsregisteret / skatteetaten / altinn / peppol / banking / email / ocr
│   ├── jobs/                       # in-Postgres queue (pg-boss) functions
│   ├── auth/                       # Criipto/Signicat OIDC + sessions
│   └── root.tsx, routes.ts
└── db/
    └── migrations/                 # SQL: tables, constraints, triggers, RLS, invoice-counter
```

---

## 15. Claude Code agentic setup

The mental model: **context is a budget, and each knowledge store draws on it at a different rate.** Match knowledge to access frequency. Always-needed → `CLAUDE.md` (tiny). Domain-specific → path-scoped rules (free unless editing that code). Procedural → skills (free until invoked). Verbose/exploratory → subagents (isolated context, return summaries). Keep the stable prefix stable to maximize **prompt-cache** hits. Route models by difficulty. Prefer deterministic tooling (hooks, tests, types) over agent reasoning.

### 15.1 `CLAUDE.md` (root — keep it this short)
```md
# Saldo — accounting/invoicing for small Norwegian enkeltpersonforetak

TypeScript monorepo (pnpm + Turborepo). React Router 7 (framework mode) + Mantine + PostgreSQL (Neon, EU).

## Architecture (full map: docs/architecture.md)
- packages/domain (@saldo/domain) — PURE accounting core (money, VAT, posting, rules, id validation).
  No I/O. Runs in route actions AND in the browser. The one hard boundary.
- app/db — Drizzle queries + types. Integrity (triggers/RLS/constraints/invoice-counter) lives in
  db/migrations/*.sql, NOT the ORM.
- app/contracts — Zod schemas. Single source of truth for shapes.
- app/routes — loaders/actions are the typed client↔server boundary (no separate API).

## Hard invariants (NEVER violate)
- Money is integer **øre**, type `Øre`. Never `number`, never float arithmetic.
- Ledger is **append-only**. Never UPDATE/DELETE a posted voucher or issued invoice —
  correct via motbilag / kreditnota.
- Invoice numbers are **gapless** — allocated from a per-org counter row in the issuing tx,
  NOT a Postgres SEQUENCE (sequences leave gaps on rollback).
- Posting is server-authoritative AND enforced in SQL. Client validation is UX only.
- MVA status {under_threshold | unntatt | registered_standard | registered_zero_rated} drives all posting.
- AI proposes; the rules engine validates; a human confirms. AI never writes to the ledger.
- VAT codes & accounts come from the committed SAF-T code lists — never hardcode them from memory.

## Commands
pnpm dev · pnpm test · pnpm typecheck · pnpm lint · pnpm db:migrate · pnpm saft:validate

## Conventions
Strict TS, no `any`. Zod at all boundaries. New VAT/posting behavior REQUIRES a test in packages/domain.
Domain detail lives in path-scoped rules under .claude/rules/ (they load when you touch the code).

## Compaction policy
Preserve: hard invariants, schema/migration decisions, list of modified files. Summarize exploration
briefly. Drop resolved tool output.
```

### 15.2 Example path-scoped rule — `.claude/rules/money.md`
```md
---
paths: ["packages/domain/**", "app/contracts/**"]
---
- Money is `Øre` (branded integer). Construct via `øre()`, never raw numbers.
- Use addØre / subØre / mulRate; never `+` or `*` on money directly.
- Norwegian øre rounding (half away from zero) ONLY at presentation/settlement boundaries.
- VAT amount = round(net × rate), computed once and stored; never re-derive divergently.
```

### 15.3 Example subagent — `.claude/agents/vat-reviewer.md` (read-only, Opus)
```md
---
name: vat-reviewer
description: Reviews VAT and posting logic against accounting invariants. Use proactively after changes to packages/domain.
tools: Read, Glob, Grep
model: opus
---
You are a Norwegian bookkeeping correctness reviewer. Check changed posting/VAT code for:
- debits = credits on every voucher
- correct input-VAT fork by MVA status (deductible ONLY when registered_standard/registered_zero_rated)
- non-deductible cases handled (representasjon, vehicle costs, private use)
- immutability respected (no mutation of posted rows)
- reverse charge on foreign-service purchases posts BOTH legs
- VAT codes/accounts referenced from the SAF-T code lists, not hardcoded
Return a concise list of violations as `file:line — invariant breached`. Do not edit.
```

Other subagents: **explore** (read-only codebase search, keeps results out of main context), **migration-author** (drafts SQL migrations; the parent applies them), **test-runner** (runs the suite, returns a short failure summary), **integration-auditor** (reviews external-API code). Keep all read-only; let the parent do edits (subagents can't surface permission prompts).

### 15.4 `.claude/settings.json` (hooks + permissions)
```json
{
  "permissions": {
    "allow": [
      "Bash(pnpm test:*)", "Bash(pnpm typecheck)", "Bash(pnpm lint:*)",
      "Bash(pnpm db:*)", "Bash(pnpm saft:*)", "Bash(git diff:*)", "Bash(git status)",
      "Read", "Glob", "Grep"
    ],
    "ask": ["Bash(git push:*)", "Bash(pnpm deploy:*)", "Bash(pnpm db:push:*)"],
    "deny": [
      "Read(./.env)", "Read(./.env.*)", "Read(./**/.env*)",
      "Read(./secrets/**)", "Bash(curl:*)"
    ]
  },
  "hooks": {
    "PreToolUse": [
      { "matcher": "Edit|Write", "hooks": [{ "type": "command", "command": "./scripts/block-generated.sh" }] }
    ],
    "PostToolUse": [
      { "matcher": "Edit|Write", "hooks": [{ "type": "command", "command": "./scripts/precommit-check.sh" }] }
    ]
  }
}
```
Hook scripts receive the tool-call payload as JSON on **stdin**. `block-generated.sh` vetoes edits to generated files (Drizzle output, build artifacts) by exiting non-zero. `precommit-check.sh` runs typecheck + affected tests and exits non-zero to feed failures back deterministically.

### 15.5 `.mcp.json`
```json
{
  "mcpServers": {
    "neon": {
      "command": "npx",
      "args": ["-y", "@neondatabase/mcp-server-neon", "start"]
    },
    "brreg": { "command": "npx", "args": ["-y", "brreg-mcp"] },
    "context7": { "url": "https://mcp.context7.com/mcp" }
  }
}
```
Keep MCP servers minimal (each one's tool definitions cost context). Neon MCP scoped to the **dev branch/project, never production**. Brreg for company lookups. Context7 for version-correct library docs so the agent stops guessing API surfaces (especially important given RR7's thinner training corpus, §6.1).

### 15.6 The feature workflow loop
1. **Plan mode (Opus)** — read-only; produce a reviewed plan before editing.
2. **explore subagent** — gather relevant code into its own context; return a summary.
3. **Implement in parent (Sonnet)** — the edits, with approval prompts.
4. **test-runner subagent** — run the suite; return a short failure summary.
5. **vat-reviewer / integration-auditor subagent** — check against invariants.
6. **Hooks gate** — typecheck/lint/test fire deterministically on edit.
7. **Commit** (checkpoint) — frequent commits let you reset the agent cheaply.

Model routing: **Opus** for the domain core, VAT edge cases, integrity migrations, concurrency; **Sonnet** for routine routes/CRUD; **Haiku** for classification/triage.

---

## 16. Build sequencing

Dependency-ordered. Each phase ends with the tests in §12 green for that surface.

**Phase 0 — Foundation.** Monorepo scaffold (pnpm + Turborepo); RR7 app skeleton + Mantine + tabular-numeral typography; `@saldo/domain` package with the **`Øre` type, helpers, rounding, and `OrgNr`/`Kid` validation** (fully tested first); Drizzle + the **core ledger schema and SQL integrity** (voucher/posting/account, balance trigger, immutability trigger, period lock, per-org invoice-counter, RLS GUC); BankID-via-Criipto OIDC + sessions; tenancy; Enhetsregisteret lookup; committed SAF-T code lists; CI (typecheck/lint/test/migration/SAF-T XSD, Neon per-PR branch); the `.claude/` config above.

**Phase 1 — Organization & contacts.** Onboarding (org setup, MVA-status, opening balances); contacts with autofill + MVA status; products/services.

**Phase 2 — The accounting engine.** The **rules engine** (input-VAT fork, non-deductible cases, reverse charge) in `@saldo/domain` with exhaustive + property tests; manual journals; period locking; the posting pipeline.

**Phase 3 — Sales.** Quotes → immutable invoices (gapless numbering) → credit notes; per-line MVA with the not-registered hard-block; PDF; KID; lifecycle; email delivery (EU provider); recurring invoices + reminders (in-Postgres jobs).

**Phase 4 — Purchases & capture.** Receipt capture → **vision-LLM extraction (propose-only)** → validation → confirm → posted; supplier invoices; expense rules; the sovereignty decision wired (§11).

**Phase 5 — Banking & reconciliation.** GoCardless AIS + camt.054 import; KID/amount/date auto-matching; reconciliation workflow.

**Phase 6 — VAT.** MVA-melding generation on SAF-T codes; Skatteetaten **validation API**; **50k threshold tracking** + transition; export for portal.

**Phase 7 — Reporting & year-end.** Resultat/balanse; hovedbok drill-down; reskontro aging; næringsspesifikasjon figures; beregnet personinntekt; saldoavskrivning; year-end close.

**Phase 8 — Compliance hardening.** Full **SAF-T export** (XSD-valid in CI); audit-trail completeness; data export; accountant access.

**Phase 9 — Onboarding-gated integrations.** Altinn 3 / ID-porten **MVA submission**; commercial **PEPPOL** access point for EHF send/receive; **Vipps** ePayment/Recurring/Login.

**Later (separate approval track).** Skattemelding/næringsspesifikasjon **submission API** (heavy vendor approval).

---

## 17. Key decisions (ADRs — record in `docs/decisions/`)

1. **Online-first**, not offline-first. A financial system of record needs the server as the single source of truth; offline-edited ledger postings create reconciliation problems. Receipt *capture* may queue offline (it's a photo upload); postings stay online.
2. **Propose-only AI.** The smart layer never writes to the ledger; the deterministic rules engine is the safety boundary that makes AI safe to use at all.
3. **Integer øre**, never floats, enforced by type + lint.
4. **Integrity in SQL**, not the ORM.
5. **React Router 7 over Next.js** — simpler server/client model, fewer agent-error modes. We accept RR7's thinner training corpus as a conscious trade against Next.js's RSC complexity, and offset it with Context7-pinned docs.
6. **No separate API / no tRPC** — loaders/actions are the boundary.
7. **Mantine over shadcn** for this data-dense surface — batteries-included tables/forms/inputs.
8. **BankID via Criipto/Signicat** as production identity; ID-porten scoped to Altinn filing.
9. **EU data residency**, with a self-hosted extraction path available for sovereignty.
10. **Lean monorepo** — one app + one pure domain package; the only hard boundary is pure-vs-impure.
11. **Defer the heavy filing/PEPPOL/Vipps onboarding** until paying users exist; ship manual-portal filing first.
12. **Gapless invoice numbering via a per-org counter row**, not a Postgres `SEQUENCE` — sequences are non-transactional and leave gaps on rollback, which violates the bokføringsforskrift expectation of consecutive numbering.
13. **Neon as default database** for per-PR branching (agentic CI); Supabase Auth's value is unused because identity is BankID-over-OIDC, so its bundling no longer tips the choice.
14. **Background jobs run in-Postgres** (pg-boss/graphile-worker) by default rather than a hosted US workflow SaaS, keeping payloads EU-resident and removing a vendor; a hosted engine is allowed only if EU processing is confirmed.

---

## 18. Open decisions for the human

These need a call before or during the relevant phase — flag them rather than guessing:

- **Neon vs Supabase.** Default is now **Neon** (per-PR database branching for agentic CI; Supabase Auth would be unused since identity is BankID-over-OIDC). Choose Supabase instead only if you specifically want its bundled Storage access-control over wiring a separate EU object store. Decide before Phase 0 hardens.
- **In-Postgres jobs vs hosted engine.** Default is an in-Postgres queue (pg-boss/graphile-worker) on the Fly.io process, for EU-residency coherence. Choose Inngest/Trigger.dev only if their EU-region payload processing is confirmed and the orchestration DX is worth the extra vendor.
- **Hosted LLM vs self-hosted Qwen** for extraction (§11) — the data-residency call. Decide before Phase 4.
- **Persistent server (Fly.io) vs fully-inside-one-platform.** Default is Fly.io (warm process for OAuth/SAF-T/PDF/the job worker). Going serverless-only trades cold-start latency and job-orchestration ergonomics for one-platform simplicity. This changes `app/jobs` and the integrations runtime — decide before Phase 0 hardens.
- **Transactional email provider** (Postmark EU / AWS SES eu-* / Scaleway TEM) — pick before Phase 3; verify EU region and deliverability.
- **PEPPOL access-point provider** (Storecove / Tickstar / other) — pick before Phase 9; verify current pricing.
- **eID broker** (Criipto vs Signicat) — pick before Phase 0; both do BankID/Vipps Login over OIDC.
- **Working name** — "Saldo" is a placeholder.
- **Altinn onboarding model** — per-customer ID-porten vs supplier-managed; confirm the current systembruker/tilgangspakke flow with Skatteetaten before Phase 9, since it's mid-transition.
