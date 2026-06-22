---
paths: ["apps/web/app/components/**", "apps/web/app/app.css", "apps/web/app/routes/**"]
---
# Design system

A restrained, trustworthy financial UI — not a mood-driven brand. Consistency comes from tokens.

- **Tokens, not literals.** Use the Tailwind/shadcn CSS variables (`bg-background`, `text-foreground`,
  etc.). No hardcoded hex or arbitrary spacing values; extend the theme in `app.css`.
- **Semantic state colors** are a fixed, named set — `debit`, `credit`, `paid`, `overdue` — always
  paired with text/icon (never color-only; see accessibility rule).
- **Palette:** neutral base + one trustworthy accent. No decorative gradients in data views.
- **Numbers:** every figure uses the `tabular` utility (tabular-nums, lining); right-align money columns;
  format via the domain money helpers, never raw `toFixed`.
- **Components:** compose from `components/ui` (shadcn). Add new primitives via `npx shadcn add`, then
  adapt in-repo — don't reinvent. Native-shell pieces live in `components/mobile`.
- **Density:** desktop is data-dense (compact tables); mobile is touch-first (larger targets, sheets).
  Same tokens, responsive scale.
- For a visual consistency pass, use the `design-review` skill (emits an html-report).
