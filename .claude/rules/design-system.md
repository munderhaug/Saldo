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
- **Palette (the "carnival" system, ADR 0025):** a cold-white neutral base + a vibrant accent system,
  authored as **ten 12-step OKLCH scales** (the primitives, in `app/app.css`) mapped onto semantic
  tokens — never use a scale step raw in a component; go through a token. Brand roles: **primary =
  electric, secondary = grape, tertiary = candy**; soft register = sky / lilac / mint; semantic state =
  **paid (green) · overdue (red) · heads-up (amber)**; `debit`/`credit` are neutral, ledger-only. Step 9
  = the solid. Money and tables render as **neutral-12 ink on neutral-1 cold-white** so a figure is never
  hard to read; vibrant colour is for accents, illustration, and the companion. **No gradients** (flat
  blocks); distinctive **but** legible; the §5.5 sober moments go calm. Contrast is verified AA per step.
- **Typography (two-font system, ADR 0026):** **Fraunces** (`font-serif`) is **display only** — page
  headings + the earned peak moments (the honest-number reveal, post-filing), Light/Regular at large
  sizes, never at the §5.5 sober act. **IBM Plex Sans** (`font-sans`, the default) is body, UI, and **all
  money/tables** (its tabular figures via the `tabular` utility — no mono needed). **Weights cap at 450**
  (`font-text`); no `font-medium`/`font-semibold`/`font-bold`. Build hierarchy from size + the serif/sans
  switch + colour (`neutral-12`/`neutral-11`), not weight. Both are self-hosted (`@fontsource-variable/*`,
  no CDN); tokens live in `app/app.css`.
- **No AI-design "tells."** Default-shadcn-looking screens read as generic AI output, never ship that.
  Ship customized tokens/spacing/type — not stock components. Specifically avoid: the un-themed shadcn
  default look, "AI-purple" violet gradients, gradient hero text, unprompted neon glows, emoji used as
  UI icons (use a real icon set), and the centered-hero-plus-three-cards layout. Distinctive and
  intentional beats trendy. (Saldo's vibrant carnival palette is the **intentional** brand identity per
  ADR 0025 — flat, accessible, deliberately tuned — not the accidental generic-AI look this warns about.)
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
