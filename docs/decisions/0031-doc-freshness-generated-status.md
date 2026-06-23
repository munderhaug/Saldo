# ADR 0031 — Doc-freshness: generate volatile status, verify the graph against evidence

- **Status:** Accepted
- **Date:** 2026-06-23

## Context
The repo has a recurring failure: `docs/STATUS.md` and the roadmap **restate** facts that already live
in committed sources — the ADR set, the task DAG (`docs/backlog/tasks.json`, ADR 0019), git — so the
restatements rot. ADR counts go stale, "what's next" disagrees with `pnpm backlog`, "decisions current:
ADRs …" lines drift. This violates AGENTS.md's *"state a fact once; link, don't restate."* Every
consistency audit (PR #20) has had to re-fix the same class of drift by hand. A reminder in a skill is
not a gate; the only durable fix is mechanical.

A second, related gap: the task graph records `depends_on` edges but nothing ties a task to the ADR it
implements or the files it touches, so a `done` task can claim work that no longer exists, and a new ADR
can land with no task tracking it — drift that no check catches.

## Decision
Two parts, A then B (owner-decided; the auto-status-from-PRs idea C is deferred — see `rejected.md`).

**A — derive the volatile facts + gate them.** `tools/status-block.mjs` (dependency-free ESM, like
`backlog.mjs`/`repo-lint.mjs`) renders the volatile facts — ADR **count + range** (from
`docs/decisions/0*.md`), backlog **total/done/todo**, and the **highest-value ready task** (reusing
`load`/`readyTasks` from `backlog.mjs`) — into an `<!-- AUTOGEN:repo-status -->…<!-- /AUTOGEN:repo-status -->`
block in `docs/STATUS.md`. Default writes the block; `--check` re-renders and exits non-zero on drift.
`tools/repo-lint.mjs` gains a check that fails when the committed block ≠ the re-render, so editing
`tasks.json` or the ADR set **without** `pnpm status:refresh` fails `pnpm lint:repo` (already run in CI
and the docs PostToolUse hook). The hand-typed facts the block replaces are deleted from STATUS.

Hard constraints, learned: the block carries **only facts derivable from committed files** — never a HEAD
sha, commit date, or branch (it can't contain the commit that writes it, and `branch` false-positives in
CI on `main`); **no test counts** (they need a live run). `--check` **normalizes whitespace** (trims each
line) so a `pnpm format` tweak can't false-fail, while numeric/textual drift still does.

**B — typed edges + evidence-based drift checks.** `tasks.json` gains optional typed edges —
`implements_adr` (ADR numbers), `touches` (path globs), `sources` (`db/reference`/regulatory paths).
`backlog validate` type-checks their shapes; `repo-lint` verifies them against the repo:
**stale-done** (a `done`/`in_progress` task whose `touches` resolve to nothing — an error, a real
contradiction) and **orphan-ADR** (an ADR file no task implements or references — a single warning, since
foundational decisions legitimately have no tracking task). The regulatory-page-past-`verify-by`-with-
dependents check is left for a later increment.

## Consequences
- STATUS's repo-status facts can no longer drift from the graph — the gate fails first. The recurring
  audit-and-fix loop for this class of staleness is closed.
- The handover ritual gains a `pnpm status:refresh` step, and the rule: current-status is
  generated/pointered, never restated; dated session blocks keep their snapshot numbers.
- `backlog.mjs`'s CLI is now guarded (`import.meta.url`) so it can be imported without side effects — a
  prerequisite for reuse, and good hygiene regardless.
- Typed edges make "is this `done` task's work still here?" and "does this ADR have a task?" computable,
  not eyeballed. The cost: a few more optional fields to keep honest at handover (the existing discipline).

## Alternatives considered
- **Keep the reminder-only approach** (a skill step saying "update the counts") — proven to fail; reminders
  rot, gates don't.
- **Auto-flip task status from PR/commit state (plan C)** — deferred: not every task is one PR
  (research/doc/regulatory-capture, multi-PR features), and "done" here means gates-green + ADR + merged,
  richer than "PR merged"; a blind write would lie. A *verified* status (A+B) beats a *blindly-automated*
  one for a system of record. Recorded in the backlog as `harness-status-autopr`.
- **Put more facts in the block** (HEAD, branch, test counts) — rejected: self-reference and live-run
  dependencies make them false-fail; the block is restricted to committed-file-derivable facts.
