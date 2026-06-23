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
- **No AI-design "tells."** Default-shadcn-looking screens read as generic AI output, never ship that.
  Ship customized tokens/spacing/type — not stock components. Specifically avoid: the un-themed shadcn
  default look, "AI-purple" violet gradients, gradient hero text, unprompted neon glows, emoji used as
  UI icons (use a real icon set), and the centered-hero-plus-three-cards layout. Distinctive and
  intentional beats trendy.
- **Enforced mechanically (eslint-plugin-saldo), active now so the first component is on-bar:**
  `saldo/no-arbitrary-tailwind` (no `bg-[#fff]` / `h-[100vh]` — add a token; arbitrary *variants* like
  `[&_tr]:…` are allowed), `saldo/no-raw-color-utility` (no `text-black` / `bg-red-500` — use the
  semantic tokens), the inline-`style` ban, and `jsx-a11y` recommended. Further design-lint
  (focus-visible, font-family, element-semantics — korrodesign-style) is tracked in the backlog for
  when there's more UI surface to lint.
- **Numbers:** every figure uses the `tabular` utility (tabular-nums, lining); right-align money columns;
  format via the domain money helpers, never raw `toFixed`.
- **Components:** compose from `components/ui` (shadcn). Add new primitives via `npx shadcn add`, then
  adapt in-repo — don't reinvent. Native-shell pieces live in `components/mobile`.
- **Two surfaces, one foundation (ADR 0016).** Desktop = data-dense workbench (compact tables); mobile
  = touch-first companion (`components/mobile`: larger targets, sheets). Same tokens, the same
  `components/ui` primitives, and the same voice/safety rules (`experience-voice.md`); only
  presentation differs. Build each surface per feature, never speculatively.
- For a visual consistency pass, use the `design-review` skill (emits an html-report).
