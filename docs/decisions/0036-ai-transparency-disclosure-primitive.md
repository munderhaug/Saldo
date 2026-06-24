# ADR 0036 — Shared AI-transparency disclosure primitive (EU AI Act Art. 50 treatment)

- **Status:** Accepted
- **Date:** 2026-06-24

## Context

Saldo's first AI system (receipt extraction, ADR 0035) shipped the first **EU AI Act Art. 50(1)**
first-interaction disclosure as a **bespoke block** in `routes/orgs.$orgId.receipts.new.tsx`: an
"AI-assistert" badge, the disclosure copy, a model+confidence provenance line, and a focus-managed
`<h2>` on the review step. The code-level *provenance contract* is already generalised and enforced
(`contracts/receipt-extraction.ts`: `aiProvenance` with the literal `aiAssisted: true` — ADR 0035),
but the *UI treatment* was one-off.

More AI surfaces are coming (AI-proposed categorisation/entries; `eu-ai-act.md` §1). If each one
hand-rolls its own disclosure, the obligations drift: a surface could disclose with colour alone, a
non-heading, no focus management, or an inconsistent label — each a WCAG and/or Art. 50 gap. The
posture (ADR 0022) already mandates *that* we disclose; what was missing is **one place that makes
disclosing correctly the path of least resistance**. The transparency obligation binds from
**2 Aug 2026** (`eu-ai-act.md` §7), so the reusable treatment should land now, with the second-ever
AI surface still hypothetical, rather than after divergence sets in.

## Decision

Extract the disclosure into **one shared, accessible primitive** —
`apps/web/app/components/ui/ai-assisted.tsx` (`<AiAssisted>`) — and make it the **mandated
treatment for every AI surface**. The receipt review step is migrated to it (no behaviour
regression; the focus-to-disclosure on the server round-trip is preserved via `focusOnMount`).

The primitive guarantees, structurally, what each surface would otherwise have to remember:

- a **real labelled region** (`<section aria-labelledby>`) named by a **real `<h2>`** — perceivable
  structure, not colour or placement alone (WCAG 2.2 AA);
- the **"AI-assistert" badge as text** + a `data-ai-assisted` marker — the machine-readable
  **AI-assisted** label (Art. 50(2)), centralised in **one shared microcopy key** (`ai.assistedLabel`,
  nb+en) so it cannot vary per surface;
- the **first-interaction disclosure** copy (Art. 50(1)) and the **provenance line** (model +
  confidence, Art. 50(2)) in fixed positions, both driven by keyed microcopy via `t()`;
- optional **focus-to-heading on mount** for a proposal revealed on a server round-trip (WCAG
  2.4.3 / 4.1.3).

The surface passes its own framing (heading/disclosure/provenance strings) and its reviewed fields
as `children`: **the primitive owns the disclosure, the surface owns the content.** It is
**disclosure-only** — it never posts, scores, or profiles a natural person (ADR 0002; Annex III
§5(b), the line never to cross).

This **folds into the ADR 0022 posture** rather than changing it: 0022 decided *that* Saldo
discloses and marks AI output; this ADR records *how* — a single reusable gate — so the obligation
is met by construction as the AI surface grows. It does not supersede 0022 or 0035.

## Consequences

- **Easier:** every future AI surface gets compliant, accessible disclosure by rendering one
  component — the Art. 50 treatment can't be half-built or styled colour-only. A render test
  (`ai-assisted.test.tsx`, via `react-dom/server` — no new test dependency) pins the contract
  structurally: label present, `data-ai-assisted` marker, real labelled heading, focusable on
  reveal. The nb/en parity test already covers the shared key.
- **Consistency:** the machine-readable label lives in one microcopy key, so "AI-assisted" reads
  identically everywhere; the bespoke `receipts.new.aiAssisted` key is removed (state a fact once).
- **Accepted cost:** `<AiAssisted>` carries a small amount of structure (fixed `<h2>`, section
  chrome) that a one-off might tune per surface; uniformity is the point and is worth more than
  per-surface bespoke layout for a compliance affordance. A surface needing a different heading depth
  (e.g. an inline proposal under `<h3>`) will extend the primitive then — not speculatively now.
- **Durable provenance logging** (Art. 50(2)'s persisted half) remains separate work
  (`aia-provenance-logging`, paired with the observability baseline); this ADR is the **UI**
  disclosure, not the audit log.

## Alternatives considered

- **Keep it bespoke per surface.** Rejected: guarantees drift; each new surface re-litigates
  heading/label/focus and a gap (colour-only, missing focus) ships unnoticed. The obligation is
  uniform, so the treatment should be too.
- **A render-prop / fully-generic disclosure framework.** Over-built for two surfaces (YAGNI,
  engineering-discipline). A focused component with `children` for surface content covers today's
  need and extends cleanly.
- **Add jsdom + testing-library to render-test it.** Rejected: a new dependency for what
  `renderToStaticMarkup` (already present) tests adequately — the markup is the compliance surface.
