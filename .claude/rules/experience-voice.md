---
paths: ["apps/web/app/routes/**", "apps/web/app/components/**"]
---
# Experience & voice (how the product feels and speaks)

Operational distillation of `docs/experience-principles.md` — read it for the full text and the
voice register table (§8). The spine: **playful, simple, safe** — safety makes warmth acceptable,
simplicity keeps it from becoming clutter.

- **Calm in behavior, warm in voice.** The product runs itself and asks little; when it does speak,
  it's a sharp, competent, friendly "I" talking to "you". Calm is not cold. Never corporate, never a
  mascot, never condescending.
- **Playful in the ordinary (~95%), sober in the consequential (~5%).** Drop ALL playfulness — plain,
  clear, no jokes/flourish — at the three §5.5 moments: **money leaving**, **filing to the
  authorities**, and a **genuine ambiguity the user must resolve**. Warmth may return right after.
- **The system owns all fault.** Ambiguity/errors sit with the software ("I couldn't match this one —
  mind a look?"), never the user. No blame-shaped errors, never "Invalid entry".
- **Confirmation model (ADR 0002):** AI proposes → rules engine validates → **high-confidence routine**
  items auto-apply after a grace window unless the user untaps (passive confirm, safe because the
  ledger is append-only); **§5.5 actions require explicit, active confirmation** with an undo/grace
  window. Corrections are shown as the current correct state ("Fixed it"), never a destructive edit.
- **Accounting is an output, never the default view.** Speak events ("what happened?"), not entries;
  the user never sees konto/debit/credit on the everyday surface (ledger is depth-on-demand). The
  honest-number reveal ("what's actually yours") is framed as permission/relief, never a tax warning.
- **Copy:** Norwegian-first, written as original work (EN is reference). One idea per sentence; no
  jargon the user didn't choose (formal terms are tap-to-explain, never pushed). Strings are keyed
  microcopy via `t()` from `~/copy` (ADR 0024), never ad-hoc literals — enforced by
  `saldo/no-unkeyed-jsx-text`.
- **The Feeling Test:** does this make the user feel competent, in control, at ease — or managed,
  stupid, anxious? Anti-patterns (never ship): points/badges/levels/mascots, confetti on routine
  actions, guilt/streaks, manufactured urgency, engagement-driving notifications, jargon walls.
- Accessibility still applies (see `accessibility.md`): warmth never overrides semantic markup,
  perceivable state (not colour/buzz alone), or WCAG 2.2 AA.
