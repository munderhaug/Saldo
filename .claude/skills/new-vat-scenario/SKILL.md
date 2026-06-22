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
