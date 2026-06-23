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

ADRs 0001–0004 restate decisions from `saldo-build-specification.md` §17; 0005–0011 capture the
stack-shaping calls from the tech-stack review; 0012–0016 harden tenancy and record the hosting,
CI-database, deployment, and design-system decisions; 0017 makes the quality bar deterministic
(fail-closed hooks, turn-end green-bar, CI supply-chain hardening); 0018 closes four ledger-integrity
gaps (posting-side period lock, posted-completeness, period non-overlap, cross-org period FK); 0019
adds the committed task graph + rejected-approaches log; 0020 adds the auth/identity first lock; 0021
adds the pino observability baseline; 0022 records the EU AI Act classification + compliance posture
(sharpening 0002); 0023 records that Saldo's own code is proprietary (the stack stays OSS +
self-hostable per 0008). Approaches we **rejected** live in `rejected.md` (the anti-ADR).
