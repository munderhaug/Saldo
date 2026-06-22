---
name: new-vat-scenario
description: Add or change VAT/posting behavior in @saldo/domain with the required exhaustive and property-based tests. Use whenever the input-VAT fork, a rate, a non-deductible case, or reverse-charge logic changes.
---
# New VAT scenario

Every VAT/posting change is test-first in the pure core.

## Steps
1. Identify the SAF-T VAT code(s) and account(s) involved — load from `db/reference/saf-t`, never
   hardcode from memory.
2. Write the test first in `packages/domain/src/vat/` or `posting/`:
   - an exhaustive table test for the specific cases, AND
   - a fast-check property test for the invariant (e.g. "for all amounts, Σ debit = Σ credit";
     "input VAT deductible iff status ∈ registered_*").
3. Implement the branch in the single status-driven posting function — no scattered conditionals.
4. `pnpm --filter @saldo/domain test`.
5. Run the `vat-reviewer` subagent on the change.

## Checklist
- [ ] output VAT only when registered_*
- [ ] input-VAT fork correct for all four statuses
- [ ] non-deductible cases (representasjon, vehicle, private use) handled
- [ ] reverse charge posts BOTH legs
- [ ] voucher balances

## Rationalizations (don't)
| Excuse | Reality |
|---|---|
| "Small rate change, skip the property test." | Rates feed every invoice; an exhaustive case is not enough — add the fast-check invariant. |
| "I know the SAF-T code." | Load it from the committed lists; memory drifts and the code list is versioned. |
| "Net cash is zero on reverse charge, one leg is fine." | Both legs must appear on the MVA-melding. Post both. |

## Red flags — STOP
- A conditional on MVA status outside the single posting function. A hardcoded VAT/account number.
  A voucher that doesn't balance. Output VAT on an `under_threshold`/`unntatt` org.

## Done means (evidence required)
- [ ] `pnpm --filter @saldo/domain test` green, incl. a fast-check property for the invariant
- [ ] `vat-reviewer` subagent run with no violations
