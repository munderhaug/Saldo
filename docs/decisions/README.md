# Architecture Decision Records

One file per significant, hard-to-reverse decision. Format: `docs/decisions/adr-template.md`.
Changing a current stack choice (`docs/tech-stack.md`) requires a new ADR superseding the old one.

| # | Decision | Status |
|---|---|---|
| 0001 | Online-first, not offline-first | Accepted |
| 0002 | Propose-only AI; rules engine is the safety boundary | Accepted |
| 0003 | Integrity in SQL, not the ORM | Accepted |
| 0004 | Integer øre, never floats | Accepted |
| 0005 | React Router 7 over Next.js | Accepted |
| 0006 | shadcn/ui over Mantine (native-feel PWA + agent legibility) | Accepted |
| 0007 | Gapless invoice numbers via a per-org counter, not a SEQUENCE | Accepted |
| 0008 | Open-source & self-hostable across the stack | Accepted (revised by 0015) |
| 0009 | Local-first LLM via an OpenAI-compatible abstraction | Accepted |
| 0010 | graphile-worker (in-Postgres jobs) over a hosted workflow SaaS | Accepted |
| 0011 | Drizzle queries with SQL as schema source of truth (introspection) | Accepted |
| 0012 | Tenant isolation: FORCE RLS + a non-owner application role | Accepted |
| 0013 | Hosted Postgres: Neon (EU region) | Accepted |
| 0014 | CI ephemeral database: Testcontainers (replaces Neon branching) | Accepted |
| 0015 | Deploy: persistent Node on an EU PaaS, Cloudflare edge/CDN + R2 (revises 0008) | Accepted |
| 0016 | Adaptive two-surface design system (desktop workbench + mobile companion) | Accepted |
| 0017 | Mechanical quality gates & supply-chain hardening | Accepted |
| 0018 | Closing four ledger-integrity gaps in SQL | Accepted |
| 0019 | Agentic memory: a committed task graph + a rejected-approaches log | Accepted |
| 0020 | Session & identity model (the first lock) | Accepted |
| 0021 | Observability baseline: pino with redaction | Accepted |
| 0022 | EU AI Act posture: not high-risk; transparency + provenance on AI features | Accepted |
| 0023 | Saldo's own code is proprietary (the stack stays OSS + self-hostable) | Accepted |
| 0024 | Keyed microcopy: Norwegian-first, single-locale, type-safe | Accepted |
| 0025 | Playful, guided experience direction (companion + the Torpedo) | Accepted |
| 0026 | Typography: Fraunces + IBM Plex Sans, weights ≤450, self-hosted | Accepted |
| 0027 | VAT-treatment granularity: per-line/per-project, apportionment sequenced | Accepted |
| 0028 | Regulatory knowledge: capture-and-encode, not runtime RAG | Accepted |
| 0029 | ENK income-tax estimate: model and stated assumptions | Accepted |
| 0030 | Sectoral VAT exemptions: the activity dimension, revenue gate first | Accepted |
| 0031 | Doc-freshness: generated repo-status block + evidence-based graph drift checks | Accepted |
| 0032 | Per-org provisioning: seed the SAF-T kontoplan + VAT codes in the org-creation transaction | Accepted |
| 0033 | Honest-number ledger aggregation (kontoklasse + VAT direction) + reveal against an empty ledger | Accepted |
| 0034 | Manual voucher entry: event-framed first posting surface, status-driven VAT, designated accounts | Accepted |
| 0035 | Receipt extraction: the first AI-system surface, propose-only, provenance in the contract | Accepted |
| 0036 | Shared AI-transparency disclosure primitive (`<AiAssisted>`) — the EU AI Act Art. 50 treatment for every AI surface | Accepted |
| 0037 | Persisted AI provenance — durable, queryable EU AI Act Art. 50(2) audit trail (`ai_provenance` table + log) | Accepted |
| 0038 | Disaster recovery + document retention: Neon PITR, a tested restore drill, R2 WORM lock | Accepted |
| 0039 | Stateful, model-based property testing of the ledger (a real-DB command model) | Accepted |
| 0040 | Contacts register data model: one register (role flags), per-contact MVA + defaults, same-org composite FK | Accepted |
| 0041 | Products & services catalogue: net øre price, derived gross preview, goods/service kind, same-org default FK | Accepted |
| 0042 | Sales invoicing: quote/invoice/credit-note in one kind model, gapless numbering, per-line MVA hard block | Accepted |
| 0043 | Invoice → ledger posting: the balanced AR voucher on issue, reusing deriveSales | Accepted |
| 0044 | Reverse-charge dual-leg posting + non-deductible VAT, and the tightened sales-line gate | Accepted |
| 0045 | Transactional email provider: Postmark (EU region), behind the swappable nodemailer interface | Accepted |
| 0046 | Invoice PDF, email delivery (Postmark EU), and EHF/PEPPOL BIS 3.0 local generation | Accepted |
| 0047 | Banking import: GoCardless PSD2/AIS + camt.054 + CSV → append-only bank_transaction substrate | Accepted |
| 0048 | Bank reconciliation: deterministic KID/amount/date matcher + settlement posting | Accepted |
| 0049 | Architecture-truth generator: derive the structural map + mechanically enforce the one hard boundary | Accepted |
| 0050 | MVA-melding generation on SAF-T VAT codes + Skatteetaten validation (fail-closed) | Accepted |
| 0051 | Reporting: resultat/balanse/hovedbok/reskontro/likviditet derived read-only from the ledger | Accepted |

Each ADR's own Context/Decision is the record, and supersession is tracked in the ADR's Status field
(e.g. 0008 → 0015). `docs/roadmap.md` narrates how the Phase-0 decisions fit together. Approaches that
were **rejected** live in `rejected.md` (the anti-ADR).
