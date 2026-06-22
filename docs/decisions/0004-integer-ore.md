# ADR 0004 — Integer øre, never floats

- **Status:** Accepted
- **Date:** 2026-06-22

## Context
Floating-point arithmetic on money produces rounding errors that are unacceptable in accounting.

## Decision
Money is a branded integer type `Øre`. Construction via `øre()`, combination via `addØre`/`subØre`/
`mulRate`. Rounding (half away from zero) only at presentation/settlement boundaries. Enforced by the
type system and a custom ESLint rule (`saldo/no-money-arithmetic`). No `decimal.js`.

## Consequences
- A whole class of monetary bugs is impossible by construction.
- Developers must use the helpers; raw `+ - * /` on money is a lint error.

## Alternatives considered
`decimal.js` everywhere — rejected: invites decimal money math and adds a dependency; integer-only is
simpler and safer.
