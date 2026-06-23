---
paths: ["apps/web/app/integrations/**", "apps/web/app/jobs/**", "apps/web/app/contracts/**"]
---
# AI features — EU AI Act obligations (loads when you touch the AI/LLM surface)

You are editing code on Saldo's **AI surface**. Under **Regulation (EU) 2024/1689** (the AI Act),
these LLM features **are AI systems** (Art. 3(1)); the deterministic `@saldo/domain` rules engine is
**not** (Recital 12 — rules defined solely by humans). Full analysis: `docs/regulatory/eu-ai-act.md`;
posture: ADR 0022; oversight model: ADR 0002. Honour these — prefer the gate over the reminder.

## MUST (build these into any AI feature)
- **Disclose the AI interaction** (Art. 50(1)): the UI tells the user, at first interaction, that a
  value/proposal is AI-generated — unless that is obvious. Never present an AI proposal as if a human
  or the deterministic engine produced it.
- **Mark + log AI output** (Art. 50(2)): every AI-proposed value is **labelled "AI-assisted"** and
  carries machine-readable provenance (model id + version + confidence), and is **logged** with that
  provenance (pair with the logging baseline when it lands — roadmap item 8 / PR 6). The provenance
  field is part of the proposal's Zod contract, not an afterthought.
- **AI never writes the ledger** (ADR 0002): AI proposes → the rules engine validates → a human
  confirms (explicitly, or via the grace-window untap for high-confidence routine items). The model
  never commits.
- **Rely on the model provider's docs** (Art. 53): if you change the model/endpoint (ADR 0009),
  capture its Annex XII documentation under `db/reference/llm/` — do not infer capabilities/limits
  from memory.

## STOP — re-open ADR 0022 first
- **Never** build an AI feature that **evaluates a natural person's creditworthiness / credit score**
  or **profiles a natural person** (e.g. scoring a customer before extending credit terms). That is
  **Annex III(5)(b)** + **Art. 6(3)** high-risk and would make Saldo a **high-risk provider**
  (Art. 25(1)) with a full conformity-assessment burden. The honest-number feature (the user's *own*
  income − VAT held − estimated tax) is the user's own arithmetic and is **not** this — keep it that
  way.

## Note
The **code-level** enforcement of provenance (a required `aiAssisted` + model field on every AI
proposal, plus a lint/test check) lands **with** the first AI feature. Until then this rule + the
AGENTS.md invariant hold the line.
