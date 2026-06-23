# Backlog — the queryable task graph

`tasks.json` is Saldo's backlog as a **dependency-aware DAG**, not prose. It answers the one question a
flat doc can't: _what is the highest-value task that is actually ready to start right now?_ — where
"ready" means every prerequisite is done. See ADR 0019.

This complements, not replaces, the other surfaces:

- **STATUS.md** — narrative "where we are / what's next" for a human reading in.
- **roadmap.md** — the reasoning and the master plan.
- **tasks.json** — the machine-checkable graph (order, dependencies, readiness).
- **decisions/** — ADRs (decisions kept) + **rejected.md** (approaches tried and abandoned).

## Query it

```sh
pnpm backlog            # the single highest-value ready task (alias for `next`)
pnpm backlog ready      # all ready tasks, best first
pnpm backlog list       # the whole graph by status, with blockers
pnpm backlog validate   # schema + dangling-dep + cycle check (also runs in CI)
```

Ordering: **value** (high→low), then **leverage** (unblocks the most downstream work — this is what the
graph provides over a flat list), then **effort** (quicker wins first).

## Editing

Edit `tasks.json` by hand; keep it honest. A task is `{ id, title, status, value, effort, phase,
depends_on, notes, refs }`.

- `status`: `todo` · `in_progress` · `done` · `cancelled` (cancelled needs a `cancelled_reason`, and
  may carry `superseded_by`).
- `value`: `high` · `medium` · `low`. `effort`: `S` · `M` · `L`.
- `depends_on`: ids that must be `done` or `cancelled` first. `validate` rejects dangling deps + cycles.

Update it whenever the plan changes — and at session handover, alongside STATUS. When an approach is
abandoned, record it in `../decisions/rejected.md` so the next session doesn't re-try it.
