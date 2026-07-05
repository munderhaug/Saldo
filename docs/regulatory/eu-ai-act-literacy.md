# AI-literacy note (EU AI Act Art. 4) — what Saldo's AI does, its limits, who confirms

**Dated:** 2026-07-05 · **Owner:** @munderhaug · Re-read when an AI feature changes, at each Art. 113
milestone (next: **2 Aug 2026**), and at the LLM-hosting decision (ADR 0009).

Art. 4 requires providers and deployers to ensure "a sufficient level of AI literacy of their staff
and other persons dealing with the operation and use of AI systems on their behalf" — in force since
**2 Feb 2025**. Saldo is a solo-operated ENK, so the proportionate measure is this note: a short,
dated competence record for the operator and for anyone acting on Saldo's behalf (including coding
agents, which load the same boundary via `.claude/rules/ai-act.md`). Classification and timeline:
[eu-ai-act.md](eu-ai-act.md); posture: ADR 0022.

## What the AI features are (today: one)

**Receipt/invoice extraction** (ADR 0035): a vision LLM reads a receipt or supplier-invoice image and
**proposes** structured fields (supplier, date, amounts, a category). That proposal is validated by
the deterministic rules engine and shown to the user labelled **AI-assisted** (ADR 0036), with
model/version/confidence provenance persisted in the append-only `ai_provenance` trail (ADR 0037).
Everything else in Saldo — money, VAT, posting, reports, the companion's scripted lines — is
deterministic, human-authored rules and is **not** an AI system (Art. 3(1), Recital 12).

## The limits anyone operating it must know

- **The model can be wrong, confidently.** It can misread figures, invent plausible-looking values,
  and mistake similar documents. Its confidence score is a signal, not a guarantee.
- **A proposal is never a booking.** AI output enters the ledger only after the rules engine validates
  it AND a human confirms (explicitly, or by letting a high-confidence routine item pass its grace
  window un-tapped — ADR 0002). The model has no write path to the ledger.
- **Provenance is not optional.** Every AI-proposed value stays labelled and logged; if a surface
  shows an AI value unlabelled, that is a defect (Art. 50).
- **The line never to cross:** no AI feature may score or profile a natural person (creditworthiness
  or otherwise) — that is Annex III(5)(b) high-risk territory and requires re-opening ADR 0022 first.
- **Data goes only where residency is proven.** The extraction client refuses off-box endpoints
  without an explicit EU-residency assertion (`LLM_EU_RESIDENT`), and fails closed when unconfigured.

## Competence expectations

The operator (and any agent acting for Saldo) can: state the propose→validate→confirm chain; point to
where disclosure and the AI-assisted label live in the UI; explain why the ledger core is out of the
Act's scope; and name the high-risk line above. That is the "sufficient level" Art. 4 asks of an
operation this size. The conformity checklist ([eu-ai-act-conformity.md](eu-ai-act-conformity.md))
re-verifies the posture per release.

## Sources

- Regulation (EU) 2024/1689, **Art. 4** (AI literacy, in force 2 Feb 2025), Art. 3(1), Recital 12,
  Art. 50, Annex III(5)(b). Raw verbatim capture:
  `db/reference/eu-ai-act/2026-06-23-ai-act-key-provisions.md`. Analysis: [eu-ai-act.md](eu-ai-act.md).
  verify-by: 2026-12-31
