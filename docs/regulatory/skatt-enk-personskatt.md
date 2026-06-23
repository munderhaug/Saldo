# ENK income tax — what a sole proprietor owes, and the honest "set aside" estimate

An *enkeltpersonforetak* (ENK) is **not** a separate taxable entity: the owner is taxed **personally** on
the business profit. So the honest-number reveal (experience-principles §6 — "what's actually yours")
cannot show a believable spendable figure without estimating that personal tax. This page states the
2026 rates from primary sources and defines the **estimate model** Saldo uses, so the number is grounded
and its simplifications are explicit — never invented from memory (AGENTS.md invariant).

Raw captures: `db/reference/skatt/` (verbatim statute).

## The three components of an ENK owner's income tax (2026)

A sole proprietor's profit `P` (næringsinntekt) is taxed in three stacked pieces:

| Component | Base | 2026 rate(s) | Allowance |
|---|---|---|---|
| **Skatt på alminnelig inntekt** | profit − deductions | **22 %** (fellesskatt 8,25 + kommune 11,35 + fylke 2,40) | personfradrag **114 540 kr** |
| **Trinnskatt** (bracket tax) | personinntekt (gross) | **1,7 / 4,0 / 13,7 / 16,8 / 17,8 %** | thresholds below |
| **Trygdeavgift** (national insurance) | personinntekt (gross) | **10,8 %** (næring, "høy sats") | nedre grense **99 650 kr**, 25 % phase-in |

**Trinnskatt thresholds (marginal, 2026):** 1,7 % over 226 100 · 4,0 % over 318 300 · 13,7 % over
725 050 · 16,8 % over 980 100 · 17,8 % over 1 467 200 kr.

Two facts that are easy to get wrong, and which the captures pin down:

- The **22 %** on a *person's* alminnelig inntekt is the **sum of fellesskatt + kommunal + fylkeskommunal
  skatt** (skattevedtak §§ 3-2, 3-8). The "22 pst." in § 3-3 is the **company** rate — not an ENK owner's.
- **Minstefradrag does not apply to næringsinntekt** (it is a lønn/pensjon standard deduction, sktl.
  § 6-32). A pure-business ENK deducts its actual costs (already in `P`), then personfradrag against
  alminnelig inntekt — nothing more.

The **trygdeavgift** has a floor and a ramp: **P ≤ 99 650 ⇒ 0**; above it the avgift is
`min(10,8 % · P, 25 % · (P − 99 650))` — the 25 % phase-in binds from 99 650 up to ≈ 175 440 kr, then the
flat 10,8 % governs (folketrygdloven § 23-3). This matters: many target ENKs earn in exactly that band.

## The estimate model (and its stated assumptions)

`feat-tax-estimate` computes a **forskuddsskatt-style "set aside"** from a single input — estimated
annual profit `P` — as `tax(P) = almInntektSkatt + trinnskatt + trygdeavgift`. It is deliberately a
**conservative estimate**, not an assessment. Its simplifying assumptions (recorded in **ADR 0029**):

1. **One income source.** The owner has no other personinntekt (lønn/pensjon) and no other alminnelig
   inntekt. Other income would consume personfradrag and push trinnskatt/trygdeavgift higher — so the
   estimate is a *lower bound on marginal stacking*, which the honest-number floors conservatively.
2. **Beregnet personinntekt ≈ alminnelig næringsinntekt ≈ profit.** No skjermingsfradrag /
   kapitalavkastning adjustment (foretaksmodellen, sktl. §§ 12-10 ff) — accurate for a service ENK with
   negligible business assets; it over-states personinntekt slightly when capital is significant.
3. **Klasse 1, full-year resident, mainland.** Finnmark/tiltakssonen (18,5 % alminnelig inntekt) is out
   of scope for now; using the mainland 22 % over-states tax there (safe for a "set aside").
4. **No formuesskatt** (wealth tax) and no deductions beyond personfradrag.

The real number is the skattemelding/forskuddsskatt assessment; this estimate exists so the spendable
headline is honest *today*, and it errs toward setting aside slightly too much rather than too little.

## Why it matters in Saldo

- The pure domain estimator `packages/domain/src/tax/income-estimate.ts` reads its rates from
  `tax/params.ts` (the cited, dated 2026 table — same pattern as `saft/rates.ts` for VAT). A yearly rate
  change is a **data change + a new dated capture here**, not a logic change.
- Its `total` is the `estimatedTax` that `honest-number.ts` consumes (today INJECTED). The estimator does
  not write to the ledger and is not an AI system (ADR 0028) — it is deterministic, exhaustively tested.
- All money is integer **øre**; bracket/phase-in math uses `mulRate`/`subØre`, rounded once (money rules).

## Sources
- Stortingets skattevedtak 2026 (FOR-2025-12-18-2747) — trinnskatt § 3-1, fellesskatt § 3-2, kommune/fylke
  § 3-8, personfradrag § 6-3, minstefradrag § 6-1. Lovdata,
  https://lovdata.no/dokument/STV/forskrift/2025-12-18-2747.
  Raw: db/reference/skatt/2026-06-23-stortingets-skattevedtak-2026.md. verify-by: 2026-12-31
- Avgifter til folketrygden 2026 (FOR-2025-12-18-2748) — trygdeavgift §§ 6–8 (næring 10,8 %). Lovdata,
  https://lovdata.no/dokument/STV/forskrift/2025-12-18-2748.
  Raw: db/reference/skatt/2026-06-23-trygdeavgift-2026.md. verify-by: 2026-12-31
- Folketrygdloven § 23-3 (LOV-1997-02-28-19) — sats-mapping (annet ledd) + nedre grense 99 650 kr / 25 %
  opptrapping (fjerde ledd). Lovdata, https://lovdata.no/lov/1997-02-28-19/§23-3.
  Raw: db/reference/skatt/2026-06-23-trygdeavgift-2026.md. verify-by: 2026-12-31
- Skatteetaten, "National insurance contributions — rates" (2026 figures cross-confirmed: nedre grense
  99 650, 25 % cap, næring 10,8 %). https://www.skatteetaten.no/en/rates/national-insurance-contributions/
  — copyrighted; used to confirm, not reproduced. verify-by: 2026-12-31
