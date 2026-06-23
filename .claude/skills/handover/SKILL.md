---
name: handover
description: Run the session handover ritual so work survives the ephemeral environment. Use before ending a session, when context is about to compact, or when starting fresh on this repo.
---
# Handover

The container is ephemeral — only committed/pushed code and the repo's docs survive. STATUS.md is the
forward-looking state ("where we are, what's next"); git history is the record ("what changed").

## End of session
1. **Commit** focused changes. Author must be correct: `git config user.email noreply@anthropic.com`.
2. **Verify and record** the result: `pnpm typecheck && pnpm lint && pnpm test` — note pass/fail + the
   commit hash in STATUS.md.
3. **Update `docs/STATUS.md`**: verified state · done · in-progress (exact file + next step) · next up ·
   open decisions · known issues.
4. **Update the task graph** (`docs/backlog/tasks.json`): flip finished tasks to `done`, add new tasks
   + dependencies, run `pnpm backlog validate`. Append any **abandoned approach** to
   `docs/decisions/rejected.md` (the `/backlog` skill) — it's the cheapest way to stop the next session
   re-walking a dead end.
5. **Update docs if a decision or invariant changed**: ADRs (supersede, don't edit), domain-model /
   build-spec, house-standards recurring-corrections. CLAUDE.md changes stay rare and structural.
6. **Push** the branch (only if authorized).
7. **Report** ~5 lines: changed / verified / next / needs-human.

## Start of session
1. Read `CLAUDE.md` + `docs/STATUS.md` (the SessionStart hook prints both + recent commits).
2. `git log --oneline -10` and `git status` — reconcile STATUS against reality; **trust the code**.
3. Pick up STATUS "next up", or the user's new ask.

## Keep updated (the live docs)
STATUS.md (every session) · backlog/tasks.json + decisions/rejected.md (every session) · ADRs (decision
change) · tech-stack.md (only via an ADR) · domain-model / build-spec (rules evolve) · house-standards
(corrected twice) · CLAUDE.md (structural only).

## Don't
- Don't create per-session log files — the living surfaces (STATUS.md, `backlog/tasks.json`,
  `decisions/rejected.md`) + git history + ADRs are the whole record. Those four are singular and
  mutated in place, never per-session copies.
- Don't trust STATUS over the code if they disagree — reconcile to the code.
