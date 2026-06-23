# ADR 0028 — Regulatory knowledge: capture-and-encode, not runtime RAG

- **Status:** Accepted
- **Date:** 2026-06-23

## Context
Saldo must apply Norwegian VAT/bookkeeping law correctly. A tempting shortcut is to connect an LLM to a
legal corpus (Lovdata/Skatteetaten) and **retrieve-and-reason at runtime** (RAG) to decide a posting's
VAT treatment. We need to settle where law lives in the architecture before anyone wires up a legal feed.

Two questions hide inside "should we RAG over a legal API?": (1) how we **source** authoritative text,
and (2) how the law **decides** what Saldo posts. They have different answers. The law that drives
posting is **stable and shared** — identical for every user and transaction, changing a few times a year —
which is the opposite of the per-query, open-ended profile RAG is for.

## Decision
**The deciding path is deterministic code grounded in captured sources. AI may *explain* a rule; it must
never *be* the rule.** Concretely, a four-layer model:

1. **Authority of record = static committed captures.** Primary sources land in `db/reference/`
   (immutable; git is the append-only log) and are distilled into cited `docs/regulatory/` pages carrying
   a `verify-by` date. Law text is fetched **once and captured**, not read live per transaction. (This is
   the existing pattern — SAF-T code lists, MVA rates, the § 3-7 capture — now stated as policy.)
2. **The deterministic rules engine** in `@saldo/domain` encodes the operative rules and decides postings.
   No LLM sits in the deciding path. Exhaustive + property tested.
3. **A freshness/change-detector** *may* poll an external source (e.g. a scheduled fetch / the `verify-by`
   cron) — but only as a **tripwire** that opens a human review → new dated capture → engine update (the
   `regulatory-update` ritual). The API is never a runtime oracle.
4. **An optional read-only explanation layer (later).** If the companion explains *why* a line is exempt,
   an LLM grounded on the **committed corpus** (not a live feed) may generate a cited, **AI-assisted**
   explanation. It reads, never writes to the ledger, and is disclosed per ADR 0022 (Art. 50).

## Consequences
- **Determinism & testability preserved:** posting stays server-authoritative, SQL-enforced, and provable
  (`Σ debit = Σ credit`); a probabilistic retriever could never carry that guarantee.
- **EU AI Act posture preserved (ADR 0022):** keeping the rules engine deterministic keeps it a non-AI
  system (Recital 12). Putting RAG in the deciding path would convert the ledger's core into an AI system
  with the full Art. 50 / risk obligations — a large, needless regulatory downgrade.
- **Auditability & sustainability:** an audit gets a reproducible "this text, captured on this date" trail
  (bokføringsloven sporbarhet); and the rule is computed once at capture/encode time, not paid for per
  transaction in tokens (consistent with the "AI only where genuinely needed" cost posture).
- **Accepted costs:** regulatory change requires a human-in-the-loop capture + engine change (slower than
  "the model just knows") — which is the point: deliberate, dated, reviewable. The explanation layer, when
  built, must be pinned to the committed corpus so its words match what the engine enforced.

## Alternatives considered
- **Runtime RAG over a live legal API as the deciding authority.** Rejected — non-deterministic core,
  EU-AI-Act reclassification, weaker audit trail, per-transaction token cost, and a runtime availability
  coupling against an offline/EU-resident goal. Also impractical: Lovdata's consolidated database has
  restricted terms and there is no clean open legal API to rely on.
- **Hardcode rules from model memory.** Rejected — violates the source-grounded invariant (AGENTS.md);
  regulatory facts must cite a captured primary source.
- **No freshness automation (manual only).** Rejected as the *whole* answer — a change-detector tripwire is
  worth the cost to stop silent staleness; it just must feed the human ritual, not act autonomously.
