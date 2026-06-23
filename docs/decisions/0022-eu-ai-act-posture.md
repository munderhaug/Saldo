# ADR 0022 — EU AI Act posture: not high-risk; transparency + provenance on AI features

- **Status:** Accepted
- **Date:** 2026-06-23

## Context
Saldo uses an LLM for receipt extraction and AI-proposed entries (ADR 0009), so **Regulation (EU)
2024/1689** (the AI Act) applies to part of the product. We need a recorded classification and a
compliance approach grounded in the text, not a vague "we'll be careful". The full, cited analysis
is `docs/regulatory/eu-ai-act.md`; this ADR records the decision it leads to.

## Decision
Saldo adopts the following posture, grounded in the Act:

1. **Scope boundary.** Only the **LLM features** are AI systems (Art. 3(1)). The deterministic
   `@saldo/domain` rules engine and SQL integrity layer are **not** AI systems — Recital 12 excludes
   software executing "rules defined solely by natural persons". We keep that boundary sharp: it is
   what keeps the regulated surface small.
2. **Not prohibited, not high-risk.** None of Art. 5's prohibited practices apply. Saldo is not
   high-risk: it touches no Annex III area. The honest-number/estimated-tax feature computes the
   **user's own** figures and is therefore outside Annex III(5)(b) (creditworthiness of *natural
   persons*).
3. **Roles.** Saldo is the **provider** of its AI system and a **deployer** of the model (Art. 3(3),
   (4)); it is **not** a GPAI provider and **relies on** the model provider's Art. 53 documentation.
4. **The two binding duties we build to:** **transparency** (Art. 50 — disclose the AI interaction;
   mark AI output as AI-assisted; applies 2 Aug 2026) and **AI literacy** (Art. 4 — a proportionate
   competence note; in force). We build to the EU application dates regardless of EEA-incorporation
   timing.
5. **The line we never cross (invariant):** no AI feature **evaluates a natural person's
   creditworthiness or profiles a natural person** — either would make Saldo a high-risk provider
   (Annex III(5)(b); Art. 6(3) final subparagraph; Art. 25(1)). Recorded as a CLAUDE.md invariant and
   gated by `.claude/rules/ai-act.md`.

## Relationship to ADR 0002 (propose-only AI)
ADR 0002 already gives us most of what the Act wants: AI **proposes**, the rules engine
**validates**, a human **confirms**, and **AI never writes the ledger**. ADR 0022 **sharpens** it
with two AI-Act-specific requirements that sit on top of that model: every AI-proposed value is
**disclosed as an AI interaction** (Art. 50(1)) and **labelled "AI-assisted" with logged provenance**
(Art. 50(2)). The oversight model is unchanged; transparency and provenance are added.

## Consequences
- **Easier:** a defensible, cited classification; a small, well-bounded compliance surface; the
  propose-only architecture already satisfies the spirit of the Act.
- **Required work (tracked in the backlog, `docs/backlog/tasks.json` as the `aia-*` tasks):** AI-interaction
  disclosure in the UI, AI-output provenance/labelling + logging, capture of the upstream model's
  Annex XII documentation, an AI-literacy note, and a conformity self-assessment checklist re-run per
  AI release and per Art. 113 milestone.
- **Accepted cost / deferred:** the **code-level** provenance gate (a required `aiAssisted`/model
  field on AI proposals, plus a lint check) lands **with** the first AI feature, not now — building it
  against non-existent code would be speculative. Until then the invariant + path-scoped rule hold the
  line.
- **Watch items:** EEA incorporation timing + Norwegian supervisory authority (in flux); Art. 50
  codes of practice; any future feature drifting toward scoring/profiling a natural person (re-open
  this ADR — it would change the classification to high-risk).

## Alternatives considered
- **Treat the whole app as in-scope / "an AI product".** Rejected: inaccurate (the ledger core does
  not infer — Recital 12) and it would inflate the compliance surface and dilute the real obligations.
- **Defer all AI Act work until the features ship.** Rejected: Art. 4 (literacy) is already in force,
  Art. 50 applies 2 Aug 2026, and the cheapest time to bake in disclosure/provenance is **before**
  the AI features are built — so the posture, invariant, and gate land now; the feature-coupled code
  gate lands with the feature.
- **A standalone EU AI Act review subagent (now).** Deferred, not adopted. The repo already has 7
  subagents, "none demonstrably used" (roadmap P0-5: *don't add more — sharpen the existing ones*),
  and there is no AI surface to review yet — a new agent today is speculative. An on-demand agent is
  also a **weaker** guarantee than the auto-loading `.claude/rules/ai-act.md` (which fires
  deterministically the moment AI/LLM code is touched, with no reliance on someone invoking it) plus
  the code-level provenance gate (AIA-2). When AI features land, the disciplined move is to **fold the
  AI Act review checklist into the existing `privacy-reviewer`** — it already reviews
  `integrations`/`jobs`/`contracts` (incl. the LLM endpoint) for EU compliance — and to split out a
  dedicated reviewer only on demonstrated need. Tracked as backlog **AIA-7**. ("Gate over reminder",
  "escalate to subagents only on demonstrated need".)
