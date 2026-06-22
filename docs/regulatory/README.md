# Regulatory knowledge (cited & dated)

Compiled, **source-grounded** knowledge of the Norwegian rules Saldo must implement correctly:
bokføring/MVA law, registration thresholds, filing cadences, retention, and the moving parts of
Skatteetaten/Altinn. Adapted from the "LLM wiki" pattern (see `.claude/skills/regulatory-update`).

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

Integration-specific knowledge (auth, endpoints, rate limits) lives in `docs/integrations/` under the
same Sources/verify-by convention.
