---
paths: ["apps/web/app/routes/**", "apps/web/app/components/**", "apps/web/app/root.tsx"]
---
# Accessibility (WCAG 2.2 AA target)

Accessibility and the HTML-first substrate are the same discipline — semantic markup is both
agent-legible and screen-reader-legible.

- **Semantic HTML first:** real `<button>`/`<a>`/`<label>`/`<table>`/`<form>`, proper headings.
  Never a `<div onClick>` where an element exists. Radix primitives give accessible behavior — keep it.
- **Forms:** every input has an associated `<label>`; errors are programmatically linked
  (`aria-describedby`) and announced; validation messages are text, not color alone.
- **Keyboard:** everything operable without a pointer; visible focus rings; logical tab order; no traps
  (Vaul sheets/dialogs must trap+restore focus correctly).
- **Targets & motion:** ≥24×24px (we use ≥44px on mobile); honor `prefers-reduced-motion` for Motion/
  View Transitions; never convey state by color alone (debit/credit/paid/overdue need text/icon too).
- **Figures:** tabular-nums for alignment; currency has an accessible label, not just a glyph.
- **i18n:** `lang` is correct (`nb`/`en`); content is translatable (NO/EN).
- Deterministic backstop: `eslint-plugin-jsx-a11y` runs in lint. The `a11y-reviewer` subagent covers
  what static rules can't (focus management, announcements, semantics).
