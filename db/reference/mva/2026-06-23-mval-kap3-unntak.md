# mval kap. 3 — sektorunntak (sector exemptions) — primary-source capture

Verbatim capture of the chapter-3 *unntak* (turnover outside the VAT Act) sections that decide whether a
whole **activity** is exempt — the dimension `vat-sectoral-exemptions` enforces (so a user can't charge
output VAT on an exempt supply). § 3-7 (kunst og kultur) has its own capture
(`2026-06-23-mval-3-7-kunst-kultur.md`) and is not repeated here. §§ 3-9/3-10 (public authority /
inter-state) are omitted — not activities a Saldo ENK performs. Statutory text is not copyright-protected
(åndsverkloven § 14) → quoted verbatim.

- **Source:** Lov om merverdiavgift (merverdiavgiftsloven), LOV-2009-06-19-58, kapittel 3, via Lovdata.
  https://lovdata.no/lov/2009-06-19-58/KAPITTEL_3 — retrieved 2026-06-23.

## § 3-2 Helsetjenester mv. (verbatim, first ledd)

> (1) Omsetning og formidling av helsetjenester er unntatt fra loven, herunder tjenester som
> a. omfattes av helse- og omsorgstjenesteloven og spesialisthelsetjenesteloven
> b. omfattes av tannhelsetjenesteloven, samt tanntekniske tjenester
> c. omfattes av folketrygdloven kapittel 5 og 10
> d. ytes av yrkesgrupper med autorisasjon eller lisens etter helsepersonelloven
> e. ytes av bedriftshelsetjenesten

*(Further ledd: kosmetisk kirurgi only when medically indicated and publicly funded (2); alternativ
behandling conditionally (3); goods/services as a natural part of the health service (4); hire of labour
for health services (5); equipment letting between health providers (6); tannteknikere (7); ambulanse (8).
Read the full section from the Lovdata URL if those edges are needed.)*

## § 3-4 Sosiale tjenester mv. (verbatim, first ledd)

> (1) Omsetning og formidling av sosiale tjenester er unntatt fra loven, herunder sosiale tjenester
> a. etter helse- og omsorgstjenesteloven og barnevernsloven
> b. som ytes i barne- og ungdomsinstitusjoner, fritidsklubber, feriekolonier og lignende
> c. som gjelder pass av barn

## § 3-5 Undervisningstjenester mv. (verbatim)

> (1) Omsetning og formidling av undervisningstjenester er unntatt fra loven.
> (2) Unntaket omfatter også andre varer og tjenester som omsettes som et naturlig ledd i ytelsen av
> undervisningstjenester.
> (3) Utleie av arbeidskraft der arbeidstakeren skal utøve undervisningstjenester er unntatt fra loven.
> (4) Servering fra elev- og studentkantiner er unntatt fra loven.

## § 3-6 Finansielle tjenester (verbatim)

> Omsetning og formidling av finansielle tjenester er unntatt fra loven, herunder
> a. omsetning av forsikringstjenester
> b. omsetning av finansieringstjenester, likevel ikke finansiell leasing
> c. utføring av betalingsoppdrag
> d. omsetning av gyldige betalingsmidler
> e. omsetning av finansielle instrumenter og lignende
> f. forvaltning av verdipapirfond
> g. forvaltning av investeringsselskap

## § 3-8 Idrett mv. (verbatim)

> (1) Omsetning av tjenester i form av adgang til enkeltstående idrettsarrangement er unntatt fra loven.
> Med enkeltstående idrettsarrangement menes idrettsarrangement som av den enkelte arrangør ikke blir
> arrangert mer enn én gang per år, og ikke i to eller flere år på rad. Det er et vilkår at
> avgiftssubjektet ikke er registreringspliktig for tjenester som gir noen rett til å overvære
> idrettsarrangementer.
> (2) Omsetning av tjenester i form av rett til å utøve idrettsaktiviteter er unntatt fra loven. Unntaket
> omfatter ikke omsetning og utleie av retten til å benytte idrettutøvere fra andre enn idrettslag mv.
> hvis idrettstilbud hovedsakelig er basert på ulønnet innsats.

## § 3-11 Fast eiendom (verbatim, ledd 1–2)

> (1) Omsetning og utleie av fast eiendom og rettighet til fast eiendom er unntatt fra loven. Unntaket
> omfatter også omsetning av varer og tjenester som leveres som ledd i utleien.
> (2) Følgende omsetning er likevel omfattet av loven:
> a. utleie av rom mv. og lokaler som nevnt i § 5-5 første og annet ledd, samt omsetning av varer og
> tjenester som nevnt i § 5-5 tredje ledd
> b. utleie av selskapslokaler i forbindelse med servering
> c. utleie av parkeringsplasser i parkeringsvirksomhet
> d. omsetning av rett til å disponere plass for reklame
> e. utleie av oppbevaringsbokser
> *(… f–l continue; notably k: utleie/omsetning omfattet av frivillig registrering etter § 2-3 — i.e.
> a voluntarily-registered let is TAXABLE, not exempt. Read the full ledd from the Lovdata URL.)*

**Implication for Saldo:** §§ 3-2/3-4/3-5/3-6/3-7/3-8/3-11(1) make whole *activities* unntatt — their
revenue carries **no output VAT and no input deduction**. The exemption is the **activity's**, so a single
ENK with both an unntatt activity and a taxable one has *delt virksomhet* (apportionment, § 8-2 — sequenced
to `vat-mixed-activity`). § 3-11(2) (esp. frivillig registrering, bokstav k) flips a let back to taxable.
