# ADR 0010 — graphile-worker (in-Postgres jobs) over a hosted workflow SaaS

- **Status:** Accepted
- **Date:** 2026-06-22

## Context
Durable jobs (recurring invoices, reminders, OCR→propose, threshold/term watchers) carry
receipt/invoice payloads. A hosted US workflow SaaS would move that data out of the EU and add a
vendor — in tension with the sovereignty stance (ADR 0008).

## Decision
Run jobs with **graphile-worker** on the application's own PostgreSQL, inside the persistent Node
process. A hosted engine (Inngest/Trigger.dev) is permitted only if EU-region payload processing is
confirmed and the orchestration ergonomics are worth the extra vendor.

## Consequences
- Payloads never leave the database; one fewer vendor.
- Scheduling/retry semantics stay in-house (graphile-worker provides them).

## Alternatives considered
- **Inngest** — nice DX, but US SaaS in the data path; not load-bearing here.
