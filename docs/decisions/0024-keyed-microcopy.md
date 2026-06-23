# ADR 0024 — Keyed microcopy: Norwegian-first, single-locale, type-safe

- **Status:** Accepted
- **Date:** 2026-06-23

## Context
Saldo speaks **Norwegian first** in a specific, trust-building register (`docs/experience-principles.md`
§8; `.claude/rules/experience-voice.md`), and that rule already mandates the end state: *"Strings are
keyed microcopy, not ad-hoc literals."* The accessibility rule independently requires content to be
**translatable (NO/EN)** with a correct `lang`. Yet the first UI surfaces shipped with hard-coded
string literals scattered across routes (`'Logg inn'`, `'Feil e-post eller passord.'`, …), and two were
even **English** in a Norwegian product (`'OIDC is not configured'`, `'Password login is disabled'`).
Every future surface would have multiplied this drift. We need one foundational pattern — established
now, while the UI is 7 files — that the rest of the product follows.

The target market is the Norwegian *enkeltpersonforetak*; there is **no second shipping locale** on the
roadmap. So the problem is "centralise + key the copy," not "stand up an i18n framework."

## Decision
All user-facing copy lives in a typed catalog at **`apps/web/app/copy`** and is read through a single
accessor:

- **`nb` is the shipped source of truth**, written as original work. **`en` is a reference only** —
  never selected at runtime — kept so each key's intent stays legible to the English-reasoning
  maintainers of this repo and to satisfy the "translatable (NO/EN)" a11y rule. `en` is pinned to
  `nb`'s exact key set by `satisfies Record<MessageKey, string>` (a missing/extra key is a **compile
  error**) and to its `{placeholder}` set by a parity test.
- **`t(key, params?)`** is the accessor. Keys are typed (`keyof` the catalog), so a typo is a compile
  error; when a string carries `{name}` placeholders, `t` requires a typed params object with exactly
  those names (a missing/misspelled placeholder is a compile error too). `t` is **pure** — no I/O, no
  `Date`/`Math` — so it runs in loaders/actions and in the browser, like `@saldo/domain`.
- **No runtime i18n framework and no locale switch.** Saldo is single-locale by design. A future second
  locale would extend `t` with a locale argument and promote `en` from reference to shipped — a
  deliberate, separate decision, not pre-built here.
- **Money/number/date formatting stays in `@saldo/domain`** (`formatKr`), never in the copy layer: a
  figure is formatted there and passed into a placeholder, so the catalog holds only words.
- Enforced mechanically by **`saldo/no-unkeyed-jsx-text`** (eslint-plugin-saldo), which flags ad-hoc
  user-facing text in `apps/web/app/**` JSX (ignoring `{expr}` containers and `code`/`pre`/`kbd`/`samp`
  content). A mechanical gate, not a reminder — consistent with the quality bar.

## Consequences
- Every UI surface routes copy through `t`; adding a string is "add a key to `nb` **and** `en`," and
  the lint gate + type checker stop a regression at author time.
- The two stray English strings are now Norwegian; the product is consistently NB-first.
- Slightly more indirection than an inline literal, and the reference `en` catalog must be kept in sync
  — but `satisfies` + the parity test make drift a failing build, not a silent rot.
- The accessor is intentionally minimal (typed keys + `{name}` interpolation). Pluralisation/ICU and
  locale selection are explicitly **not** built until a feature needs them (engineering-discipline:
  no speculative machinery).

## Alternatives considered
- **An i18n library (i18next / LinguiJS / FormatJS).** Rejected — runtime locale negotiation, ICU
  parsing, and message-extraction tooling are weight a single-locale product does not need, and they
  pull copy out of type-checked source into extracted catalogs. Logged as `R-0008` in `rejected.md`.
- **A nested-object catalog (`copy.auth.login.title`).** Rejected — a flat dotted-key map gives trivial
  `keyof` typing, simple `nb`⇄`en` parity, and a clean lint story; nesting complicates all three for no
  user-visible gain.
- **Catalog values that are functions for interpolation.** Rejected — mixing data and behaviour breaks
  the `satisfies` parity check and the "catalog holds only words" rule; `{name}` placeholders + a pure
  `interpolate` keep the catalog declarative.
- **Leave literals inline (status quo).** Rejected — it is exactly the drift the experience-voice rule
  forbids, and it does not scale past the current 7 files.
