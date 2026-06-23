# ADR 0030 — Sectoral VAT exemptions: the activity dimension, revenue gate first

- **Status:** Accepted
- **Date:** 2026-06-23

## Context
ADR 0027 lifted VAT treatment to the line (its SAF-T code), and `checkVatLine` gates code↔registration. But
a whole class of mistakes survives that gate: applying VAT to an activity that is **unntatt by sector**.
Norwegian law (merverdiavgiftsloven kapittel 3) places whole activities outside the VAT Act — helse (§ 3-2),
sosiale (§ 3-4), undervisning (§ 3-5), finansielle (§ 3-6), kunst/kultur (§ 3-7), idrett (§ 3-8), utleie av
fast eiendom (§ 3-11) — so their revenue may never carry output VAT, **however the org is registered**. A
registered consultant who also teaches must not charge VAT on the teaching line. `checkVatLine` cannot catch
this: it only knows registration, not the supply's sector. An **activity** dimension is needed.

Encoding all of kap. 3 + the reduced-rate scope (kap. 5) + delt-virksomhet apportionment (§ 8-2) at once is
large and partly needs sources not yet captured. The open question is how much to enforce now.

## Decision
Introduce **`VatActivity`** — a per-line property (consistent with ADR 0027's per-line model) — and gate the
**revenue side only** in this increment:

- `VatActivity` = the kap. 3 *unntak* sectors a Saldo ENK realistically performs (`helse`, `sosiale`,
  `undervisning`, `finansielle`, `kunst-kultur`, `idrett`, `utleie-fast-eiendom`) + `avgiftspliktig`
  (the VAT-liable catch-all). The named sectors are grounded in the captured statute, not invented.
- `checkVatActivityLine(activity, code)` blocks two revenue mistakes: an **exempt-sector line coded as
  output/fritatt VAT**, and a **taxable line coded *unntatt*** (code 6). It **composes** with
  `checkVatLine` — a line is valid only if both pass.
- **Explicitly out of scope (sequenced):** reduced-rate (12 %/15 %) sector↔rate matching (mval kap. 5) and
  input-VAT apportionment for a mixed business (forholdsmessig fradrag, § 8-2) → `vat-mixed-activity`;
  reverse charge → `vat-reverse-charge`. The activity gate therefore does **not** decide input-deductible,
  reverse-charge, or no-treatment codes — it passes them.
- Rule-engine wiring (a `vatActivityRule` over a voucher) and a DB per-line activity field await a line-model
  change; this increment ships the pure, tested gate (mirroring how `checkVatLine` shipped before its rule).

## Consequences
- The most damaging, most common sector mistake — charging VAT on an exempt supply (the § 3-7 musician
  problem, generalised to health/education/finance/sport/letting) — is caught deterministically at the line,
  with a cited reason. Pure, exhaustive + property tested against the committed code list.
- The model is **extensible**: reduced-rate sectors and apportionment slot onto `VatActivity` + the gate
  when their sources are captured. No rework of the registration gate.
- **Accepted costs / boundaries:** (1) activity is not yet on the voucher/DB line model, so nothing is
  enforced end-to-end until that lands; (2) sub-conditions inside a sector (kosmetisk kirurgi medical
  indication; § 3-11(2) frivillig registrering flipping a let to taxable) are documented but not encoded —
  the gate works at the activity level and the user picks the right activity; (3) reduced-rate over-charging
  (25 % where 12 % applies) is not caught yet — sequenced, and less harmful than illegal VAT on an exempt
  supply; (4) domestic reverse-charge *turnover* (SAF-T code 51, direction output) is classified as
  reverse-charge and so escapes the revenue gate — an exempt-sector line carrying it is not blocked yet
  (deferred to `vat-reverse-charge`). The gate is sound for all single-leg output/fritatt codes.

## Alternatives considered
- **Encode kap. 3 + kap. 5 + § 8-2 in one task.** Rejected — large, and reduced-rate scope and § 8-2 rulings
  are not captured; would mix grounded and un-grounded work. Sequencing keeps each increment source-clean.
- **Fold sectoral logic into `checkVatLine`.** Rejected — registration and activity are independent axes; a
  separate, composable gate keeps each rule single-purpose and testable (and matches the rules-engine shape).
- **A coarse exempt/taxable boolean instead of named sectors.** Rejected — naming the sector lets Saldo
  explain *why* (cite § 3-5) and is the basis the law itself uses; the boolean would lose the provenance.
- **Model activity as the NACE code.** Rejected for now — NACE is registration metadata, not a VAT category;
  the mapping NACE→VAT-treatment is itself non-trivial. A small grounded enum is the honest first step.
