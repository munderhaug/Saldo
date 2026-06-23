#!/usr/bin/env bash
# PostToolUse hook (matcher: Edit|Write). After an edit to docs/** or .claude/**, run the repo
# hygiene gate so a broken ADR cross-reference, a dead internal doc link, a missing cited
# db/reference source, or a reintroduced "Locked" label is caught at edit time — not in CI.
# Dependency-free (the linter is plain Node); fast.
set -uo pipefail

payload="$(cat)"
path="$(printf '%s' "$payload" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);process.stdout.write(j.tool_input?.file_path||"")}catch{process.stdout.write("")}})')"

# Only gate edits to docs/ or the .claude/ harness.
case "$path" in
  */docs/*|*/.claude/*) ;;
  *) exit 0 ;;
esac

if node "$(git rev-parse --show-toplevel 2>/dev/null || echo .)/tools/repo-lint.mjs"; then
  exit 0
fi
echo "lint:repo failed — fix the doc/harness issue above before continuing." >&2
exit 2
