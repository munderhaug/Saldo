# ADR 0002 — Propose-only AI; the rules engine is the safety boundary

- **Status:** Accepted
- **Date:** 2026-06-22

## Context
LLM extraction is valuable for receipts but non-deterministic. The ledger must remain correct and
auditable regardless of model behavior.

## Decision
The smart layer follows **propose → validate → confirm**. A model proposes; the deterministic rules
engine in `@saldo/domain` validates against Norwegian bookkeeping rules; a human confirms. **AI never
writes to the ledger.** Build the deterministic layers first; AI is the last enhancement and is only
safe *because* the rules layer exists.

## Consequences
- Model choice (local vs hosted) becomes a swappable detail, not a correctness risk.
- Every extraction output must pass the rules engine before any commit.

## Alternatives considered
Direct AI posting with human spot-checks — rejected: unacceptable for a system of record.
