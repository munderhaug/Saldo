# ADR 0019 — Agentic memory: a committed task graph + a rejected-approaches log

- **Status:** Accepted
- **Date:** 2026-06-23

## Context
Sessions are ephemeral; only what's committed survives. Two kinds of context were being lost between
sessions:

1. **Order.** The backlog lived as prose (STATUS.md, the roadmap). For a multi-phase plan where order
   matters — hardening → auth → Enhetsregisteret → Phase 1 — a flat doc can't answer "what is the
   highest-value task that is *ready* (all prerequisites done) right now?". Dependencies are implicit.
2. **Abandoned approaches.** ADRs record decisions that were *kept*. Nothing structured recorded what was
   *tried and rejected, and why* — the most expensive context to lose, because the next session
   re-discovers the same dead end.

The `piyaz` project frames both well (a dependency-aware task DAG + execution records of abandoned
approaches). But piyaz is a hosted SaaS + MCP server: adopting the product would move planning context
**off-repo** and add an external dependency — the opposite of Saldo's "everything committed,
source-grounded, survives the ephemeral session" stance.

## Decision
Build piyaz's two ideas **natively** in-repo, dependency-free:

- **`docs/backlog/tasks.json`** — the backlog as a DAG (`depends_on` edges). **`tools/backlog.mjs`**
  (plain Node, like `repo-lint.mjs`) validates it (schema, dangling deps, cycles) and answers
  `next` / `ready` / `list`, ordering by value → **leverage** (how much downstream work a task
  unblocks) → effort. `pnpm backlog validate` runs in CI.
- **`docs/decisions/rejected.md`** — a structured, append-only log of approaches tried and abandoned
  (the "anti-ADR"), so a dead end is recorded once, not re-walked.

Both are wired into the handover ritual and discoverable via a `/backlog` skill.

## Consequences
- "What's next" is now computable and dependency-aware, and it stays correct as tasks complete — the
  graph re-ranks. The first real proof: with auth's prerequisites clear, `backlog next` surfaces
  `pr5-auth` precisely because it unblocks the most downstream work.
- Two more living surfaces to keep honest at handover. They are **not** per-session logs (the handover
  rule still bans those) — they are singular, mutated-in-place records, like STATUS and the ADR set.
- No SaaS, no new runtime dependency, no off-repo context. The trade-off vs. piyaz: no hosted UI or
  automatic context-shaping — acceptable for a solo, agent-built repo where the files *are* the source
  of truth and the agent reads them directly.

## Alternatives considered
- **Adopt piyaz (the product)** — richer (hosted UI, MCP context-shaping), but off-repo planning state
  and an external dependency; rejected on residency/sovereignty + simplicity grounds.
- **Keep prose only** — zero tooling, but can't answer "highest-value ready task" and loses rejected
  approaches; the gap this ADR exists to close.
- **A heavier local DB/graph** — over-built for a backlog of dozens of tasks; a validated JSON file +
  a small query script is enough and reviews cleanly in a PR diff.
