---
name: backlog
description: Query and maintain Saldo's dependency-aware task graph (docs/backlog/tasks.json) and the rejected-approaches log. Use to decide what to work on next, to record a new task or a dependency, to mark work done, or to log an approach you tried and abandoned. The graph answers "highest-value READY task" — which a prose backlog can't.
---
# Backlog

Saldo's plan is a **DAG**, not prose, so order and readiness are computable (ADR 0019). Two surfaces:
`docs/backlog/tasks.json` (the graph) and `docs/decisions/rejected.md` (approaches abandoned).

## Decide what to do next
```sh
pnpm backlog          # the single highest-value READY task (value → leverage → effort)
pnpm backlog ready    # all ready tasks, best first
pnpm backlog list     # the whole graph by status, with blockers shown
```
Prefer `backlog next` over guessing from STATUS prose — it accounts for dependencies (a task that
unblocks more downstream work outranks an equal-value leaf).

## Maintain the graph (edit `docs/backlog/tasks.json`)
- **New work** → add a task `{ id, title, status:"todo", value, effort, phase, depends_on, notes, refs }`.
- **Started / finished** → flip `status` to `in_progress` / `done`. Re-run `pnpm backlog next`.
- **Dropped** → `status:"cancelled"` + a `cancelled_reason` (and `superseded_by` if a new task replaces it).
- **Order matters** → wire `depends_on` so readiness is honest. `pnpm backlog validate` rejects dangling
  deps and cycles (it also runs in CI).

## Record an abandoned approach
When you try something and back it out, append an `R-NNNN` entry to `docs/decisions/rejected.md`
(template at the top). This is the highest-leverage thing to capture — it stops the next session
re-walking the dead end. ADRs are for decisions you *kept*; rejected.md is for the ones you *didn't*.

## At handover
Update `tasks.json` (statuses, new tasks) and append any rejected approaches, alongside STATUS.
