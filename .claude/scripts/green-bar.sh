#!/usr/bin/env bash
# Stop hook = the green-bar gate. Runs the deterministic gates ONCE at turn end — but only when the
# turn actually touched TypeScript source (the precommit-check hook drops a .git/saldo-turn-dirty
# marker on each source edit). A docs-only or pure-conversation turn skips the gate entirely, so a
# "thanks" no longer pays for the full domain test suite. typecheck + lint are turbo-cached (the
# per-package edit-time gate already warmed them, so these are near-instant cache hits); the pure
# @saldo/domain test suite is the unique value added here. The Testcontainers integrity suite is
# intentionally SKIPPED — it needs Docker and runs in CI. Exiting non-zero blocks the stop and feeds
# the failure back so the agent restores green (CLAUDE.md: prefer a mechanical gate over a reminder).
set -uo pipefail

payload="$(cat)"
# Avoid an infinite stop-loop: if we are already inside a stop-hook continuation, do not block again.
active="$(printf '%s' "$payload" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);process.stdout.write(String(j.stop_hook_active===true))}catch{process.stdout.write("false")}})')"
[ "$active" = "true" ] && exit 0

root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
marker="$root/.git/saldo-turn-dirty"

# No TypeScript source touched this turn → nothing to verify here.
[ -f "$marker" ] || exit 0

# Can't verify without deps — surface loudly, but don't trap the turn end (this is a reporter, not an
# edit-time gate; the edit-time precommit-check fails closed instead).
if [ ! -d "$root/node_modules" ]; then
  echo "green-bar: node_modules missing — run 'pnpm install' to enable the turn-end gate." >&2
  rm -f "$marker"
  exit 0
fi

fail=0
pnpm -s typecheck || fail=1
pnpm -s lint || fail=1
pnpm -s --filter @saldo/domain test || fail=1

rm -f "$marker"

if [ "$fail" -ne 0 ]; then
  echo "green-bar: typecheck / lint / domain tests are red — fix before ending the turn." >&2
  exit 2
fi
exit 0
