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
4. **Update docs if a decision or invariant changed**: ADRs (supersede, don't edit), domain-model /
   build-spec, house-standards recurring-corrections. CLAUDE.md changes stay rare and structural.
5. **Push** the branch (only if authorized).
6. **Report** ~5 lines: changed / verified / next / needs-human.

## Start of session
1. Read `CLAUDE.md` + `docs/STATUS.md` (the SessionStart hook prints both + recent commits).
2. `git log --oneline -10` and `git status` — reconcile STATUS against reality; **trust the code**.
3. Pick up STATUS "next up", or the user's new ask.

## Keep updated (the live docs)
STATUS.md (every session) · ADRs (decision change) · tech-stack.md (only via an ADR) · domain-model /
build-spec (rules evolve) · house-standards (corrected twice) · CLAUDE.md (structural only).

## Don't
- Don't create per-session log files — one living STATUS.md + git history + ADRs is the whole surface.
- Don't trust STATUS over the code if they disagree — reconcile to the code.
