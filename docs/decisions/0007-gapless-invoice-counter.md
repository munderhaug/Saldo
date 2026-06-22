# ADR 0007 — Gapless invoice numbers via a per-org counter, not a SEQUENCE

- **Status:** Accepted
- **Date:** 2026-06-22

## Context
Bokføringsforskrift expects invoice numbers to be assigned automatically and consecutively (gapless).
A Postgres `SEQUENCE` is non-transactional: `nextval()` does not roll back, so any aborted issuing
transaction burns a number and leaves a gap — violating gaplessness.

## Decision
Allocate invoice/credit-note numbers from a per-organization `invoice_counter` row, incremented with
`UPDATE invoice_counter SET next = next + 1 WHERE organization_id = $1 RETURNING next` inside the
issuing transaction. The number persists only if the transaction commits.

## Consequences
- Numbering is genuinely gapless and monotonic per org.
- Issuance is serialized per org by the row lock — acceptable at this scale.

## Alternatives considered
- **Postgres SEQUENCE** — rejected: leaves gaps on rollback. This corrects the original spec draft.
