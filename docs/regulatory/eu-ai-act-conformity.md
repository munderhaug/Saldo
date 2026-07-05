# EU AI Act conformity self-assessment — the checklist and its run log

**Owner:** @munderhaug. Re-run **before each AI feature ships**, at each **Art. 113 milestone**
(next: **2 Aug 2026**, general application incl. Art. 50), and at any **LLM model/endpoint change**
(ADR 0009). Append a row to the run log; never rewrite an old row. Classification and analysis:
[eu-ai-act.md](eu-ai-act.md); posture: ADR 0022; competence record:
[eu-ai-act-literacy.md](eu-ai-act-literacy.md).

## The checklist

| # | Check | Cite |
|---|---|---|
| 1 | **Scope boundary holds:** only the LLM features infer; the ledger/rules core remains deterministic, human-authored (no inference crept into `@saldo/domain` or SQL) | Art. 3(1), Recital 12 |
| 2 | **Prohibitions still clear:** nothing manipulates, exploits vulnerabilities, social-scores, or touches any other Art. 5(1)(a)–(h) practice | Art. 5 |
| 3 | **Still not high-risk:** no Annex III area entered; in particular **no AI scores/profiles a natural person** (creditworthiness or otherwise) | Art. 6, Annex III(5)(b) |
| 4 | **AI interaction disclosed:** every AI surface tells the user it is AI at first interaction, in the UI | Art. 50(1) |
| 5 | **AI output marked + logged:** every AI-proposed value is labelled "AI-assisted" and carries machine-readable provenance (model, version, confidence), persisted append-only | Art. 50(2) |
| 6 | **Propose-only boundary intact:** AI has no write path to the ledger; rules engine validates; a human confirms (explicit or grace-window) | ADR 0002 |
| 7 | **AI-literacy note current:** [eu-ai-act-literacy.md](eu-ai-act-literacy.md) matches the shipped feature set | Art. 4 |
| 8 | **Upstream GPAI docs on file:** the served model's Annex XII documentation is captured under `db/reference/llm/` — or the deployment is still config-gated with no committed model (then: capture at the hosting decision, task `aia-gpai-docs`) | Art. 53 |
| 9 | **EEA/Norway status re-checked** if past the page's verify-by (incorporation + supervisory authority) | eu-ai-act.md §7 |

## Run log (append-only)

| Date | Trigger | Feature set assessed | Result | Notes |
|---|---|---|---|---|
| 2026-07-05 | First run (task `aia-conformity-checklist`) | Receipt/invoice extraction (ADR 0035/0036/0037) — the only AI feature | **Pass** (1–7, 9); **8 pending by design** | 1: rules core deterministic, gate `.claude/rules/ai-act.md` + `arch-truth` purity check. 2–3: clear — extraction of the user's own documents; no person scored/profiled (guard task `aia-highrisk-guard` done). 4: disclosure shipped (`aia-transparency-ui` done, ADR 0036). 5: AiAssisted label + `ai_provenance` append-only trail (`aia-provenance-logging` done, ADR 0037). 6: propose-only enforced (ADR 0002; no ledger write path). 7: literacy note written this run. 8: no committed model — `LLM_MODEL` is per-deployment env, hosting decision open (ADR 0009); capture gated on that decision. 9: within verify-by (2026-09-30). |

## Sources

- Regulation (EU) 2024/1689, Arts. 3–6, 50, 53, 113; Annex III; Recital 12. Raw verbatim capture:
  `db/reference/eu-ai-act/2026-06-23-ai-act-key-provisions.md`. Analysis: [eu-ai-act.md](eu-ai-act.md).
  verify-by: 2026-12-31
