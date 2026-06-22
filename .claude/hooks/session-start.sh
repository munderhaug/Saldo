#!/bin/bash
# SessionStart hook: install dependencies so tests/linters work, then surface handover context.
# Synchronous (guarantees deps are ready before the agent loop starts; trade-off is slower startup —
# switch to async mode if faster startup is preferred). Idempotent and non-interactive.
set -uo pipefail

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

# 1. Dependencies — container state is cached after the hook completes, so a plain install is fine.
if command -v corepack >/dev/null 2>&1; then
  corepack enable >/dev/null 2>&1 || true
fi
if command -v pnpm >/dev/null 2>&1; then
  pnpm install --prefer-offline >/dev/null 2>&1 || pnpm install >/dev/null 2>&1 || \
    echo "session-start: pnpm install did not complete cleanly — run it manually."
fi

# 2. Handover context (printed into the session so pickup is automatic — see .claude/skills/handover).
echo "──────── Saldo session context ────────"
echo "Branch: $(git branch --show-current 2>/dev/null || echo '?')"
echo "Recent commits:"
git log --oneline -5 2>/dev/null || true
echo ""
echo "docs/STATUS.md (read first; reconcile against the code):"
sed -n '1,45p' docs/STATUS.md 2>/dev/null || echo "(no STATUS.md yet)"
echo "───────────────────────────────────────"
exit 0
