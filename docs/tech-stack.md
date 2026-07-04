# Tech Stack — CURRENT

> Status: **Current** (2026-06-23; revisable via an ADR). Supersedes the stack discussion in
> `saldo-build-specification.md` §6. Changes require an ADR in `docs/decisions/`.
>
> Three principles drive every choice: **(1) open-source & self-hostable** — so no vendor
> controls a 10-year system of record; **(2) local-LLM capable** — the smart layer must run
> fully on-prem in the final product; **(3) agent-legible** — the repo and its surfaces are
> optimized for Claude Code / agentic engineering, which favors semantic-HTML-first UI, in-repo
> components, deterministic guardrails, and a documented harness.

## Decision table

> **Chosen ≠ installed.** This table fixes the *choice*; the package manifests are the truth for what
> is installed **today**. Rows marked **(deferred)** are decided but not yet dependencies — each is
> installed in the same PR as the first feature that consumes it (keeps the tree knip-clean). As of
> 2026-07-04: React Hook Form + resolvers and TanStack Table **are installed**; Motion, Vaul,
> vite-plugin-pwa, Dexie, Capacitor, Recharts, visx, graphile-worker and Langfuse are **deferred**.

| Concern | Current choice | OSS | Notes / rationale |
|---|---|---|---|
| Language | **TypeScript (strict)**, Node.js 22 LTS | ✅ | `noUncheckedIndexedAccess`, no `any`. Load-bearing for money/VAT correctness. |
| Monorepo | **pnpm workspaces + Turborepo** | ✅ | One app + one pure domain package; the only hard boundary is pure-vs-impure. |
| Web framework | **React Router 7 (framework mode)** on Vite | ✅ | HTML-first loaders/actions/`<Form>`; server-authoritative; progressive enhancement. Reinforced by the "HTML effectiveness" argument. |
| UI components | **shadcn/ui** (Radix + Tailwind v4) | ✅ | Own-every-pixel — required for the native-feel PWA, and more agent-legible (component code in-repo). Replaces Mantine. |
| Forms | **React Hook Form + Zod resolver** | ✅ | Reuses the Zod contracts; huge agent corpus. |
| Tables | **TanStack Table** (headless) + shadcn styling | ✅ | Ledgers, reskontro, drill-downs. Tabular-nums everywhere figures appear. |
| Native PWA | **Motion** (gestures/springs), **Vaul** (sheets), **View Transitions API**, **vite-plugin-pwa** (Workbox) *(deferred)* | ✅ | Native feel layered on a semantic-HTML substrate, never replacing it. |
| Offline | **Dexie** (IndexedDB) outbox *(deferred)* | ✅ | Receipt-capture queues offline; postings stay online (ADR 0001). |
| Native escape hatch | **Capacitor** (held in reserve; not installed) | ✅ | Same codebase → App Store/Play with native camera/haptics/biometric if iOS PWA limits bite. |
| Data viz | **Recharts** (workhorse) + **visx** (bespoke) *(deferred)* | ✅ | Standard business charts + native-feel mobile sparklines. Keep one chart family. |
| Database | **PostgreSQL** — hosted on **Neon** (EU; ADR 0013), self-host fallback | ✅ | Relational integrity, triggers, constraints, RLS — the entire architecture. |
| Queries | **Drizzle ORM** | ✅ | Typed queries. **Schema source of truth = raw SQL migrations**; Drizzle schema generated via `drizzle-kit introspect` → no drift. |
| Migrations | **dbmate** (SQL-first) | ✅ | Plain `.sql` up/down. All integrity (triggers/RLS/constraints/invoice-counter) lives here, not the ORM. |
| Object storage | **Cloudflare R2** (EU jurisdiction; S3-compatible) | 🟡 | Documents (receipts/PDF/SAF-T), 5-year retention, EU-resident (ADR 0015). S3 API keeps it portable; **MinIO/Garage** is the OSS self-host fallback. |
| CI ephemeral DB | **Testcontainers** | ✅ | Real Postgres per run — tests the actual triggers. Replaces Neon branching (ADR 0014). |
| Money | branded integer **`Øre`** + custom ESLint rule | ✅ | No `decimal.js`. Integer-only; round half-away-from-zero at boundaries only. |
| Validation | **Zod** at every boundary | ✅ | Single source of truth for shapes; infer types from schemas. |
| Auth | **`openid-client` v6 + `@oslojs/*` + Postgres sessions** | ✅ | BankID/Vipps via **Criipto/Signicat** broker (the one unavoidable non-OSS dep). `oslo` umbrella deprecated → `@oslojs/crypto`/`encoding`. ID-porten scoped to Altinn only. |
| Tenancy | app-layer org filter **+ Postgres RLS** via `SET LOCAL app.current_org` | ✅ | Defense-in-depth; GUC pattern (not `auth.uid()`). |
| Background jobs | **graphile-worker** *(deferred — ADR 0010 is Proposed; no job runner is wired yet)* | ✅ | Runs on the app's Postgres; payloads never leave the DB. Replaces Inngest. |
| Email | **nodemailer** (provider-agnostic SMTP) | ✅ | EU provider behind a swappable interface. |
| PDF | **`@react-pdf/renderer`** | ✅ | Invoice PDFs in React/TS, no headless browser. |
| E-invoice | typed **UBL builder** + **VEFA validator** | ✅ | EHF/PEPPOL BIS 3.0; validate locally. |
| LLM / OCR | **OpenAI-compatible abstraction** → **Ollama/vLLM** serving **Qwen2.5-VL** | ✅ | Local-first; hosted is just another base URL. OCR fallback: **Surya/docTR**. **Propose-only.** |
| LLM observability | **Langfuse** (self-hosted) *(deferred)* | ✅ | Traces, evals, cost. |
| App observability | **OpenTelemetry** + **SigNoz** (or Grafana) ; **GlitchTip** for errors; **pino** logs | ✅ | Fully self-hostable, vendor-independent. |
| Testing | **Vitest**, **fast-check**, **Testing Library**, **Playwright**, **Testcontainers** | ✅ | Property tests on accounting invariants are the core safety net. |
| Lint/format | **typescript-eslint + Prettier** (+ custom money rule) | ✅ | ESLint kept over Biome specifically for the typed custom rule. |
| Deploy | **Persistent Node on an EU PaaS** (Railway/Render/Fly EU) + **Cloudflare** edge/CDN + **R2** | 🟡 | Standard-Node host for OAuth/Altinn/PDF/SAF-T/in-process jobs (ADR 0015). Self-host **Docker + Kamal** on Hetzner EU retained as the OSS sovereignty fallback. |
| SAF-T reference | committed copy of `Skatteetaten/saf-t` | ✅ | Codes/accounts/XSD never hardcoded from memory. |

## The one knowingly-accepted risk
**React Router 7 framework mode** has a thinner training corpus than Next.js. This is accepted
because its HTML-first loader/action model produces fewer agent-error modes than RSC, and is
mitigated with **Context7 MCP pinned to the exact version**. See ADR 0005.

## Agentic-repo layer (third constraint)
The harness model — single-agent default, the **CLAUDE.md → hooks → skills → plugins → MCP** build
order, hooks carrying all determinism, progressive-disclosure skills, the Node/`tsx` skill-script
deviation, and the `html-report` artifact skill — is owned by `docs/house-standards.md` and configured
in `.claude/`. It is not restated here.
