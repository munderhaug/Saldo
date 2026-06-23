# Stortingets skattevedtak 2026 — income-tax rates (primary-source capture)

Raw capture of the income-tax rate provisions an *enkeltpersonforetak* owner is taxed under: the
bracket tax (trinnskatt), the components that sum to the 22 % rate on ordinary income (alminnelig
inntekt) for a **person**, and the personal allowance (personfradrag). Captured because the
honest-number "set aside" estimate (`feat-tax-estimate`) must be grounded in committed rates, never
model memory (AGENTS.md invariant). Norwegian statutory text is not copyright-protected (åndsverkloven
§ 14), so it is quoted verbatim.

- **Source:** Stortingsvedtak om skatt av inntekt og formue mv. for inntektsåret 2026 (Stortingets
  skattevedtak), FOR-2025-12-18-2747, via Lovdata.
  https://lovdata.no/dokument/STV/forskrift/2025-12-18-2747 — retrieved 2026-06-23.

## § 3-1 Trinnskatt (verbatim)

> Personlig skattyter i klasse 0 og 1 skal av personinntekt fastsatt etter skatteloven kapittel 12,
> svare trinnskatt til staten med
> – 1,7 pst. for den delen av inntekten som overstiger 226 100 kroner,
> – 4,0 pst. for den delen av inntekten som overstiger 318 300 kroner,
> – 13,7 pst. for den delen av inntekten som overstiger 725 050 kroner,
> – 16,8 pst. for den delen av inntekten som overstiger 980 100 kroner, og
> – 17,8 pst. for den delen av inntekten som overstiger 1 467 200 kroner.
>
> Dersom skattyter er bosatt i riket bare en del av året, nedsettes beløpene i første ledd
> forholdsmessig under hensyn til det antall hele eller påbegynte måneder av året han har vært bosatt
> her. *(remainder on part-year/non-resident not captured — re-read from the Lovdata URL if needed.)*

Trinnskatt is on **personinntekt** (gross — no personfradrag), in five marginal steps. The 2026 § 3-1
text carries **no separate Finnmark/tiltakssonen trinnskatt rate** (only the part-year proportional rule).

## § 3-2 Fellesskatt (verbatim, the components of "alminnelig inntekt" for a person — part 1/2)

> Enhver som plikter å betale inntektsskatt til kommunen etter skatteloven, skal betale fellesskatt til
> staten. Fellesskatten skal beregnes på samme grunnlag som inntektsskatten til kommunene.
>
> Satsen for fellesskatt skal være:
> – For personlig skattepliktig og dødsbo i Finnmark fylke eller kommunene Karlsøy, Kvænangen, Kåfjord,
> Lyngen, Nordreisa, Skjervøy og Storfjord i Troms fylke: 4,75 pst.
> – For personlig skattepliktig og dødsbo ellers: 8,25 pst.

## § 3-3 Skatt til staten (verbatim — NB: this 22 % is the *company* rate, NOT a person's)

> Selskaper og innretninger som nevnt i skatteloven § 2-36 annet ledd, svarer skatt til staten med
> 22 pst. av inntekten.

This paragraph governs **selskaper** (companies). An ENK owner is a *person* — their 22 % on alminnelig
inntekt is the **sum of fellesskatt (§ 3-2) + kommunal + fylkeskommunal skatt (§ 3-8)**, not § 3-3.

## § 3-8 Inntektsskatt til kommunene og fylkeskommunene (verbatim, components part 2/2)

> Den fylkeskommunale inntektsskattøren for personlige skattytere og dødsbo skal være maksimum 2,40 pst.
> Den kommunale inntektsskattøren for personlige skattytere og dødsbo skal være maksimum 11,35 pst.
>
> Maksimumssatsene skal gjelde med mindre fylkestinget eller kommunestyret vedtar lavere satser.

**Combined alminnelig-inntekt rate for a person (mainland):** 8,25 + 11,35 + 2,40 = **22,00 %**.
For Finnmark/tiltakssonen the fellesskatt component is 4,75 %, giving 4,75 + 11,35 + 2,40 = **18,50 %**.

## § 6-1 Minstefradrag (verbatim — NB: applies to lønn/pensjon, NOT næringsinntekt)

> Minstefradrag i lønnsinntekt mv. etter skatteloven § 6-32 første ledd bokstav a skal ikke settes
> høyere enn 95 700 kroner.
> Minstefradrag i pensjonsinntekt etter skatteloven § 6-32 første ledd bokstav b skal ikke settes
> høyere enn 75 400 kroner.

Minstefradrag is a standard deduction in **lønn/pensjon** only (sktl. § 6-32). A pure-næringsinntekt
ENK gets **no** minstefradrag — its deductions are the actual business costs already netted into profit.

## § 6-3 Personfradrag (verbatim)

> Fradrag etter skatteloven § 15-4 er 114 540 kroner i klasse 1.

Personfradrag is a deduction in **alminnelig inntekt** (class 1: 114 540 kr for 2026). It does **not**
reduce the base for trinnskatt or trygdeavgift (those are on personinntekt).
