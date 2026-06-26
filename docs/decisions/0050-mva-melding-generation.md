# ADR 0050 — MVA-melding generation on SAF-T VAT codes + Skatteetaten validation

- **Status:** Accepted
- **Date:** 2026-06-26

## Context
A VAT-registered ENK must file a periodic **MVA-melding** (VAT return). Since 2022 the melding is
**code-based**: every figure is reported against a SAF-T standard VAT code — the same list Saldo already
posts against (`db/reference/saf-t/tax-codes/`). The invoicing → ledger → payment loop is now closed
(ADR 0042–0048), so the posted ledger holds everything the melding needs. Build-spec §8.8 / §16 Phase 6.

Forces: the melding must **tie out to the ledger** (output VAT − deductible input VAT = payable) with
every figure traceable to a posting; money stays integer **øre**; the **MVA-status fork** decides
whether a melding exists at all; reverse charge (ADR 0044) must land both legs; codes/rates come from
the committed lists, never memory. Skatteetaten offers a free **validation API**, but it is
onboarding-gated (Maskinporten/ID-porten scopes) and needs egress — not exercisable locally. The ledger
also has no per-voucher document date (only a year-level fiscal period), and a tiny ENK qualifies for
the **annual term** (*årstermin*).

## Decision
Generate the melding **purely in `@saldo/domain/mva-melding`** from the posted ledger aggregated per
SAF-T VAT code, validate it locally, and wire Skatteetaten's validation API fail-closed.

1. **Domain (pure, exhaustive + property-tested).** `generateMvaMelding(aggregates, meta, codeIndex)`
   composes per-code aggregates — `grunnlag` (net basis on revenue/cost lines) and `merverdiavgift`
   (signed VAT on the code's klasse-2 legs: output +, deductible input −) — into the `mvaMeldingDto`
   model. `fastsattMerverdiavgift` = Σ line `merverdiavgift` = `outputVatCollected − deductibleInputVat`
   (the same quantity the honest-number reveal uses — no divergent re-derivation). The sign rule
   (`reportsGrunnlag`) is derived from the committed SAF-T classification and matches Skatteetaten's
   canonical example exactly. `buildMvaMeldingXml` serializes it (whole kroner at the boundary via
   `øreToKroner`); `validateMvaMelding` is the grounded subset+tie-out validator.
2. **MVA-status fork.** `under_threshold` / `unntatt` → no melding (`registered: false`);
   `registered_standard` / `registered_zero_rated` → a melding.
3. **Read-only.** The melding only READS the posted ledger — it books nothing (no new posting path, no
   new table). A new RLS-scoped aggregation query (`aggregateVatByCode`) feeds it.
4. **Validation, not submission.** A local gate (`pnpm mva:validate`, the EHF precedent: generate →
   well-formedness → grounded subset + exact tie-out) proves generation offline. The Skatteetaten
   validation API is behind a fail-closed, EU-resident, Zod-at-boundary client
   (`app/integrations/skatteetaten/`, mirroring the GoCardless client) — off with no external call until
   onboarding + egress. **Submission** (Altinn 3 / ID-porten) is the separate
   `feat-altinn-mva-submission` (Phase 9).
5. **Term scope.** The domain term model encodes both the six bimonthly terms and the annual term; the
   query + route wire the **annual årstermin** on the year-level fiscal period. Deterministic
   aggregation — **NOT an AI system** (EU AI Act Recital 12), so no Art. 50.

## Consequences
- The VAT return is now generated and locally validated, tied out to the ledger by construction and
  proven by a Testcontainers integration test (per-code partition, the reverse-charge dual leg, drafts
  excluded, RLS isolation) plus domain exhaustive + fast-check tests. The committed Skatteetaten schema +
  examples + code lists are the grounding source (`db/reference/skatt/mva-melding/`).
- **Reverse-charge posting note (ADR 0044).** Saldo routes the self-accounted reverse-charge *output*
  leg to the rate's plain output code (e.g. `3`, on the snudd accounts 2704–2709) and the cost +
  deduction legs to the reverse-charge code (e.g. `86`). Both legs appear on the melding and the total
  ties out exactly; Skatteetaten's example instead co-locates both legs under the reverse-charge code.
  The figures and the payable are identical — per-line co-location is a presentational refinement, noted
  in `docs/regulatory/mva-melding.md`, not a correctness gap.
- **Non-deductible reverse-charge basis fix (refines ADR 0044).** The melding review surfaced that the
  *non-deductible* RC fork (`deriveReverseChargePurchase`, `uten fradragsrett` codes 82/84/87/89/92)
  booked the **gross** (net + self-accounted VAT) to the single code-bearing cost line, which would
  report `grunnlag = net + VAT` instead of the **net supply value** the schema requires. Fixed: the cost
  is now split into the NET on the code-bearing line plus the irrecoverable VAT on a separate **uncoded**
  cost line — same balanced cost total, but the melding basis is the net. Proven by an updated domain
  test + the melding aggregation integration test.
- **Known costs / deferred:** full **XSD validation** against the committed schema and the **live
  validation API** await onboarding + egress (the local validator + `mva:validate` stand in, as
  `ehf:validate` does for VEFA). **Bimonthly terms** await a per-voucher *bilagsdato* (the domain is
  ready). Submission, and the 50k rolling-12-month registration threshold (`vat-threshold-watcher`),
  are out of scope.

## Alternatives considered
- **Add a bilagsdato + wire all six bimonthly terms now** — rejected for this slice: a schema change to
  the append-only voucher table touching every posting path, for a user who files annually. The domain
  already supports bimonthly, so it's a small follow-up when document dates land.
- **Real XSD validation locally** — rejected: no pure-JS XSD validator is in the tree (only
  fast-xml-parser), and the authoritative check is Skatteetaten's API anyway. The grounded subset +
  exact tie-out + well-formedness is the same precedent the EHF gate set (ADR 0046).
- **Persist a generated/filed melding record** — deferred: belongs with submission
  (`feat-altinn-mva-submission`), where there is an actual filing to record. Generation-on-demand from
  the immutable ledger matches the honest-number pattern.
- **Re-derive payable independently as a cross-check** — rejected: the hard invariant is one figure,
  traceable to postings; an independent re-derivation is exactly the divergence to avoid. The tie-out is
  asserted instead.
