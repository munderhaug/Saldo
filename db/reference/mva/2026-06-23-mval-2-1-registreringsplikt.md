# mval § 2-1 — registreringsplikt (VAT registration threshold) — primary-source capture

Verbatim capture of merverdiavgiftsloven § 2-1, which sets the VAT-registration thresholds (50 000 kr
general; 140 000 kr for veldedige/allmennyttige) that drive Saldo's `mva_status` state machine. Statutory
text is not copyright-protected (åndsverkloven § 14) → quoted verbatim.

- **Source:** Lov om merverdiavgift (merverdiavgiftsloven), LOV-2009-06-19-58, § 2-1, via Lovdata.
  https://lovdata.no/lov/2009-06-19-58/§2-1 — retrieved 2026-06-23.

## § 2-1 Registreringsplikt (verbatim, ledd 1–3)

> (1) Næringsdrivende og offentlig virksomhet skal registreres i Merverdiavgiftsregisteret når omsetning
> og uttak som er omfattet av loven til sammen har oversteget 50 000 kroner i en periode på tolv måneder.
> For veldedige og allmennyttige institusjoner og organisasjoner er beløpsgrensen 140 000 kroner.
>
> (2) Ved omsetning av tjenester som gir noen rett til å overvære idrettsarrangementer, er beløpsgrensen
> for registrering 3 millioner kroner. For de to øverste divisjonene i fotball for menn og den øverste
> divisjonen i ishockey for menn gjelder første ledd.
>
> (3) Tilbydere som leverer varer omfattet av § 3-1 annet ledd og tjenester omfattet av § 3-30 som
> leveres til andre mottakere enn næringsdrivende eller offentlig virksomhet hjemmehørende i
> merverdiavgiftsområdet, skal registreres. Når leveransene skjer ved bruk av formidler, anses
> formidleren som tilbyder. Beløpsgrensen i første ledd gjelder.

_(Ledd (4)–(8) cover konkursbo / dødsbo continuation, foreign-business representatives, and the
ministry's regulation powers — not load-bearing for the ENK threshold. Read the full section from the
Lovdata URL if those edges are needed.)_

## Why it matters for Saldo

- First ledd is the **50 000 kr / rolling-12-month** general threshold and the **140 000 kr** charitable
  threshold that `docs/regulatory/mva-registration-threshold.md` cites and the `mva_status` fork relies on.
- The basis is "omsetning **og uttak** … **som er omfattet av loven**" — so turnover that is *unntatt*
  (outside the Act) does **not** count toward the threshold, while taxable and zero-rated (*fritatt*)
  turnover does. This is exactly the inclusion/exclusion the threshold-watcher must implement.
