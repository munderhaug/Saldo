# ADR 0023 — Saldo's own code is proprietary (the stack stays OSS + self-hostable)

- **Status:** Accepted
- **Date:** 2026-06-23

## Context
ADR 0008 committed the **stack** to open-source & self-hostable components (Postgres, Drizzle, SQL
migrations, local-first LLM) for longevity and anti-lock-in. But the licence of **Saldo's own
application code** was never recorded, and the repo shipped with no `LICENSE` file — a Stage-1 gap
(a repo with no licence is "all rights reserved" by default, but silently, which travels badly with
clones and reads as an oversight). Saldo is a commercial product, not a community open-source project.

## Decision
Saldo's **own source code is proprietary — all rights reserved** (`LICENSE` at the repo root). This is
distinct from, and compatible with, ADR 0008: the **dependencies/stack remain open-source** and the
**architecture remains self-hostable and portable**; only Saldo's original code is closed. Anti-lock-in
for the *user* is guaranteed not by open-sourcing Saldo but by the **complete data export** (SAF-T +
raw) — a user can always leave with their data.

## Consequences
- Clear IP posture; the proprietary `LICENSE` travels with the repo.
- ADR 0008 stands, scoped precisely: it governs the **stack and self-hostability**, not Saldo's own
  source licence (this ADR).
- The OSS **community-health** files (`CODE_OF_CONDUCT.md`, public issue/PR templates, `FUNDING.yml`,
  an RFC process) are **N/A** while the repo is private/proprietary — adopt them only if a public or
  source-available distribution is ever chosen.
- The copyright holder/entity in `LICENSE` is a placeholder (`Martin Underhaug`) — update to the
  operating legal entity before any external distribution.

## Alternatives considered
- **AGPL-3.0 / BSL 1.1 / Apache-2.0.** Open or source-available licences were considered; rejected for
  now — Saldo is a commercial product and there is no community/self-host distribution strategy yet.
  Revisit (via a superseding ADR) if that changes; the self-hostable architecture (ADR 0008) keeps the
  option open.
