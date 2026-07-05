# MVA-melding innsending via Altinn 3 — raw captures

Primary-source captures of Skatteetaten's **MVA-melding submission** flow — the Altinn 3 instance
API sequence, ID-porten authentication, and the `mvaMeldingInnsending` envelope schema the
submission client (`apps/web/app/integrations/altinn/`) and the domain envelope builder are grounded
in. Append-only; refresh by adding the next capture alongside (do not rewrite history). Distilled
into `docs/integrations/altinn-mva-innsending.md`.

> ⚠️ The mva-meldingen site carries a "SIDEN ER UTDATERT" banner pointing to
> `skatteetaten.github.io/api-dokumentasjon` — but as of 2026-07-05 the technical innsending flow
> (endpoints, app id, data types) is documented ONLY on the old site's English pages; the new portal
> is high-level. Both are captured. Re-verify BOTH at onboarding (the Altinn 2→3 / systembruker
> transition is in flux).

| File | Source | Collected |
|---|---|---|
| `2026-07-05-implementationguide.html` | skatteetaten.github.io/mva-meldingen — "Implementation guide" (submission steps, Altinn roles, feedback) | 2026-07-05 |
| `2026-07-05-idportenauthentication.html` | skatteetaten.github.io/mva-meldingen — "ID-porten and authentication" (authorization_code, scopes, Samarbeidsportalen onboarding) | 2026-07-05 |
| `2026-07-05-api.html` | skatteetaten.github.io/mva-meldingen — "API" (validation + Altinn 3 instance endpoints, token exchange, data types) | 2026-07-05 |
| `2026-07-05-apidok-systembruker.html` | skatteetaten.github.io/api-dokumentasjon — the systembruker/tilgangspakke model (Maskinporten + Altinn access packages) | 2026-07-05 |
| `2026-07-05-apidok-sikkerhet.html` | skatteetaten.github.io/api-dokumentasjon — security overview (Maskinporten) | 2026-07-05 |
| `no.skatteetaten.fastsetting.avgift.mva.mvameldinginnsending.v1.0.xsd` | Skatteetaten `mva-meldingen` repo — the `mvaMeldingInnsending` envelope schema (v1.0) | 2026-07-05 |
| `no.skatteetaten.fastsetting.avgift.mva.skattemeldingformerverdiavgift.betalingsinformasjon.v1.0.xsd` | Skatteetaten `mva-meldingen` repo — the `betalingsinformasjon` feedback schema (v1.0) | 2026-07-05 |

## The flow (grounded, not memorised)

1. **ID-porten** (user context, `authorization_code`): scopes `openid` +
   `skatteetaten:mvameldingvalidering` + `skatteetaten:mvameldinginnsending` (granted by Skatteetaten,
   client registered in Samarbeidsportalen / minside-samarbeid.digdir.no). Skatteetaten scope tokens
   live max 8 h.
2. **Altinn token exchange**: `GET {platform}/authentication/api/v1/exchange/id-porten` with the
   ID-porten bearer → an Altinn token (test platform: `platform.tt02.altinn.no`).
3. **Instance flow** on the Altinn 3 app (test: `skd/mva-melding-innsending-etm2` at
   `skd.apps.tt02.altinn.no`; the prod app id is confirmed at onboarding):
   `POST /instances` `{"instanceOwner":{"organisationNumber":…}}` → 201 with `{partyId}/{instanceGuid}`
   → upload the `mvaMeldingInnsending` envelope XML (data type per the app's data model) and the
   `mvaMeldingDto` XML (`datatype=mvamelding`, `Content-Disposition: attachment`), plus 0–57 optional
   `binaerVedlegg` (≤ 25 MB each; PDF/XML/ODF/MS Office/JPEG/PNG)
   → `PUT …/process/next` (ends data filling; the app validates — 409 on failure)
   → `PUT …/process/next` (confirms submission; instance enters feedback).
4. **Feedback**: `GET …/feedback/status` (`isFeedbackProvided`) then `GET …/feedback`; the data list
   then carries `kvittering` (PDF receipt), `betalingsinformasjon` (payment XML, schema above) and
   `valideringsresultat` (XML).
5. **Altinn roles**: upload needs e.g. Regnskapsmedarbeider / Regnskapsfører uten signeringsrett;
   the confirm step needs signing rights (e.g. Begrenset signeringsrett / Regnskapsfører med
   signeringsrett) — the submitting PERSON's rights on the org, checked by Altinn.
6. **Envelope shape** (`mvaMeldingInnsending` v1.0, namespace
   `no:skatteetaten:fastsetting:avgift:mva:mvameldinginnsending:v1.0`): `norskIdentifikator`
   (choice; `organisasjonsnummer` = 9 digits), `skattleggingsperiode` (`periode` choice —
   `skattleggingsperiodeAar` = `aarlig`, or `skattleggingsperiodeToMaaneder` = `januar-februar` …) +
   `aar`, `meldingskategori` (`alminnelig` | `primaernaering` | `kompensasjon` |
   `omvendtAvgiftsplikt` | `eHandel`), optional `innsendingstype` (`komplett` | `ikke komplett`),
   `opprettetAv`, optional `opprettingstidspunkt`, optional repeated `vedlegg`.
7. **Systembruker (watch)**: the new api-dokumentasjon portal documents a Maskinporten
   systembruker/tilgangspakke model for end-user systems; MVA-melding innsending is NOT listed under
   it as of this capture — the person-based ID-porten flow above is the documented path. Re-confirm
   at onboarding.
