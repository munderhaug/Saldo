#!/usr/bin/env node
// Review gate — the mechanical backstop for the reviewer-subagent layer. Dependency-free, like
// repo-lint / commit-lint / backlog. The reviewer subagents (vat-reviewer, ai-act-reviewer) used to
// be invoked only by prose ("Use proactively after …") — a reminder, not a gate. This makes skipping
// them visible: when a branch's diff touches a sensitive surface, at least one commit on the branch
// must record the matching reviewer pass via a `Reviewed-by:` trailer, or CI fails.
//
//   node tools/review-gate.mjs                 # gate origin/main..HEAD (the branch's own changes)
//   node tools/review-gate.mjs <base>          # gate against an explicit base ref
//
// Honest about its limits: a trailer is self-attestation (the gate verifies presence, not that the
// review was diligent) — but it forces the step into the workflow and makes an omission a hard CI
// failure instead of a silent skip. Safe in CI: if the range can't be resolved (shallow checkout
// with no origin/main), it prints a notice and exits 0 rather than false-failing a PR.
import { execFileSync } from 'node:child_process';

const baseArg = process.argv[2] ?? 'origin/main';
const git = (args) => execFileSync('git', args, { encoding: 'utf8' });

// Sensitive surface → required reviewer. Scoped to what the report flagged: the domain VAT/posting/
// rules core and the LLM / AI-assisted surface (EU AI Act). db/migrations stays out — it already has
// db:lint (squawk) + Testcontainers integrity tests as its mechanical gates.
const RULES = [
  {
    reviewer: 'vat-reviewer',
    why: 'VAT / posting / rules logic changed',
    test: (f) => /^packages\/domain\/src\/(vat|posting|rules)\//.test(f),
  },
  {
    reviewer: 'ai-act-reviewer',
    why: 'LLM / AI-assisted surface changed (EU AI Act Art. 50 + propose-only boundary)',
    test: (f) =>
      /^apps\/web\/app\/integrations\/llm\//.test(f) ||
      /^apps\/web\/app\/contracts\/receipt-extraction/.test(f) ||
      /ai-assisted/i.test(f) ||
      /provenance/i.test(f),
  },
];

let mergeBase;
try {
  mergeBase = git(['merge-base', baseArg, 'HEAD']).trim();
} catch {
  console.log(`review-gate: base "${baseArg}" not resolvable (shallow checkout?) — skipping.`);
  process.exit(0);
}

const changed = git(['diff', '--name-only', mergeBase, 'HEAD']).split('\n').filter(Boolean);
if (changed.length === 0) {
  console.log('review-gate: OK — no changes in range.');
  process.exit(0);
}

// Collect Reviewed-by trailers across every commit on the branch (case-insensitive, tolerant of
// trailing notes like "vat-reviewer (3 findings addressed)").
const bodies = git(['log', `${mergeBase}..HEAD`, '--format=%B']);
const recorded = new Set(
  [...bodies.matchAll(/^Reviewed-by:\s*([a-z0-9-]+)/gim)].map((m) => m[1].toLowerCase()),
);

const missing = [];
for (const rule of RULES) {
  const hits = changed.filter(rule.test);
  if (hits.length === 0) continue;
  if (!recorded.has(rule.reviewer)) missing.push({ ...rule, hits });
}

if (missing.length === 0) {
  console.log(`review-gate: OK — ${changed.length} changed file(s); required reviews recorded.`);
  process.exit(0);
}

console.error('review-gate: FAILED — sensitive paths changed without a recorded reviewer pass.\n');
for (const m of missing) {
  console.error(`  ${m.reviewer} required — ${m.why}:`);
  for (const f of m.hits.slice(0, 10)) console.error(`    ${f}`);
  if (m.hits.length > 10) console.error(`    … and ${m.hits.length - 10} more`);
  console.error(`  → Run the ${m.reviewer} subagent over the change, then record it with a commit`);
  console.error(`    trailer (on any commit on this branch):  Reviewed-by: ${m.reviewer}\n`);
}
console.error(
  'The reviewer is a mechanical gate, not a reminder: "AI proposes; the rules engine validates;\n' +
    'a human confirms" (AGENTS.md / docs/quality-bar.md). Run the review and record it to proceed.',
);
process.exit(1);
