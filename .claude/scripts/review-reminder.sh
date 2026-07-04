#!/usr/bin/env bash
# PostToolUse hook (matcher: Edit|Write). NON-BLOCKING in-loop companion to the merge-time review
# gate (tools/review-gate.mjs). When an edit lands on a sensitive surface, it prints a loud reminder
# naming the exact reviewer subagent to run and how to record it. It never blocks the edit — the hard
# stop is the CI gate (`pnpm review:check`), which fails the PR if the recorded review is missing.
set -uo pipefail

payload="$(cat)"
path="$(printf '%s' "$payload" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);process.stdout.write(j.tool_input?.file_path||"")}catch{process.stdout.write("")}})')"
[ -z "$path" ] && exit 0

# Normalise to a repo-relative path so the globs match regardless of absolute prefix.
root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
rel="${path#"$root"/}"

reviewer=""
why=""
case "$rel" in
  packages/domain/src/vat/*|packages/domain/src/posting/*|packages/domain/src/rules/*)
    reviewer="vat-reviewer"; why="VAT / posting / rules logic" ;;
  apps/web/app/integrations/llm/*|apps/web/app/contracts/receipt-extraction*|*ai-assisted*|*provenance*)
    reviewer="ai-act-reviewer"; why="LLM / AI-assisted surface (EU AI Act Art. 50 + propose-only)" ;;
  *) exit 0 ;;
esac

echo "────────────────────────────────────────────────────────────────────" >&2
echo "REVIEW REQUIRED: you edited $why" >&2
echo "  → Run the ${reviewer} subagent over this change before ending the task." >&2
echo "  → Record it on a commit so CI passes:   Reviewed-by: ${reviewer}" >&2
echo "  (pnpm review:check enforces this; an unrecorded review fails the PR.)" >&2
echo "────────────────────────────────────────────────────────────────────" >&2
exit 0
