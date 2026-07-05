# Altinn 3 — MVA-melding submission (innsending)

- **Purpose:** file the generated, validated MVA-melding with Skatteetaten through the Altinn 3
  instance API (build-spec §8.8 / §9, Phase 9) — the submission half behind the local generation
  (ADR 0050) and validation surfaces.
- **Auth (person-based, the documented path):** the END USER authenticates with **ID-porten**
  (`authorization_code`; scopes `openid` + `skatteetaten:mvameldingvalidering` +
  `skatteetaten:mvameldinginnsending` — granted by Skatteetaten, client registered in
  Samarbeidsportalen). The ID-porten token is exchanged for an **Altinn token** at
  `GET {platform}/authentication/api/v1/exchange/id-porten` (8 h max lifetime on the Skatteetaten
  scopes). Whether the user may upload/confirm is the PERSON's Altinn role on the org (upload:
  e.g. Regnskapsmedarbeider; confirm: signing rights) — Altinn enforces it, we map the 403.
  **ID-porten is separate from app login** (BankID/Vipps via Criipto) and scoped to filing only.
- **Flow (Altinn 3 instance API; test app `skd/mva-melding-innsending-etm2` on
  `skd.apps.tt02.altinn.no`, platform `platform.tt02.altinn.no`; prod app id confirmed at
  onboarding):** create instance for the org → upload the `mvaMeldingInnsending` envelope XML
  (v1.0, built pure in `@saldo/domain/mva-melding`) + the `mvaMeldingDto` XML
  (`datatype=mvamelding`) → `process/next` ×2 (validate-and-complete, then confirm; 409 = rejected)
  → poll `feedback/status`, then fetch `kvittering` (PDF), `betalingsinformasjon` (XML) and
  `valideringsresultat` (XML) from the instance data list.
- **Status / phase:** client built **fail-closed** (ADR 0063): OFF — no external call — until the
  operator asserts `ALTINN_EU_RESIDENT=true` and configures the base URLs + app id, and a filing
  token is in hand. Onboarding-gated: ID-porten client + scope grants + (for tt02) Tenor test users.
- **Systembruker (watch):** the api-dokumentasjon portal documents a Maskinporten
  **systembruker/tilgangspakke** model for end-user systems; MVA-melding innsending is NOT listed
  under it as of the capture — but the Altinn 2→3 / systembruker transition is explicitly in flux.
  Re-confirm the flow (and whether the person-based path is being replaced) at onboarding.
- **Notes:** the melding itself is generated read-only from the posted ledger (ADR 0050) and
  validated locally (`pnpm mva:validate`) before any submission; filing is a §5.5 sober,
  explicit-confirm act; each submission is recorded in the append-only `mva_filing` table
  (instance linkage — the durable proof a filing happened), and the old mva-meldingen site is
  UTDATERT-bannered while still being the only technical source — both sites are captured.

## Sources
- Skatteetaten, "Implementation guide" (mva-meldingen, English), 2026-07-05. Raw:
  db/reference/skatt/mva-melding/innsending/2026-07-05-implementationguide.html. verify-by: 2026-10-05
- Skatteetaten, "ID-porten and authentication" (mva-meldingen, English), 2026-07-05. Raw:
  db/reference/skatt/mva-melding/innsending/2026-07-05-idportenauthentication.html. verify-by: 2026-10-05
- Skatteetaten, "API" (mva-meldingen, English — instance endpoints, token exchange, data types),
  2026-07-05. Raw: db/reference/skatt/mva-melding/innsending/2026-07-05-api.html. verify-by: 2026-10-05
- Skatteetaten, "Systembruker" + "Sikkerhet" (api-dokumentasjon), 2026-07-05. Raw:
  db/reference/skatt/mva-melding/innsending/2026-07-05-apidok-systembruker.html,
  db/reference/skatt/mva-melding/innsending/2026-07-05-apidok-sikkerhet.html. verify-by: 2026-10-05
- Skatteetaten, `mvaMeldingInnsending` v1.0 XSD + `betalingsinformasjon` v1.0 XSD (mva-meldingen
  repo), 2026-07-05. Raw: db/reference/skatt/mva-melding/innsending/. verify-by: 2027-07-05
