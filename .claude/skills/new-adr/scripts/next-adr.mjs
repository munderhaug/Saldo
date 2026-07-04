#!/usr/bin/env node
// Compute the next gapless, zero-padded ADR number for docs/decisions/.
//
// Replaces the fragile inline `ls | grep | sort | tail | sed` pipeline that the new-adr skill used
// to ask the agent to retype from prose each run (the KB: bundle a tested script when the agent would
// otherwise reinvent the logic). The repo-lint contradiction gate fails CI if an `ADR NNNN` reference
// resolves to no file, so getting this number right matters.
//
//   node .claude/skills/new-adr/scripts/next-adr.mjs            # next number for ./docs/decisions
//   node .claude/skills/new-adr/scripts/next-adr.mjs <dir>      # next number for an explicit dir
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

/** Pure: given directory entry names, return the next zero-padded 4-digit ADR number. */
export function nextAdrNumber(entries) {
  const nums = entries
    .map((name) => /^(\d{4})-/.exec(name)?.[1])
    .filter((n) => n !== undefined)
    .map(Number);
  const max = nums.length ? Math.max(...nums) : 0;
  return String(max + 1).padStart(4, '0');
}

// Run as CLI only when invoked directly (not when imported by the test).
if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = process.argv[2] ?? join(process.cwd(), 'docs', 'decisions');
  process.stdout.write(nextAdrNumber(readdirSync(dir)) + '\n');
}
