# ADR 0006 — shadcn/ui over Mantine

- **Status:** Accepted
- **Date:** 2026-06-22

## Context
Two surfaces: a data-dense desktop accounting tool AND a mobile PWA that must feel genuinely native
(the explicit product bar). The repo is also built by agents, so UI legibility to an agent matters.

## Decision
Use **shadcn/ui** (Radix primitives + Tailwind v4), with component source copied into the repo. Build
the data layer with **TanStack Table** (headless) and forms with **React Hook Form + Zod**. Mantine is
not used.

## Consequences
- Full control over interaction/animation/chrome — required for native feel (Motion, Vaul, View
  Transitions layer on top).
- More agent-legible: components are real HTML + Tailwind in-repo, not a black-box prop API.
- **Accepted cost:** we rebuild the table/form layer that Mantine ships out of the box.

## Alternatives considered
- **Mantine** — great batteries-included desktop tables/forms, but opaque and hard to bend into a
  native-feeling mobile shell. Right for desktop-only; wrong once native feel is a hard requirement.
