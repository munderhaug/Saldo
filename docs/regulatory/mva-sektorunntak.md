# Sectoral VAT exemptions (mval kap. 3) — which whole *activities* are *unntatt*

VAT treatment is not decided by the org's registration alone, nor by the SAF-T code alone — it depends on
the **activity** the supply belongs to. Norwegian law (merverdiavgiftsloven kapittel 3) places several
whole activities **outside the VAT Act** (*unntatt*): their revenue carries **no output VAT and no input
deduction**, whatever the provider's registration. A user who treats an exempt activity as taxable (charges
25 % on a health or teaching service) is wrong — and so is the reverse (booking VAT-liable turnover as
*unntatt*). This page states which activities are exempt, from the primary source, so Saldo can stop that
at the line.

Raw capture: `db/reference/mva/2026-06-23-mval-kap3-unntak.md` (+ the § 3-7 capture).

## The exempt sectors (kap. 3)

| Activity | mval | Note |
|---|---|---|
| **Helsetjenester** (health) | § 3-2 | incl. authorised health personnel, dental, occupational health |
| **Sosiale tjenester** (social) | § 3-4 | incl. child welfare, childminding |
| **Undervisningstjenester** (education) | § 3-5 | incl. goods/services as a natural part of teaching |
| **Finansielle tjenester** (financial) | § 3-6 | insurance, payments, securities — *not* financial leasing |
| **Kunst og kultur** (art/culture) | § 3-7 | the artistic performance + its integral parts — see `mva-kunstneriske-tjenester.md` |
| **Idrett** (sport) | § 3-8 | single events (≤ once/year) and the right to do sport activities |
| **Utleie av fast eiendom** (letting real property) | § 3-11 (1) | **unless** an exception in § 3-11 (2) applies |

*Unntatt*, not *fritatt*: there is no output VAT **and** no input-VAT deduction (contrast `mva-rates.md`;
the *unntatt*/*fritatt* split is in the spec glossary). The exemption attaches to the **activity**, so a
single ENK with both an exempt activity (e.g. teaching) and a taxable one (e.g. consulting) has **delt
virksomhet**, triggering proportional input deduction (forholdsmessig fradrag, § 8-2) — sequenced to
`vat-mixed-activity`, not asserted here.

### Edges worth knowing (not all encoded yet)
- **§ 3-11 (2) flips a let back to taxable** in listed cases — most importantly **frivillig registrering**
  (bokstav k, § 2-3): a voluntarily-registered commercial let *is* VAT-liable. Model that line as
  `avgiftspliktig`, not `utleie-fast-eiendom`.
- **Helse/sosiale/undervisning** have conditional sub-rules (kosmetisk kirurgi only when medically
  indicated; alternativ behandling; student-canteen serving) — captured verbatim; the gate treats the
  sector as exempt at the activity level and leaves these sub-conditions to the user/follow-up.

## Why it matters in Saldo (and what is enforced today)

- The pure gate `packages/domain/src/vat/activity.ts` — `checkVatActivityLine(activity, code)` — blocks the
  two revenue-side mistakes: an **exempt-sector line coded as output/fritatt VAT**, and a **taxable line
  coded *unntatt***. It composes with `checkVatLine` (registration): a line is valid only if **both** pass.
  The activity gate catches what registration cannot — a *registered* org may charge output VAT in general,
  yet still must not on a § 3-2 health line.
- **Scope today (ADR 0030):** the revenue/output gate only, for single-leg output/fritatt codes.
  **Reduced-rate (12 %/15 %) sector↔rate matching** (persontransport, overnatting, næringsmidler — mval
  kap. 5) and **input-VAT apportionment** for a mixed business (§ 8-2) are sequenced (`vat-mixed-activity`);
  reverse charge is `vat-reverse-charge`. One reverse-charge edge is therefore **not** gated yet: domestic
  reverse-charge *turnover* (SAF-T code 51) is classified as reverse-charge, so an exempt-sector line
  carrying it is not blocked here — that gating belongs to `vat-reverse-charge`. (Unrealistic for an exempt ENK.)
- VAT codes come from the committed SAF-T list (never memory); the treatment is derived, then gated.

This page is regulatory fact + the enforced scope; it does **not** claim Saldo implements apportionment or
reduced-rate validation today.

## Sources
- Lov om merverdiavgift (merverdiavgiftsloven) kap. 3 §§ 3-2, 3-4, 3-5, 3-6, 3-8, 3-11 (verbatim). Lovdata,
  https://lovdata.no/lov/2009-06-19-58/KAPITTEL_3.
  Raw: db/reference/mva/2026-06-23-mval-kap3-unntak.md. verify-by: 2026-12-31
- mval § 3-7 "Kunst og kultur mv." (the artistic-performance unntak). See `mva-kunstneriske-tjenester.md`.
  Raw: db/reference/mva/2026-06-23-mval-3-7-kunst-kultur.md. verify-by: 2026-12-31
- Reduced-rate scope (§§ 5-2/5-3/5-5 ff) and § 8-2 apportionment are **not yet captured**; capture them
  before encoding reduced-rate matching or forholdsmessig fradrag (`vat-mixed-activity`). verify-by: 2026-12-31
