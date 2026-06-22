# Architecture Decision Records

One file per significant, hard-to-reverse decision. Format: `docs/decisions/adr-template.md`.
Changing a locked stack choice (`docs/tech-stack.md`) requires a new ADR superseding the old one.

| # | Decision | Status |
|---|---|---|
| 0001 | Online-first, not offline-first | Accepted |
| 0002 | Propose-only AI; rules engine is the safety boundary | Accepted |
| 0003 | Integrity in SQL, not the ORM | Accepted |
| 0004 | Integer øre, never floats | Accepted |
| 0005 | React Router 7 over Next.js | Accepted |
| 0006 | shadcn/ui over Mantine (native-feel PWA + agent legibility) | Accepted |
| 0007 | Gapless invoice numbers via a per-org counter, not a SEQUENCE | Accepted |
| 0008 | Open-source & self-hostable across the stack | Accepted |
| 0009 | Local-first LLM via an OpenAI-compatible abstraction | Accepted |
| 0010 | graphile-worker (in-Postgres jobs) over a hosted workflow SaaS | Accepted |
| 0011 | Drizzle queries with SQL as schema source of truth (introspection) | Accepted |
| 0012 | Tenant isolation: FORCE RLS + a non-owner application role | Accepted |

ADRs 0001–0004 restate decisions from `saldo-build-specification.md` §17; 0005–0011 capture the
stack-shaping calls from the tech-stack review.
