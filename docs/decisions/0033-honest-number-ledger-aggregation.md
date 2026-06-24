# ADR 0033 — Honest-number ledger aggregation + reveal surface

- **Status:** Accepted
- **Date:** 2026-06-24

## Context
The honest-number reveal ("what's actually yours", experience-principles §6) is the emotional payoff
of org onboarding. The pure domain (`honest-number.ts`, ADR pre-existing) already composes
pre-aggregated øre into a spendable headline, and `estimateEnkIncomeTax` (ADR 0029) is source-grounded.
What was missing: a tenant-scoped query that turns the posted ledger into those aggregates, the pure
bridge that wires the tax estimate in, and the reveal UI.

Two forces shaped this:
1. **How to derive the aggregates correctly.** A sales line books revenue (kontoklasse 3) AND output
   VAT (kontoklasse 2), and *both* postings carry the line's SAF-T tax code (`posting/derive.ts`). So
   keying the VAT totals off `vat_code.direction` alone double-counts the net revenue.
2. **The ledger is empty.** No invoicing/voucher-entry surface exists yet, so the aggregation is zero
   until there is posting data. The reveal must ship without first building a whole posting surface.

## Decision
**Aggregate by kontoklasse + VAT direction.** A posting's economic role is its account's
`account.type` (the kontoklasse, source-grounded in the committed kontoplan — never a hardcoded account
number). `db/ledger.server.ts#aggregateLedger` sums one fiscal year's **posted** vouchers into four
totals: net revenue (type `revenue`), net expense (type `expense`), and the VAT legs restricted to the
liability accounts (type `equity_liability`) split by `vat_code.direction` (`output` / `input`). It is
read through `withUserOrg` + RLS, exactly like `readOrgOverview` — no cross-tenant assumption.

**The bridge is pure domain.** `honest-number/from-ledger.ts#honestNumberFromLedger` composes the
totals: `income = revenueNet + outputVatCollected` (the gross "taken in" the §6 narrative speaks),
`profit = revenueNet − expenseNet` feeds `estimateEnkIncomeTax(profit, year).total`, and the result
flows into `honestNumber`. It is the user's **own arithmetic over their own ledger** — explicitly NOT
creditworthiness or profiling of a natural person (ADR 0022 / AI Act Annex III §5(b)), and NOT an AI
feature (no LLM, no inference). Kept that way deliberately.

**Ship the reveal against a real-but-empty (seedable) ledger; sequence a posting surface next**
(option (a), not (b)). The aggregation is genuine and proven by a Testcontainers integrity test that
seeds posted vouchers; it simply returns zero until posting data exists, which the "You're caught up"
empty state on `home.tsx` handles honestly. A minimal manual-voucher/posting slice is tracked as the
explicit follow-up task `feat-manual-voucher-entry` rather than folded into this `M`-sized change.

## Consequences
- Income/expense/VAT separate cleanly without hardcoded account numbers, surviving any org's chart.
- The composition arithmetic lives in tested domain code (exhaustive + fast-check), not an untested
  loader; the query/RLS path has a Testcontainers test (drafts excluded, year-scoped, RLS-isolated).
- Reverse-charge/import VAT will contribute both legs symmetrically *once that derivation lands*
  (`.claude/rules/vat.md`); until then no voucher produces those legs, so nothing is silently wrong.
- The reveal is live but shows zero until `feat-manual-voucher-entry` produces data — accepted, and
  surfaced to the user as a calm empty state rather than a fake number.
- Active-org selection is out of scope: home reveals the alphabetically-first org with a "switch
  business" link; a persisted active org stays `feat-org-active-context`.

## Alternatives considered
- **(b) Pull a posting/invoicing slice into this PR first.** Rejected: it balloons an `M` task into a
  large multi-surface change (action, voucher/posting inserts, period creation, rules-engine wiring,
  more integrity tests), violating the surgical-changes discipline. Sequenced as its own task instead.
- **Key VAT totals off `vat_code.direction` only.** Rejected: double-counts net revenue, since the
  revenue line carries the output code too.
- **Hardcode the VAT account numbers (2700/2710).** Rejected: violates the "never hardcode accounts
  from memory" invariant; `account.type` + direction is source-grounded and chart-agnostic.
- **Reconstruct income from cash/receivable postings.** Rejected: depends on bank/AR posting
  conventions; `revenueNet + outputVatCollected` is the robust accrual reconstruction and is documented.
