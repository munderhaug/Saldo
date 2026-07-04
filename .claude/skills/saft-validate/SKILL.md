---
name: saft-validate
description: Generate and XSD-validate a SAF-T Financial export, or validate an MVA-melding against the schema. Use when touching export/reporting logic or before claiming SAF-T/VAT output is correct.
allowed-tools: Bash(pnpm saft:validate) Bash(pnpm mva:validate) Read Glob Grep
---
# SAF-T validate

SAF-T must be XSD-valid on demand (for a bokettersyn). Validate, don't assume.

## Steps
1. `pnpm saft:validate` — generates a sample SAF-T file from seed/fixture data and validates it
   against the official XSD committed under `db/reference/saf-t`.
2. On failure, the validator prints `line:col — rule`. Fix the mapping in the export builder
   (codes/accounts come from the SAF-T reference lists).
3. For MVA-melding, validate the generated XML against Skatteetaten's schema/validation API.

## Notes
- This runs in CI on every change touching export logic — keep it green.
- The SAF-T standard-accounts list is copyright Regnskap Norge AS, licensed only for SAF-T mapping.
- For a reviewable summary, pair with the `html-report` skill to emit a pass/fail matrix.

## Rationalizations (don't)
| Excuse | Reality |
|---|---|
| "The export looks right; skip validation." | XSD validation catches structural + code-mapping errors the eye misses — always run it. |
| "I'll validate at deploy, not pre-merge." | It's a CI gate on export logic — validate before the PR so a failure surfaces early, not in prod. |
| "I'll map this line to a VAT code/account from memory." | Codes/accounts come from the committed SAF-T lists; memory drifts and corrupts the export. |

## Red flags — STOP
- Claiming SAF-T/MVA output is correct without running validation. Mapping to a VAT code/account from
  memory instead of the committed SAF-T lists. A schema bump not re-validated.

## Done means (evidence required)
- [ ] `pnpm saft:validate` passes against the committed XSD (not skipped/stubbed)
- [ ] MVA-melding XML validated against Skatteetaten's schema where relevant
