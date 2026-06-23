---
paths: ["packages/domain/src/vat/**", "packages/domain/src/posting/**"]
---
# MVA (VAT) rules

- MVA status is exactly one of `under_threshold | unntatt | registered_standard |
  registered_zero_rated`. It forks invoice rendering, input-VAT treatment, and reporting.
- **Output VAT** is charged ONLY when `registered_standard`/`registered_zero_rated`. When
  `under_threshold`/`unntatt`, invoices must NOT show MVA — hard validation block, not a default.
- **Input-VAT fork** (single posting function that branches on status, not scattered ifs):
  - registered_* → split input VAT to the deductible input-VAT account.
  - under_threshold / unntatt → NO deduction; book gross to the cost account.
- **Non-deductible even when registered:** representasjon, restricted vehicle costs, private-use
  portion. Encode as explicit rules.
- **Reverse charge (snudd avregning)** on foreign-service purchases posts BOTH legs (output + input);
  both must appear on the MVA-melding even when net cash is zero.
- VAT codes & accounts are loaded from the committed SAF-T code lists (`db/reference/saf-t`),
  never hardcoded from memory.
- Every new VAT/posting behavior REQUIRES an exhaustive or fast-check test in @saldo/domain.
