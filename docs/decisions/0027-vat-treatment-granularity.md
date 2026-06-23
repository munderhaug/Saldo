# ADR 0027 — VAT-treatment granularity: per-organization vs per-line/per-project

- **Status:** Accepted
- **Date:** 2026-06-23

## Context
Saldo models MVA status as a single enum on the **organization**
(`packages/domain/src/vat/status.ts`: `under_threshold | unntatt | registered_standard |
registered_zero_rated`), and `docs/saldo-build-specification.md` lists **delt virksomhet** input-VAT
apportionment as out of scope ("advise the user to engage an accountant").

That assumption breaks for a core target user: the cultural-sector *enkeltpersonforetak*. Under
**mval § 3-7** an artistic performance is *unntatt*, but the same person's teaching, session work, merch,
or licensing is taxable — **delt virksomhet**, which requires **forholdsmessig fradrag** (proportional
input-VAT deduction). See `docs/regulatory/mva-kunstneriske-tjenester.md`. The exemption is decided
**service-by-service**, so VAT treatment is intrinsically a property of the *transaction/line*, not the
*org*. The committed SAF-T tax codes are already per-line, so the data layer can carry it; the domain
model and the org-level status are what assume a single treatment.

This is also where the user-reported pain lives: no settled trade convention, people guessing without a
cited ground. Saldo's value proposition here is being the **source-grounded** authority — which requires a
model that can actually represent "exempt on this project, taxable on that one."

## Decision
**VAT treatment is a property of the invoice/voucher line, not solely of the organization** — adopted in
two deliberately sequenced steps so the architecture is right now while the harder math is staged until a
surface needs it (engineering-discipline: no speculative machinery).

1. **The org-level `mva_status` stays** as the *registration/default* state — it governs whether the org
   charges output VAT at all and drives the threshold. It is no longer assumed to be the *whole* answer.
2. **Each line carries its own VAT treatment via its SAF-T tax code** (the data layer already supports
   per-line codes). One org can therefore post an *unntatt* line (code 6) and a taxable line (code 3) on
   the same period — the day-one reality for a cultural-sector ENK. This **revenue-side per-line
   classification is in scope now** and is what the Phase-2 rules engine validates (valid code↔status
   combinations; the § 3-7 integral-to-performance inputs).
3. **Delt-virksomhet input-VAT apportionment (forholdsmessig fradrag, mval § 8-2) is accepted in
   principle but sequenced** as a separate, source-gated increment (`vat-mixed-activity`). Until it lands,
   input-VAT apportionment remains **unsupported** — consistent with the current build-spec scope line,
   which is revised *at that point*, with this ADR as the cited reason, not before.

Rationale: the source-grounded analysis (`docs/regulatory/mva-kunstneriske-tjenester.md`) shows the
exemption is decided **service-by-service**, so a per-org enum cannot represent it. But the common,
high-value confusion is *revenue-side classification* ("is this fee exempt?"); the apportionment math is
lower-frequency and needs its own captured basis (§ 8-2 keys, the de-minimis thresholds) before coding.

## Consequences
- Saldo can serve mixed-activity freelancers honestly on the revenue side immediately; the rules engine
  enforces per-line code validity with exhaustive + property tests (`new-vat-scenario`).
- The org-level `mva_status` is retained (no migration churn); the new expressiveness is at the line.
- `vat-mixed-activity` carries the apportionment work: a documented, source-grounded § 8-2 basis + a
  Testcontainers integrity test, and the build-spec scope-line revision — all deferred to that task.
- `docs/regulatory/mva-kunstneriske-tjenester.md` stands as the cited basis; the gap is tracked in the
  backlog (`vat-line-level-model`, `vat-mixed-activity`, `vat-sectoral-exemptions`).
- **Extended by ADR 0030** (sectoral VAT exemptions): the activity dimension that blocks charging VAT on
  an exempt-sector line, composing with this per-line model.

## Alternatives considered
- **Per-line *and* apportionment now (the full delt-virksomhet build).** Rejected as the first step —
  apportionment is lower-frequency and unsourced today; building it speculatively violates
  engineering-discipline and would post input VAT on an unconfirmed § 8-2 basis.
- **A second "activity" entity** (per-activity status, lines tagged to an activity). More faithful long
  term but heavier; premature before real usage shows the shape. Revisit if line-level proves insufficient.
- **Status quo (org-level only).** Rejected — it pushes a core target segment to an accountant for the
  exact problem Saldo set out to solve.
