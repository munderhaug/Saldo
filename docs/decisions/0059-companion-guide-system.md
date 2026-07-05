# ADR 0059 — The companion/guide system: deterministic, dismissible, token-bound

- **Status:** Accepted
- **Date:** 2026-07-05

## Context
ADR 0025 promised the embodied voice — a friendly companion that guides without gamifying — and
ADR 0058 fixed its look (the round balance ball in the papirklipp grammar) and behaviour rules.
`feat-companion` turns those decisions into product code. The open implementation questions: how the
character is drawn (per-scene SVG vs a typed component), how its colours bind to the theme, how
"dismissible, never nags" actually persists, and where the first placements land — all without an
LLM in the loop, and without committing to the unvalidated name/face (`companion-user-validation`).

## Decision
1. **One typed React SVG component** (`apps/web/app/components/companion.tsx`). `Companion` takes an
   `expression` from the closed set attentive · pleased · thinking · unsure · resting and a `size`
   restricted to ADR 0058's ladder (96 | 64 | 32 | 20 | 12); the drawing degrades mechanically with
   the size (full face → eyes only → the plain status dot), so a shrunken face cannot be rendered.
   There is no `absent` expression — §5.5 absence is expressed by not rendering the companion, and
   no blaming/alarmed variant exists at the type level. Decorative by default (`aria-hidden`);
   passing a `label` makes it `role="img"` + labelled.
2. **Semantic tokens, theme-stable:** `--companion` (→ electric-9) and `--companion-foreground`
   (→ paper-white) in `app.css`, exposed to Tailwind as `--color-companion(-foreground)`. Components
   reference only these — never the scale steps raw — and the features never flip dark in dark mode.
3. **Dismissal is a server-read browser cookie** (`saldo_companion=off`; HttpOnly, SameSite=Lax,
   1 year). `CompanionGuide` — the companion beside one keyed line of copy — carries a plain
   `<form>` POST to the `/companion` resource route (same-origin-guarded, safe-redirect-validated),
   so dismissing works without JS and never flashes. Dismissing hides the CHARACTER, never the words;
   the settings page offers the way back. Deliberately not per-org account data: it is a presentation
   preference holding nothing personal or financial.
4. **First placements, built per feature:** home onboarding (attentive), the home empty state and the
   invoices empty list (attentive, via `CompanionGuide`), the home "à jour" header (resting — the
   ambient all-clear, outside the money card), and the settings toggle. No placement at any §5.5
   moment, inside a money/table surface, or in the purre flow (the Torpedo stays unbuilt until that
   feature lands).
5. **Fully deterministic — NOT an AI system** (Recital 12; no Art. 50 duties attach). All speech is
   keyed Norwegian-first microcopy via `t()` (ADR 0024) that addresses the character structurally
   ("hjelperen"), so the post-validation naming is a string change. If LLM-generated speech is ever
   added, that surface becomes an AI system: Art. 50 disclosure + the AI-assisted label + logged
   provenance (ADR 0022/0036), and the ai-act-reviewer runs.

## Consequences
- Future surfaces get a companion by composing `Companion`/`CompanionGuide` with a new copy key —
  no new drawing, colour, or behaviour decisions per feature; the design contract is pinned by
  render tests (size-ladder honesty, tokens-only, decorative-by-default, dismissal semantics).
- The cookie preference is per browser, not per user: a user who dismisses on one device sees the
  companion again on another. Accepted for the deterministic start; an account-level preference can
  supersede the cookie if validation shows the need.
- The expression set is closed; a feature wanting a new expression amends this ADR (and ADR 0058's
  never-blames rule screens it).

## Alternatives considered
- **Per-scene inline SVGs** (the spike's own form). No shared enforcement — every scene re-decides
  colours and degradation, and the never-blames/size-honesty rules live only in review. Rejected.
- **`localStorage` + client-side hiding.** Breaks the no-JS substrate, flashes before hydration, and
  moves a behaviour rule into the client. Rejected; the substrate is server-authoritative.
- **A per-user DB preference now.** Schema + migration for a presentation toggle before user
  validation of the character itself is premature; the cookie is reversible and invisible to the
  ledger. Deferred, not rejected.
- **An `absent` expression value.** Makes §5.5 absence a render-time argument — one forgotten
  conditional from a "serious face" anti-pattern. Absence stays structural: the component simply
  isn't there.
