# ADR 0026 — Typography: Fraunces (display) + IBM Plex Sans (body), capped at 450, self-hosted

- **Status:** Accepted
- **Date:** 2026-06-23

## Context
ADR 0025 set the visual direction ("distinctive but legible") and the carnival colour tokens landed
(PR #14). Type is the other half of the brand-defining token layer, and `app.css` was still falling back
to the system sans — exactly the generic look `.claude/rules/design-system.md` forbids. Saldo is
money/data-heavy (it needs real tabular figures) and must feel **warm and untraditional** (ADR 0025)
while staying effortlessly legible (the prime directive: never make a person struggle, including to
*read*).

## Decision
A **two-font system**, self-hosted:

- **Fraunces** (variable soft-serif) — **display only**: page headings and the *earned* peak moments
  (the "what's yours" honest-number reveal, the post-filing relief, marketing/empty states). **Light or
  Regular, large sizes only.** It carries the warmth/personality that keeps Saldo from feeling like
  every other cold fintech.
- **IBM Plex Sans** (variable) — **everything else**: body, UI, forms, navigation, **and all money and
  data tables** via its genuine tabular figures (`tnum`, wired to the `tabular` utility). No third font:
  because Plex Sans already aligns figures, a mono would be aesthetic-only — so a clean two-font system
  loses nothing.
- **Weight ceiling = 450** (IBM Plex's named "Text" instance). **No Medium (500) or heavier.** Hierarchy
  comes from **size + the serif/sans switch + colour** (`neutral-12` ink vs `neutral-11`) + letter-spacing
  — never bold. UI affordances (buttons, labels, table headers, totals, card titles) use the `font-text`
  (450) token; body is Regular (400); Fraunces display is Light (300) / Regular (400).
- Tokens in `app/app.css` `@theme`: `--font-sans`, `--font-serif`, `--font-weight-text: 450`;
  `font-optical-sizing: auto` drives Fraunces's optical-size axis. Fraunces's SOFT/WONK stay at their
  clean defaults (character, not circus, for a financial product).
- **Self-hosted** via `@fontsource-variable/fraunces` + `@fontsource-variable/ibm-plex-sans`, bundled by
  Vite — **no external CDN** (EU-resident, offline PWA, version-pinned). Norwegian glyphs (æ/ø/å) are in
  the `latin-ext` subset (loaded by `unicode-range`).
- Fraunces **never** appears at the §5.5 *sober act* itself (money leaving / the filing submission) — it
  is for the warm peaks, not the consequential instants (experience-principles §5.5).

## Consequences
- The existing UI is swept to the system: page headings → `font-serif` (Fraunces); every
  `font-semibold`/`font-medium` → `font-serif` / `font-text` (≤450), in routes and the shadcn
  `card`/`table` primitives.
- `design-system.md` gains a typography section; STATUS + backlog updated.
- A future `harness-design-lint` rule can enforce "no font-weight > 450" and "`font-serif` only at
  display sizes" mechanically.
- The variable files add a few woff2 subsets per family (latin first; others lazy via `unicode-range`),
  served from our own origin.

## Alternatives considered
- **Sans + mono** (IBM Plex Sans + Plex Mono, or Hanken Grotesk + Plex Mono). Rejected — it reads
  "precise but cold / developer-tool," against ADR 0025's warm, untraditional brief, and mono isn't
  needed for alignment (Plex Sans has `tnum`). Logged as `R-0010`.
- **A three-font system** (display + body + mono). Rejected — more than a restrained two-font system
  needs; not in line with leading practice.
- **Medium (500)+ for UI emphasis.** Rejected per owner direction — Light/Regular reads calm and
  confident; the ceiling is 450.
- **Keep the system sans.** Rejected — it is the generic-AI look the design rule bans.
