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
- Merverdiavgiftsloven (LOV-2009-06-19-58) **§ 2-1** _Registreringsplikt_ — the 50 000 / 140 000 kr
  thresholds and the "omsetning og uttak som er omfattet av loven" basis, captured verbatim.
  Raw: db/reference/mva/2026-06-23-mval-2-1-registreringsplikt.md. verify-by: 2026-12-31
- Skatteetaten, "Registrering i Merverdiavgiftsregisteret — beløpsgrense" — cross-confirmed (summarised,
  not reproduced; Skatteetaten content is copyrighted). verify-by: 2026-12-31
