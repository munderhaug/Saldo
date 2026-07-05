# Regulatory knowledge (cited & dated)

Compiled, **source-grounded** knowledge of the rules Saldo must implement correctly: the Norwegian
bokføring/MVA law, registration thresholds, filing cadences, retention, and the moving parts of
Skatteetaten/Altinn — plus the EU/EEA regulations that bind Saldo's product (the **EU AI Act**).
Adapted from the "LLM wiki" pattern (see `.claude/skills/regulatory-update`).

## The discipline
- Every claim is **cited** to a primary source captured under `db/reference/` (the immutable raw store;
  git is the append-only log). Never write regulatory facts from model memory.
- Every page carries a **`verify-by` date**. `pnpm lint:repo` flags pages past their date and any page
  missing a `## Sources` section — so rules can't silently go stale (esp. the in-flux Altinn flows).
- The same principle is already a hard invariant for posting: VAT codes/accounts come from the committed
  SAF-T lists, never hardcoded.

## Pages
| Page | Topic | verify-by |
|---|---|---|
| `mva-registration-threshold.md` | 50k rolling-12-month MVA registration threshold | see page |
| `mva-rates.md` | MVA rates (2026) mapped to the SAF-T rate categories | 2026-12-31 |
| `mva-melding.md` | MVA-melding (VAT return) — code-based format, sign rule, tie-out, validation | 2026-12-31 |
| `mva-kunstneriske-tjenester.md` | mval § 3-7 — artistic/cultural exemption (*unntatt*) and its reach | 2026-12-31 |
| `mva-sektorunntak.md` | mval kap. 3 — which whole activities are *unntatt* (helse/undervisning/finans/…) | 2026-12-31 |
| `skatt-enk-personskatt.md` | ENK personal income tax (trinnskatt + trygdeavgift + 22 % alminnelig inntekt, 2026) | 2026-12-31 |
| `eu-ai-act.md` | EU AI Act (Reg 2024/1689) — classification, obligations, timeline | 2026-12-31 |
| `eu-ai-act-literacy.md` | Art. 4 AI-literacy note — what the AI does, its limits, who confirms | 2026-12-31 |
| `eu-ai-act-conformity.md` | Conformity self-assessment checklist + append-only run log | 2026-12-31 |

Integration-specific knowledge (auth, endpoints, rate limits) lives in `docs/integrations/` under the
same Sources/verify-by convention.
