# ADR 0054 — Category-level VAT rounding at issue (EN 16931 BR-CO-17)

- **Status:** Accepted
- **Date:** 2026-07-03

## Context
A sales document's VAT total was the **sum of per-line roundings** (`roundØre(net × rate)` per line),
while the EHF/PEPPOL layer (and EN 16931 rule **BR-CO-17**) requires each VAT-category subtotal to be
the **category base × rate, rounded once**. The two disagree by up to ±1 øre per extra line in a
category (three 6-øre lines at 25 %: per-line Σ = 6 øre, category = 5 øre). Consequence: a perfectly
ordinary multi-line invoice could issue with a frozen `vat_ore` that the EHF validator then rejects
(BR-CO-17), or — had the EHF quietly recomputed — the XML would contradict the immutable document.
A real PEPPOL access point validates BR-CO-17 exactly, so a "±1 øre tolerance" documented on our side
would still bounce at the network boundary.

## Decision
**Freeze category-level VAT at issue.** The document's VAT is computed once per rate category —
`roundØre(Σ charging-line nets × rate)` — and summed; it is never the sum of per-line roundings.
One rule, applied everywhere the money surfaces:

- `invoiceTotals` / `vatBreakdown` (domain) compute the category-level figures at issue;
- `deriveSalesInvoice` merges each output-VAT leg's **bases** and rounds once per merged leg, so the
  AR voucher ties out to the document by construction;
- `frozenVatBreakdown` recomputes the same figure from the frozen line nets (a stored non-zero line
  VAT marks the line as charging), so PDF/EHF rendering ties out to the stored totals;
- the browser preview groups by rate and applies the same math (client stays authoritative for nothing).

Per-line `vat_ore` stays stored as `roundØre(line net × rate)` — display/audit detail. It may sum to
±n øre off the document total; the document and ledger totals are the category-level truth.

## Consequences
- EHF output satisfies BR-CO-17/BR-CO-14/BR-CO-15 exactly; no tolerance window, no divergent XML.
- The AR voucher's per-rate output-VAT legs equal the document's per-category VAT exactly.
- The line VATs are no longer guaranteed to sum to the document VAT (max drift: ½ øre per charging
  line). The rendered documents show the per-category breakdown, not a per-line VAT column, so no
  user-visible contradiction.
- Already-issued documents are untouched (immutable); the rule applies from issue-time forward.

## Alternatives considered
- **Keep per-line rounding, document a ±1-øre tolerance** — rejected: PEPPOL/VEFA validate BR-CO-17
  exactly; a tolerance on our side just moves the failure to the access point.
- **Recompute category VAT only in the EHF layer** — rejected: the XML would state totals that differ
  from the immutable invoice and the posted ledger; the system of record must have one truth.
