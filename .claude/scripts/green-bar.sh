#!/usr/bin/env bash
# Stop hook = the green-bar gate. When the agent finishes a turn, run the FAST deterministic gates
# (typecheck + lint + the pure domain tests). The Testcontainers integrity suite is intentionally
# SKIPPED here — it needs Docker and is slow; it runs in CI. Exiting non-zero blocks the stop and
# feeds the failure back so the agent restores green before ending the turn (CLAUDE.md: prefer a
# mechanical gate over a reminder).
set -uo pipefail

payload="$(cat)"
# Avoid an infinite stop-loop: if we are already inside a stop-hook continuation, do not block again.
active="$(printf '%s' "$payload" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);process.stdout.write(String(j.stop_hook_active===true))}catch{process.stdout.write("false")}})')"
[ "$active" = "true" ] && exit 0

# Can't verify without deps — surface loudly, but don't trap the turn end (this is a reporter, not an
# edit-time gate; the edit-time precommit-check fails closed instead).
if [ ! -d node_modules ]; then
  echo "green-bar: node_modules missing — run 'pnpm install' to enable the turn-end gate." >&2
  exit 0
fi

fail=0
pnpm -s typecheck || fail=1
pnpm -s lint || fail=1
pnpm -s --filter @saldo/domain test || fail=1
if [ "$fail" -ne 0 ]; then
  echo "green-bar: typecheck / lint / domain tests are red — fix before ending the turn." >&2
  exit 2
fi
exit 0
