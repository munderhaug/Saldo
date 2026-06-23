# Overview

Saldo is a **compliance-grade financial system of record** for Norwegian sole proprietorships
(*enkeltpersonforetak*, "ENK") with **under 500,000 NOK in annual revenue** — a deliberately
simple alternative to Fiken/Conta tailored to one life stage of a business.

The defining legal fact: a sub-500k ENK is **bokføringspliktig** (must keep books) but **not
regnskapspliktig** (no statutory annual accounts). That removes the heaviest features other systems
carry (årsregnskap, revisor, payroll) and shapes the entire scope.

The value is **server-side correctness** — an immutable ledger, correct VAT, a complete audit
trail, and trustworthy integrations — wrapped in a clean forms-and-reports UI with a native-feel
mobile PWA for receipt capture.

**Primary user:** a solo operator (freelancer, consultant, tradesperson) who keeps their own books
and files their own taxes — phone for capture, desktop for everything else.

- Full product spec & scope: `docs/saldo-build-specification.md` (§1–§2, §8).
- Norwegian terms: `docs/glossary.md`.
- Domain rules & data model: `docs/domain-model.md`.
- Current stack: `docs/tech-stack.md`. Architecture: `docs/architecture.md`.
- Decisions: `docs/decisions/`. Integrations: `docs/integrations/`.
