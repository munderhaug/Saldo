# ADR 0044 — Reverse-charge dual-leg posting + non-deductible VAT, and the sales-line gate

- **Status:** Accepted
- **Date:** 2026-06-25

## Context
ADR 0043 closed the invoicing → ledger loop but left a deliberate gap (`vat-reverse-charge`): a
reverse-charge transaction (snudd avregning) was not posted as the dual leg Norwegian VAT requires,
and `checkSalesLine` let *every* reverse-charge SAF-T code onto a sales document as a non-blocking
advisory — including the buyer-self-account purchase codes (81/82/86/87/91/92), which never belong on
a sale. Build-spec §4.3 and `.claude/rules/vat.md` require that a reverse-charge purchase post BOTH an
output and an input leg so both land on the MVA-melding even when net cash is zero, and that
non-deductible-even-when-registered cases (representasjon, restricted vehicle costs, private-use
portion, and the `uten fradragsrett` SAF-T codes) book the VAT to cost rather than deduct it.

A tension had to be resolved first: the task framing asked for "an issued reverse-charge document
[to post] the correct dual-leg voucher (not revenue-at-net)". But the dual leg is fundamentally a
**buyer-side (purchase)** phenomenon. The only genuine reverse-charge **sale** code is 51
(`Innenlandsk omsetning med omvendt avgiftplikt`): the seller invoices net and the *buyer*
self-accounts, so the seller correctly posts **revenue at net with no VAT leg** — exactly as ADR 0043
already states. So the work splits cleanly into a purchase-side dual leg and a tightened sales gate;
the seller side stays revenue-at-net (confirmed correct, not a gap).

## Decision
- **Dual-leg reverse-charge purchase in the pure domain.** New `deriveReverseChargePurchase`
  (`packages/domain/src/posting/derive.ts`) posts, when the org is in the VAT system
  (`chargesOutputVat`): a self-accounted **output** leg (the VAT owed) ALWAYS, plus — when deductible
  — an **input** leg (the VAT reclaimed); net cash is just the supplier's net. Non-deductible folds
  the irrecoverable VAT into cost (gross→cost) while still posting the output leg. Outside the VAT
  system (`under_threshold`/`unntatt`) or a zero-rate code → a plain net purchase, no melding legs.
  The MVA-status fork lives in this one function (the hard invariant); it never treats a
  reverse-charge code as an ordinary single-leg input/output. Always balanced by construction.
- **Deductibility from the committed SAF-T classification, never memory.** `reverseChargeInputDeductible`
  (`med fradragsrett` → `direction === 'input'`; `uten fradragsrett` → `direction === 'none'`) and
  `reverseChargeKind` (foreign services / import goods / domestic, from the Norwegian description)
  drive deductibility and the VAT-account choice. The non-deductible *business* cases (representasjon,
  vehicle, private use) are not SAF-T-coded — the caller passes `deductible: false`, exactly as the
  ordinary `derivePurchase` fork already accepts.
- **Tightened sales-line gate.** `checkSalesLine` now decides every reverse-charge code: the domestic
  RC **sale** (51, `direction === 'output'`) is allowed and posts revenue at net; every
  buyer-self-account **purchase** code is blocked with `reverse-charge-not-a-sale`. The advisory
  `reverse-charge-deferred` reason is gone from the sales path (the gate decides, it no longer defers).
- **Source-grounded accounts + a posting path.** `REVERSE_CHARGE_ACCOUNTS` (output 2704–2709 / input
  2714–2718, by kind+rate) and `REVERSE_CHARGE_OUTPUT_CODES` are designated in `posting.server.ts` and
  verified against the committed kontoplan by `posting-accounts.test.ts`. `recordReverseChargePurchase`
  runs the same derive → rules → posted chain as the manual path (shared `insertPostedVoucher`). The
  self-account leg carries an output-direction code and the deduction leg an input-direction code, so
  the honest-number aggregation (which keys VAT off `vat_code.direction` on liability accounts) counts
  **both** legs — output collected and input deducted, netting to zero when fully deductible.
- **Reconciled with ADR 0043's posting path.** No change to `deriveSalesInvoice`/`postIssuedVoucher`
  for code 51 (revenue-at-net is correct); the tightened gate means the purchase codes can no longer
  reach the sales posting at all. The integrity test that previously issued code 81 on a sale now
  asserts it is **blocked**, and a new case proves code 51 posts revenue-at-net.

## Consequences
- A reverse-charge purchase is now postable as a balanced dual-leg voucher whose output and input legs
  both appear on the MVA basis — the honest-number reveal nets them correctly (zero when deductible),
  and a non-deductible reverse charge books the VAT as a real cost. A buyer-self-account code can no
  longer be issued on a sales document.
- Covered by exhaustive + fast-check domain tests (`derive.test.ts`, `tax-codes.test.ts`,
  `invoice.test.ts`) and Testcontainers integrity tests driving `recordReverseChargePurchase` and the
  invoice path through the `saldo_app` role under RLS (both legs balanced, both on the MVA basis, the
  sales gate enforced).
- **`recordReverseChargePurchase` is a posting primitive, not yet a UI.** Supplier-invoice entry
  (`feat-supplier-invoices`) builds the route/UI on top of it; this slice ships the domain derivation,
  the gate, and the proven posting path it depends on.
- **Known limitations (documented, sequenced):** below-threshold § 3-30 self-accounting on
  foreign-service purchases is deferred to `vat-threshold-watcher` (an unregistered org books the net
  to cost here). The self-account output leg reuses the ordinary domestic output codes (3/31/33) —
  correct for the direction-based aggregation; a future MVA-melding box mapping should key off the VAT
  *account* (2704/2705/2707, which already encodes the kind) rather than the code.

## Alternatives considered
- **Making an issued reverse-charge SALE post a dual leg ("not revenue-at-net").** Rejected: it
  mis-states the seller's MVA-melding. A Norwegian domestic reverse-charge seller invoices net and the
  *buyer* self-accounts; revenue-at-net is correct (ADR 0043). The dual leg is the buyer's, posted via
  the purchase path. Confirmed with the owner before implementing.
- **Tagging both VAT legs with the single reverse-charge code (e.g. 86) and teaching the aggregation
  to split output vs input by account number.** Rejected as a larger, account-number-based change to a
  deliberately direction-keyed aggregation; tagging the output leg with an output-direction code keeps
  the aggregation untouched and source-grounded.
- **Overloading `derivePurchase` with a reverse-charge mode.** Rejected: the dual leg is a distinct
  shape; a separate, clearly-named function keeps the single-leg input-VAT fork pristine.
- **Building the supplier-invoice entry UI now.** Out of scope (`feat-supplier-invoices`); shipping a
  speculative UI ahead of its feature violates surgical-change discipline.
