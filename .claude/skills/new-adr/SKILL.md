---
name: new-adr
description: Scaffold the next-numbered Architecture Decision Record from the template in docs/decisions/. Use whenever a decision needs recording — a new ADR, or superseding an existing one. Computes the next number deterministically so an ADR is never mis-numbered or referenced before it exists (the repo-lint contradiction gate enforces that every "ADR NNNN" cross-reference resolves).
allowed-tools: Bash(node .claude/skills/new-adr/scripts/next-adr.mjs) Bash(cp docs/decisions/*) Bash(pnpm lint:repo) Read Write Glob Grep
---

# New ADR

Architecture Decisions live in `docs/decisions/NNNN-<kebab-title>.md`. Numbers are gapless and
zero-padded to four digits. The repo-lint gate (`pnpm lint:repo`) FAILS CI if any doc references an
`ADR NNNN` that has no file — so create the ADR file before citing it.

## Steps

1. **Compute the next number** (don't eyeball it) — a bundled, unit-tested script, not a retyped
   shell pipeline:
   ```sh
   node .claude/skills/new-adr/scripts/next-adr.mjs   # prints the next number, e.g. 0052
   ```
2. **Create** `docs/decisions/NNNN-<kebab-title>.md` from the template:
   ```sh
   cp docs/decisions/adr-template.md docs/decisions/NNNN-<kebab-title>.md
   ```
3. **Fill it in** — replace the `NNNN — <title>` heading; set **Status** (`Accepted` for a decision
   taken now) and **Date** (today, `YYYY-MM-DD`); write Context / Decision / Consequences /
   Alternatives. Keep it tight: the decision and its *why*, not an essay.
4. **Supersession** (if replacing an earlier ADR): set the new ADR's status to reference the old one,
   and edit the superseded ADR's status to `Superseded by ADR-NNNN`. Never use "Locked" as a status
   label (the vocabulary is Current / Intended / Superseded; `lint:repo` bans "Locked").
5. **Wire references** — link the ADR from `docs/decisions/README.md` and any rule/doc it governs.
6. **Verify**: `pnpm lint:repo` (resolves the new cross-reference; checks links). Update `STATUS.md`.

## Red flags — STOP
- Reusing or skipping a number · citing `ADR NNNN` in prose before the file exists (CI will fail) ·
  a decision recorded in a rule/STATUS but with no ADR · marking something "Locked".
