#!/usr/bin/env bash
# PostToolUse hook (matcher: Edit|Write). Fast, INCREMENTAL gate: typecheck + lint ONLY the
# workspace package that owns the edited file (turbo caches the rest). Running the whole monorepo
# on every edit — with typecheck's dependsOn:["^build"] rebuilding upstream each time — was the old
# latency sink. Exits non-zero to feed failures back. Also drops a per-turn "dirty" marker so the
# Stop gate (green-bar) knows source changed this turn and runs the test suite once at turn end,
# while a docs-only / question-only turn skips it entirely.
set -uo pipefail

payload="$(cat)"
path="$(printf '%s' "$payload" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);process.stdout.write(j.tool_input?.file_path||"")}catch{process.stdout.write("")}})')"

# Only gate TypeScript source edits.
case "$path" in
  *.ts|*.tsx) ;;
  *) exit 0 ;;
esac

root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

# Fail CLOSED when dependencies are not installed: a gate that cannot run must not pass silently
# (that was the old fail-open bug). Surface it loudly so the agent installs before relying on green.
if [ ! -d "$root/node_modules" ]; then
  echo "precommit-check: node_modules is missing — cannot run typecheck/lint." >&2
  echo "precommit-check: run 'pnpm install' before editing TypeScript (this gate fails closed)." >&2
  exit 2
fi

# Mark the turn dirty so green-bar runs the domain test suite once at the end — even if the edit is
# later committed (a clean worktree must not hide untested in-turn work).
: > "$root/.git/saldo-turn-dirty" 2>/dev/null || true

# Resolve the workspace package that owns the edited file (nearest ancestor package.json).
dir="$(cd "$(dirname "$path")" 2>/dev/null && pwd || echo "")"
pkg=""
while [ -n "$dir" ] && [ "$dir" != "/" ]; do
  if [ -f "$dir/package.json" ]; then
    pkg="$(PKGJSON="$dir/package.json" node -e "try{process.stdout.write(require(process.env.PKGJSON).name||'')}catch{process.stdout.write('')}")"
    break
  fi
  [ "$dir" = "$root" ] && break
  dir="$(dirname "$dir")"
done

fail=0
if [ -n "$pkg" ]; then
  pnpm exec turbo run typecheck lint --filter="$pkg" --output-logs=errors-only || fail=1
else
  # Unknown package — fall back to the full gate rather than skip a check.
  pnpm -s typecheck || fail=1
  pnpm -s lint || fail=1
fi

if [ "$fail" -ne 0 ]; then
  echo "precommit-check: typecheck or lint failed in ${pkg:-the workspace} — fix before continuing." >&2
  exit 2
fi
exit 0
