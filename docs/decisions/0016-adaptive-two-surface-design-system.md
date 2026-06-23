# ADR 0016 — Adaptive two-surface design system (desktop workbench + mobile companion)

- **Status:** Accepted
- **Date:** 2026-06-23

## Context
Saldo is one codebase (RR7 PWA; Capacitor held in reserve — **not** a separate native app). Users
work in two very different contexts (build-spec: "phone for capture, desktop for everything else"),
and `docs/experience-principles.md` demands both an ambient, native-feel **mobile** experience and a
depth-on-demand **desktop** workbench — both Playful / Simple / Safe. The question is whether to build
one undifferentiated responsive UI, two forked design systems, or something in between.

## Decision
**One foundation, two task-optimised surfaces** — not two forked systems:

- **Shared base (the "same principles"):** the design tokens (`app/app.css`), the accessible primitive
  components (`components/ui`), the semantic-HTML server-authoritative substrate, and the voice +
  safety framing (`.claude/rules/experience-voice.md`, `docs/experience-principles.md`). Both surfaces
  consume these — zero drift.
- **Desktop = workbench:** data-dense, keyboard/mouse, compact tables (TanStack); the ledger,
  breakdowns, and reports are **depth-on-demand** (accounting-as-output, never the default view).
- **Mobile = ambient companion** (`components/mobile`): touch-first (≥44 px), bottom sheets (Vaul),
  gesture springs (Motion), View Transitions, thumb-reachable nav, receipt capture, and
  haptics/biometric via Capacitor behind a capability interface that degrades gracefully in the PWA.
  A **focused subset** (capture / approve / glance), not a port of the desktop UI.
- **Adaptive composition, not two apps:** the *same* route renders the right pattern by
  viewport/capability (container queries + a viewport primitive).

## Consequences
- Shared tokens + primitives + voice mean the surfaces can't drift; only presentation differs.
- Build each surface **incrementally, per feature** — never the mobile-native set speculatively.
- `debit`/`credit` colours appear **only** in the depth-on-demand ledger (accountant/auditor view);
  `paid`/`overdue` are the everyday user-facing states (experience principles §4.2 — the everyday
  surface never shows konto/debit/credit).

## Alternatives considered
- **A separate native app** (React Native / Swift) — rejected: contradicts the one-codebase decision
  and doubles the surface for a solo maintainer.
- **A single undifferentiated responsive UI** — rejected: a cramped desktop port fails both the
  native-feel goal and the "phone for capture, desktop for everything else" split.
