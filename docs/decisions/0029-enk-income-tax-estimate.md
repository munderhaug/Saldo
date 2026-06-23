# ADR 0029 — ENK income-tax estimate: model and stated assumptions

- **Status:** Accepted
- **Date:** 2026-06-23

## Context
The honest-number reveal (experience-principles §6, `honest-number.ts`) needs an estimated personal income
tax to fence off from the spendable headline. Until now that figure was **injected** — no committed tax
source existed, and the source-grounding rule (AGENTS.md) forbids inventing rates from memory. The 2026
rates are now captured (`db/reference/skatt/`, distilled in `docs/regulatory/skatt-enk-personskatt.md`), so
`feat-tax-estimate` can compute it. But an ENK owner's *exact* tax depends on facts Saldo does not have
early in the year (other income, capital basis, residence, wealth). The estimate must define **what it
models and what it deliberately omits**, and record it — this is a number shown to a user about their tax.

## Decision
Ship a **pure, deterministic, conservative estimate** keyed on a single input — estimated annual business
profit `P` (næringsinntekt) — computed from the committed 2026 rate table:

`estimate(P) = skatt på alminnelig inntekt + trinnskatt + trygdeavgift`, where
- **alminnelig inntekt:** `22 % · max(0, P − personfradrag)` (personfradrag 114 540 kr);
- **trinnskatt:** the five marginal brackets on `P` (gross personinntekt, no personfradrag);
- **trygdeavgift:** `0` if `P ≤ 99 650`, else `min(10,8 % · P, 25 % · (P − 99 650))`.

Rates/brackets/thresholds live in `tax/params.ts` keyed by **tax year** (fail-closed for years not
captured), mirroring `saft/rates.ts`. The logic in `tax/income-estimate.ts` is integer-øre throughout.

**Stated simplifying assumptions** (the estimate is a "set aside", not an assessment):
1. The owner has **no other personinntekt or alminnelig inntekt** (other income would consume personfradrag
   and lift the marginal brackets).
2. **Beregnet personinntekt ≈ alminnelig næringsinntekt ≈ profit** — no skjermingsfradrag / capital
   adjustment (foretaksmodellen, sktl. §§ 12-10 ff).
3. **Klasse 1, full-year resident, mainland** — Finnmark/tiltakssonen (18,5 % alminnelig inntekt) excluded.
4. **No formuesskatt**; no deductions beyond personfradrag.

The estimate is **deliberately biased to set aside slightly too much** (mainland rate, single-source
stacking), consistent with honest-number flooring spendable at zero.

## Consequences
- The honest number runs on a **grounded** figure; `honestNumber`'s `estimatedTax` input is now produced by
  `estimateEnkIncomeTax`, not hand-injected. No change to `honest-number.ts` itself (it already takes the
  estimate as an input) — the integration is at the future aggregation layer (`feat-honest-number-surface`).
- A yearly rate change is a **data change + a new dated capture**, not a code change (the params table).
- Deterministic and not an AI system (ADR 0028); exhaustively + property tested against an independent
  hand-computed oracle.
- **Accepted cost:** the estimate diverges from the assessment for owners with mixed income, significant
  business capital, Finnmark residence, or wealth tax. Each is a recorded assumption and a clean future
  increment, not a hidden gap. The page and the function carry the caveats.

## Alternatives considered
- **Keep injecting the number.** Rejected — leaves the product's emotional core ungrounded; the source is
  now available.
- **Full assessment fidelity** (skjermingsfradrag, mixed income, wealth tax, region). Rejected for now —
  needs inputs Saldo lacks early-year and far more source capture; sequenced as later increments. A precise
  but mostly-guessed model is less honest than a simple model with explicit, conservative assumptions.
- **Hardcode rates in the function.** Rejected — violates the source-grounded invariant; rates belong in a
  cited, dated table (`tax/params.ts` ↔ `db/reference/skatt/`).
