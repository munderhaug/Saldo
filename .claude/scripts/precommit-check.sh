#!/usr/bin/env bash
# PostToolUse hook (matcher: Edit|Write). Runs deterministic gates after an edit and
# exits non-zero to feed failures back to the agent. Keep it FAST — typecheck + lint only;
# the full test suite runs on demand / in CI.
set -uo pipefail

payload="$(cat)"
path="$(printf '%s' "$payload" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);process.stdout.write(j.tool_input?.file_path||"")}catch{process.stdout.write("")}})')"

# Only gate source edits.
case "$path" in
  *.ts|*.tsx) ;;
  *) exit 0 ;;
esac

# Fail CLOSED when dependencies are not installed: a gate that cannot run must not pass silently
# (that was the old fail-open bug). Surface it loudly so the agent installs before relying on green.
if [ ! -d node_modules ]; then
  echo "precommit-check: node_modules is missing — cannot run typecheck/lint." >&2
  echo "precommit-check: run 'pnpm install' before editing TypeScript (this gate fails closed)." >&2
  exit 2
fi

fail=0
pnpm -s typecheck || fail=1
pnpm -s lint || fail=1
if [ "$fail" -ne 0 ]; then
  echo "precommit-check: typecheck or lint failed — fix before continuing." >&2
  exit 2
fi
exit 0
