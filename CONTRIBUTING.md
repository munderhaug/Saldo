# Contributing to Saldo

Saldo is a production-grade financial system of record. Read `docs/quality-bar.md` first — every
change must meet that Definition of Done.

## Workflow
1. **Branch** off `main`: `git checkout -b claude/<topic>` (or `feat/…`, `fix/…`). Never commit to
   `main` directly — it is protected and merges go through a reviewed PR.
2. Follow the loop (see `.claude/skills/new-feature`): plan → domain-first (test-first for money/VAT)
   → Zod contracts → migration (SQL → `db:introspect`) → route (loader/action) → UI (shadcn) → verify.
3. Keep commits focused and semantic. Author identity: `noreply@anthropic.com` for agent commits.
4. Open a PR. CI must be green; the relevant reviewer subagent and a human must approve.

## Local checks (run before pushing)
```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm audit --audit-level=high
```

## Hard invariants (non-negotiable)
The full list lives in **[`AGENTS.md`](AGENTS.md)** + the path-scoped rules in `.claude/rules/` — the
single source. Read them there before changing money, the ledger, VAT, or posting; don't restate them.

## End every session
Run the `handover` skill: verify green, update `docs/STATUS.md`, commit, push your branch, report.
