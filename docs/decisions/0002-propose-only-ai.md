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

> **Refinement (2026-06-23, with `docs/experience-principles.md` §7.3):** "a human confirms" is
> satisfied two ways. For the consequential actions — money leaving, filing to the authorities
> (experience §5.5) — confirmation is **explicit and active**, with an undo/grace window. For
> **high-confidence routine** items (a known recurring charge, a regular client) the
> rules-engine-validated proposal **auto-applies after a grace window unless the user untaps** — the
> untap window is **passive** confirmation, safe only because the ledger is append-only and every
> action is reversible. The AI still only **proposes**; the deterministic rules engine plus the user's
> (active or passive) consent commit — never the model.

## Consequences
- Model choice (local vs hosted) becomes a swappable detail, not a correctness risk.
- Every extraction output must pass the rules engine before any commit.

## Alternatives considered
Direct AI posting with human spot-checks — rejected: unacceptable for a system of record.
