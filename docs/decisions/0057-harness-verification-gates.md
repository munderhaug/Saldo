# ADR 0057 — Harness verification gates (reviewer gate, skill evals, incremental gates)

- **Status:** Accepted
- **Date:** 2026-06-27

## Context
A review of the `.claude/` harness against Anthropic's published skill/subagent/hook guidance found
that the harness asserted verification it did not perform — the worst failure mode, because it
manufactures false confidence:

- **Reviewer layer was a reminder, not a gate.** The review subagents (`vat-reviewer`,
  `ai-act-reviewer`, …) were invoked only by prose ("Use proactively after …"). Nothing enforced
  them, directly contradicting our own "prefer a mechanical gate over a reminder" rule for the most
  safety-relevant code (the VAT/posting/rules core and the LLM/AI surface).
- **`house-standards.md` promised skill evals that did not exist.** The claim that load-bearing
  skills "get trigger + with/without-skill evals before they're trusted" was aspirational — zero eval
  files were in the repo.
- **Edit-time gate ran the whole monorepo on every edit** (`turbo run typecheck`, whose
  `dependsOn: ["^build"]` rebuilt upstream each time), and the Stop gate re-ran typecheck/lint plus
  the full domain suite on *every* turn — including docs-only and pure-conversation turns.
- Reviewer subagents were hard-pinned to `model: opus`, and the permission allowlist omitted commands
  the skills invoke on day one.

## Decision
Make the harness keep its own promises with mechanical gates:

1. **Reviewer gate.** `tools/review-gate.mjs` (`pnpm review:check`, in CI) fails a branch whose
   `origin/main..HEAD` diff touches `packages/domain/{vat,posting,rules}` or the LLM/AI-assisted
   surface without a `Reviewed-by: <reviewer>` commit trailer. A non-blocking PostToolUse reminder
   (`.claude/scripts/review-reminder.sh`) prompts in-loop.
2. **Skill evals.** Every load-bearing skill carries `evals/eval_queries.json` (trigger) and
   `evals/evals.json` (output-quality). `tools/eval-validate.mjs` (`pnpm eval:validate`, in CI) fails
   if a set is missing or malformed; `tools/skill-eval.mjs` runs the trigger loop locally.
3. **Incremental gates.** `precommit-check.sh` typechecks/lints only the edited file's workspace
   package; `green-bar.sh` runs the domain suite at turn end only when a `.git/saldo-turn-dirty`
   marker shows the turn touched TypeScript.
4. **Defaults.** Reviewer/author subagents use `model: inherit`; the allowlist is synced with the
   skills; bundled skill logic is tested (e.g. `next-adr.mjs` + `node:test`, run via `pnpm
   test:tools`).

## Consequences
- Skipping a domain/AI review, or shipping a load-bearing skill with no evals, is now a hard CI
  failure rather than a silent omission.
- Edit-time feedback drops from a full-monorepo run to a single cache-warm package (~0.7s); no-op
  turns skip the gate entirely.
- Accepted costs: the reviewer trailer is self-attestation (the gate verifies presence, not diligence)
  — it forces the step into the workflow but does not prove the review was thorough; and
  `skill-eval.mjs` is model-dependent, so only dataset *presence* is enforced in CI, not live
  trigger-rate.

## Alternatives considered
- **A blocking PreToolUse hook that runs the reviewer subagent.** Rejected: hooks cannot spawn
  subagents, and blocking every domain edit mid-task would trap the loop. The CI gate + in-loop
  reminder achieves enforcement without the trap.
- **Running the full eval suite in CI.** Rejected: it requires the model, is nondeterministic, and is
  slow/costly; CI enforces dataset presence and the trigger loop stays a local tool.
- **Leaving the gates whole-repo but relying on turbo cache.** Rejected: cache hits help repeated
  identical states, but each edit invalidates the changed package and its `^build` chain, so per-edit
  cost stayed high.
