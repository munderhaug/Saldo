# MVA-melding (VAT return) — format, codes and validation

**verify-by: 2026-12-31**

The **MVA-melding** (skattemelding for merverdiavgift) is the periodic VAT return a registered business
self-assesses under *skatteforvaltningsloven* § 8-3. Since 2022 it is **code-based**: instead of a fixed
set of numbered boxes, every figure is reported against a **SAF-T standard VAT code** — the same code
list Saldo already posts against (`db/reference/saf-t/tax-codes/`). This page is the cited, dated
description the domain generator (`@saldo/domain/mva-melding`) and the validator implement.

## The document
- Root `mvaMeldingDto` in namespace
  `no:skatteetaten:fastsetting:avgift:mva:skattemeldingformerverdiavgift:v1.0` (schema committed under
  `db/reference/skatt/mva-melding/xsd/`).
- `skattegrunnlagOgBeregnetSkatt` carries the **skattleggingsperiode** (term), the total
  **`fastsattMerverdiavgift`**, and one **`mvaSpesifikasjonslinje`** per (code, leg).
- A line is `mvaKode` + optional `grunnlag` (basis) + optional `sats` (rate) + `merverdiavgift` (the
  booked VAT amount). `betalingsinformasjon.kundeIdentifikasjonsnummer` is the KID for a payable;
  `skattepliktig.organisasjonsnummer` is the 9-digit org number; `meldingskategori` is `alminnelig` for
  an ordinary ENK (`omvendtAvgiftsplikt`, `primaernaering`, `kompensasjon`, `eHandel` are the others).

## The line sign rule (verified against the committed example)
| Case | `grunnlag` | `sats` | `merverdiavgift` |
|---|---|---|---|
| Output VAT (codes 3, 31–33) | yes (turnover net) | yes | **positive** |
| Deductible input VAT (codes 1, 11–15) | — | — | **negative** |
| Zero-rated / exempt turnover (5, 6, 51, 52) | yes | 0 | 0 |
| Reverse charge (snudd avregning, 81–92) | yes (the import/service basis) | yes | output **+**, deduction **−** |

`fastsattMerverdiavgift` is **exactly the signed sum of every line's `merverdiavgift`** (output minus
deductible input). This is verifiable: the all-cases example
(`db/reference/skatt/mva-melding/examples/eksempelMedAlleTilfeller.xml`) sums its 34 lines to its
declared total `77511`.

## Rates (`sats`)
The `sats` code list is `0`, `11,11`, `12`, `15`, `25` (Norwegian comma decimal). These are the same
percentages as `docs/regulatory/mva-rates.md`, expressed as the melding's string form.

## Terms (skattleggingsperiode)
Default cadence is **six bimonthly terms** (`januar-februar` … `november-desember`). A business with
turnover under 1 million NOK may apply for an **annual term** (`aarlig`, *årstermin*) — the common case
for a small ENK. The schema also allows monthly, three-/six-month, half-month and weekly periods (out of
scope). Saldo generates the **annual årstermin** today (the ledger's fiscal period is year-level); the
domain term model already encodes the bimonthly terms, and wiring them needs a per-voucher document date
(*bilagsdato*) — a noted follow-up.

## How Saldo generates it (ties out to the ledger)
The melding is **read-only** over the posted ledger — it books nothing. The figures are aggregated from
the posted vouchers on the SAF-T VAT code each line already carries:
- `grunnlag` per code = the net basis on the revenue (klasse 3) / cost (klasse 4–7) lines carrying it;
- `merverdiavgift` per code = the signed VAT on the klasse-2 VAT-account legs carrying it (output
  credited → +, input debited → −).
- `fastsattMerverdiavgift` = Σ `merverdiavgift` = the same `outputVatCollected − deductibleInputVat`
  the honest-number reveal uses. Every figure traces to a posting; nothing is re-derived divergently.

The **MVA-status fork** governs whether a melding exists at all: `registered_standard` /
`registered_zero_rated` produce one; `under_threshold` / `unntatt` do not (an unregistered org files no
VAT return).

> **Reverse-charge posting note (ADR 0044).** Saldo routes the self-accounted reverse-charge *output*
> leg to the rate's plain output code (e.g. `3`) and the cost + deduction legs to the reverse-charge
> code (e.g. `86`). Both legs therefore appear on the melding and the total ties out exactly;
> Skatteetaten's example instead co-locates both legs under the reverse-charge code. The figures and
> the payable are identical either way; per-line co-location is a presentational refinement.

## Validation
Skatteetaten offers a **free validation API** for the melding, but it is **onboarding-gated** (it needs
ID-porten / Maskinporten scopes granted to the system supplier) and requires egress. Saldo wires it
behind a fail-closed, EU-resident integration client
(`apps/web/app/integrations/skatteetaten/`), but does not assume live egress: the generator is proven by
a local, grounded validator (`validateMvaMelding`) + XML well-formedness + the exact tie-out (the
`pnpm mva:validate` gate, the same precedent as `ehf:validate`). Full XSD validation against the
committed schema and the live validation API land with onboarding. **Submission** (Altinn 3 / ID-porten)
is the separate `feat-altinn-mva-submission` (Phase 9) and is out of scope here.

## Sources
- Skatteetaten, *mva-meldingen* documentation & schema repository (the `mvaMeldingDto` XSD v1.0, the
  `sats` / `mvaSpesifikasjon` code lists, and the worked example files) — captured 2026-06-26 under
  `db/reference/skatt/mva-melding/`.
- *Skatteforvaltningsloven* § 8-3 (egenfastsetting av merverdiavgift) — the legal basis cited in the
  schema annotation.
- *Merverdiavgiftsloven* / *merverdiavgiftsforskriften* on term cadence and the annual-term threshold;
  cross-referenced with `docs/regulatory/mva-rates.md` for the rate figures.
