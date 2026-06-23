# MVA registration threshold

**Rule:** VAT (MVA) registration becomes mandatory once taxable turnover exceeds **NOK 50,000 over a
rolling 12-month period** (not a calendar year). For charitable/non-profit bodies the threshold is
**NOK 140,000**. Below the threshold an enterprise is not registered: it charges no output VAT and
deducts no input VAT.

## Why it matters in Saldo
- Drives the `mva_status` state machine (`under_threshold → registered_*`) which forks all posting
  (see `.claude/rules/vat.md`).
- The app tracks turnover on a **rolling 12-month window** and warns as the user approaches 50k, then
  guides the registration transition (build-spec §8.8).
- Crossing the threshold mid-period changes output-VAT obligation and input-VAT deductibility going
  forward — it is not retroactive to already-issued invoices.

## Implementation notes
- Compute the rolling window from posted sales, in `@saldo/domain` (pure, tested), injecting the clock.
- "Taxable turnover" excludes activities that are *unntatt* (outside the VAT Act); include zero-rated
  (fritatt) turnover.

## Sources
- Skatteetaten, "Registrering i Merverdiavgiftsregisteret — beløpsgrense" (50 000 / 140 000 NOK).
  Raw: db/reference/mva/ (capture the current Skatteetaten page before relying on this). verify-by: 2026-12-31
- Merverdiavgiftsloven § 2-1. Raw: db/reference/mva/ (commit the lovdata text). verify-by: 2026-12-31

> **Note:** Capture the cited primary sources into `db/reference/mva/` via the `regulatory-update`
> skill — this page states the well-established rule, but the raw captures are not yet committed.
