---
paths: ["apps/web/app/components/**", "apps/web/app/app.css", "apps/web/app/routes/**"]
---
# Design system

A restrained, trustworthy financial UI — not a mood-driven brand. Consistency comes from tokens.

- **Tokens, not literals.** Use the Tailwind/shadcn CSS variables (`bg-background`, `text-foreground`,
  etc.). No hardcoded hex or arbitrary spacing values; extend the theme in `app.css`.
- **Semantic state colors** are a fixed, named set, always paired with text/icon (never color-only).
  `paid`/`overdue` are everyday user-facing states; `debit`/`credit` appear **only in the
  depth-on-demand ledger** (accountant/auditor view) — the everyday surface never shows
  konto/debit/credit (experience-principles §4.2).
- **Palette:** neutral base + one trustworthy accent. No decorative gradients in data views.
- **Numbers:** every figure uses the `tabular` utility (tabular-nums, lining); right-align money columns;
  format via the domain money helpers, never raw `toFixed`.
- **Components:** compose from `components/ui` (shadcn). Add new primitives via `npx shadcn add`, then
  adapt in-repo — don't reinvent. Native-shell pieces live in `components/mobile`.
- **Two surfaces, one foundation (ADR 0016).** Desktop = data-dense workbench (compact tables); mobile
  = touch-first companion (`components/mobile`: larger targets, sheets). Same tokens, the same
  `components/ui` primitives, and the same voice/safety rules (`experience-voice.md`); only
  presentation differs. Build each surface per feature, never speculatively.
- For a visual consistency pass, use the `design-review` skill (emits an html-report).
