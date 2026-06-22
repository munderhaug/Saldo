---
name: html-report
description: Emit a self-contained, single-file HTML artifact for anything a human will review — VAT-scenario matrices, SAF-T validation summaries, ER/schema diagrams, migration plans, design-token swatches. Use instead of a long markdown wall when spatial/side-by-side layout aids review.
---
# HTML report

Per the "unreasonable effectiveness of HTML": when the deliverable is something a human reads and
reacts to, a spatial HTML artifact beats a linear markdown wall and can be fed back into the next prompt.

## When to use
- comparisons/alternatives that benefit from side-by-side columns
- tables/matrices (VAT scenarios × statuses, account↔code mappings, aging buckets)
- diagrams (module boxes/arrows, ER, voucher posting flows)
- validation summaries (SAF-T/EHF pass/fail with line refs)

## How
1. Write ONE self-contained `.html` to `reports/<name>.html` — inline CSS, no external deps,
   no network. Use `font-variant-numeric: tabular-nums` for any figures.
2. Include collapsible sections for detail and a copy button on any block meant to be re-fed to an agent.
3. Keep it generatable: prefer a small `tsx` script under the skill if the report is recurring.

## Don't
- Don't use this for source code or for content the user asked for as a commit/PR.
- Don't pull in remote assets — the artifact must open offline.
