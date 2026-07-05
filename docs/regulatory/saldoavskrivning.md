# Saldoavskrivning — declining-balance depreciation (sktl. § 14-43)

**verify-by: 2026-12-31**

The tax depreciation model for an ENK's driftsmidler: each asset (or pooled group) sits in a
**saldogruppe**, and the year's deduction is the group's fixed rate applied to the declining
balance. The 2026 rates, from Skatteetaten's satser page (raw capture cited below):

| Gruppe | Omfatter | Sats 2026 |
|---|---|---|
| a | kontormaskiner o.l. | 30 % |
| b | ervervet forretningsverdi | 20 % |
| c | vogntog, lastebiler, busser, varebiler mv. | 24 % |
| d | personbiler, maskiner og inventar mv. | 20 % |
| e | skip, rigger mv. | 14 % |
| f | fly, helikopter | 12 % |
| g | anlegg for overføring/distribusjon av elektrisk kraft mv. | 5 % |
| h | bygg og anlegg, hoteller mv. | 4 % (husdyrbygg 6 %; brukstid ≤ 20 år 10 %) |
| i | forretningsbygg | 2 % |
| j | tekniske installasjoner i forretningsbygg og andre næringsbygg | 10 % |

For a sub-500k ENK the relevant groups are in practice **a** (office machines), **c** (varebil) and
**d** (personbil/maskiner/inventar).

## What Saldo encodes (and what it deliberately does not, yet)

- The **rate table** is data keyed by year in `@saldo/domain` (`tax/saldo-depreciation.ts`),
  fail-closed for uncaptured years — the `tax/params.ts` pattern (ADR 0029). A yearly rate change
  is a new dated capture + a data row, never a code edit.
- The **schedule** function computes the declining balance year by year: deduction =
  `roundØre(rate × opening balance)`; closing = opening − deduction.
- **Not yet encoded (needs its own captured source before any code):** the § 14-40 straksfradrag
  for driftsmidler under 15 000 kr, the § 14-47 full write-off of a rest-saldo under 15 000 kr, and
  the first-year rules for assets acquired mid-year. The satser capture does not state them; encode
  only when the statutory text is captured.
- **No asset register exists yet** (`feat-asset-register` in the backlog): the schedule function is
  pure and grounded now so the register becomes persistence + UI, not tax logic.

## Sources
- Skatteetaten, "Avskrivningssatser" (satser page, 2026 selected), 2026-07-05. Raw:
  db/reference/skatt/2026-07-05-avskrivningssatser.html. verify-by: 2026-12-31
