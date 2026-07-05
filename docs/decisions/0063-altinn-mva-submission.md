# ADR 0063 — MVA-melding submission via Altinn 3 (fail-closed, onboarding-gated)

- **Status:** Accepted
- **Date:** 2026-07-05

## Context
The melding is generated read-only from the posted ledger and validated locally (ADR 0050); filing
it (build-spec §8.8/§9, Phase 9) goes through Skatteetaten's Altinn 3 app. The flow was re-captured
2026-07-05 (`db/reference/skatt/mva-melding/innsending/`, distilled into
`docs/integrations/altinn-mva-innsending.md`): the documented path is **person-based** — ID-porten
(`authorization_code`, the two `skatteetaten:mvamelding*` scopes), the ID-porten→Altinn token
exchange, then an instance on the innsending app (create → upload envelope + melding →
`process/next` ×2 → feedback), with the PERSON's Altinn role deciding upload/signing rights. The
capture also confirmed churn: the technical docs live on a site bannered UTDATERT, the new portal
documents a Maskinporten **systembruker** model that does NOT yet list MVA innsending, and every
endpoint is environment-specific. Onboarding (an ID-porten client, scope grants, tt02 test users)
does not exist yet — but waiting for it would leave the flow unbuilt and unshaped.

## Decision
Build the submission **fail-closed now** (the ADR 0050/0047/0045 posture), person-flow-shaped,
with the token acquisition abstracted to the environment until onboarding:

- **Domain:** `buildMvaMeldingInnsendingXml` — the `mvaMeldingInnsending` v1.0 envelope, pure,
  schema-grounded, reusing the melding's own `MvaTerm` so envelope and melding can never disagree
  about the period. `meldingskategori` fixed to `alminnelig`, submissions always `komplett`.
- **Client** (`app/integrations/altinn/`): a config gate (`ALTINN_EU_RESIDENT=true` +
  `ALTINN_APPS_BASE_URL`/`ALTINN_PLATFORM_BASE_URL`/`ALTINN_APP_ID`/`ALTINN_ID_PORTEN_TOKEN`; any
  missing ⇒ `null` ⇒ NO external call) and the captured sequence in **two phases** —
  `openMeldingInstance` (exchange + create) and `completeMeldingInstance` (uploads +
  `process/next` ×2) — with Zod at the response boundary (instance/party/data-element ids PINNED to
  digits/uuid shapes: they become URL material and are persisted), an aggregate per-phase deadline,
  and every expected failure returned typed
  (`not-configured`/`auth-failed`/`rejected`/`error`/`invalid-response`), nothing thrown on
  integration trouble. The ID-porten bearer is **operator-supplied via env** for tt02 testing —
  exactly the `SKATT_VALIDATION_TOKEN` precedent; the in-app per-user ID-porten OIDC round-trip is
  the onboarding follow-on.
- **Record — between the phases (integration-audit 2026-07-05):** the append-only **`mva_filing`**
  table (FORCE RLS; SELECT+INSERT-only grant) stores one row per submission that reached instance
  creation — year, term key, the `{partyId}/{instanceGuid}` pointer under which Skatteetaten's
  kvittering/betalingsinformasjon live — written with its `mva_filing.submitted` audit event
  (ADR 0062) in one tenant tx that COMMITS before the consequential confirm phase, so a real filing
  can never end up unrecorded past the creation instant. The same tx serializes duplicates with a
  `pg_advisory_xact_lock` on org+year+term and answers a second submit with `already-filed`; a
  korrigert melding requires the explicit re-file confirm (`refile=true`, offered only once the
  screen has shown the existing filings) and is a NEW row — history is never rewritten. Feedback
  documents stay in Altinn — we persist the pointer, not copies.
- **Surface:** the MVA screen gains the §5.5 sober "Send inn via Altinn" section — explicit
  confirm, plain copy, the year's filings listed; a melding the grounded local validator rejects
  is never submitted.
- **Gate:** `pnpm mva:validate` now also XSD-validates the generated envelope against the committed
  v1.0 schema (the SAF-T precedent — the schema is self-contained, no egress needed).

## Consequences
- The whole filing flow — envelope, sequencing, failure taxonomy, record, audit attribution, UI —
  exists and is tested (domain exhaustive+property; client unit tests over the captured sequence;
  Testcontainers integrity tests for `mva_filing`; a fail-closed route test), so onboarding becomes
  configuration + verification against tt02, not construction.
- **Provisional until tt02 verification** (flagged in-code): the data-type query casing
  (`dataType=mvamelding`), the instance-created envelope element discovery, and the prod app id.
- **Known cost:** the env-token posture cannot serve real end users (each org's filer must sign in
  with their own ID-porten identity) — production filing REQUIRES the OIDC follow-on. Accepted: the
  same trade every fail-closed integration here has made, and the UI states it plainly
  (`mva.altinn.not-configured` points to manual delivery at skatteetaten.no meanwhile).
- New env vars need the hand-maintained `.env.example` update (it is agent-deny'd).

## Alternatives considered
- **Wait for onboarding before building.** Rejected: the ADR 0050 precedent shows fail-closed
  construction converts an external dependency into a config step; the capture is fresh and cited.
- **Maskinporten / systembruker instead of the person flow.** Not documented for MVA innsending as
  of the capture — and filing needs a person's signing rights. Watched explicitly in the SOURCE.md;
  revisit at onboarding if Skatteetaten moves innsending onto tilgangspakker.
- **Build the full in-app ID-porten OIDC dance now.** Speculative plumbing against endpoints the
  docs themselves date (oidc-ver2.difi.no is legacy); no client id exists to test it. Deferred to
  onboarding, where the issuer/client facts become real.
- **Persist the feedback documents (kvittering PDF etc.).** Copies of authority documents add a
  retention surface for no gain while Altinn holds them under the instance; the pointer suffices.
  Revisit if a bokettersyn workflow needs offline copies.
