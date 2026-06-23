#!/usr/bin/env node
// Saldo's doc-freshness generator (ADR 0031). Renders the *volatile* repo-status facts — the ones
// that rot when restated by hand — from committed sources into an AUTOGEN block in docs/STATUS.md:
//   • ADR count + range          (docs/decisions/0*.md)
//   • backlog total/done/todo    (docs/backlog/tasks.json, via backlog.mjs)
//   • the highest-value ready task (the DAG, via backlog.mjs)
// "State a fact once; link, don't restate" (AGENTS.md) — so the doc derives from the graph, never
// drifts from it, and tools/repo-lint.mjs gates the drift. Dependency-free, like backlog.mjs.
//   node tools/status-block.mjs           # write the block into docs/STATUS.md (pnpm status:refresh)
//   node tools/status-block.mjs --check   # re-render; exit 1 on drift (pnpm status:check)
//
// NEVER put a HEAD sha / commit date / branch here: the block can't contain the commit that writes
// it (always one behind), and branch false-positives in CI on main. Facts must derive from committed
// files only. Test counts stay out too — they need a live run, not a committed source.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load, readyTasks } from './backlog.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const STATUS_FILE = resolve(root, 'docs/STATUS.md');
const DECISIONS_DIR = resolve(root, 'docs/decisions');

export const BEGIN = '<!-- AUTOGEN:repo-status -->';
export const END = '<!-- /AUTOGEN:repo-status -->';

function adrFacts() {
  const nums = readdirSync(DECISIONS_DIR)
    .map((f) => f.match(/^(\d{4})-.*\.md$/))
    .filter(Boolean)
    .map((m) => m[1])
    .sort();
  return { count: nums.length, first: nums[0], last: nums.at(-1) };
}

function backlogFacts() {
  const tasks = load();
  const count = (s) => tasks.filter((t) => t.status === s).length;
  const parts = [`${count('done')} done`, `${count('todo')} todo`];
  if (count('in_progress')) parts.push(`${count('in_progress')} in progress`);
  if (count('cancelled')) parts.push(`${count('cancelled')} cancelled`);
  return { total: tasks.length, breakdown: parts.join(', '), next: readyTasks()[0] ?? null };
}

/** The canonical AUTOGEN block (markers included). The single source the doc must match. */
export function renderBlock() {
  const adr = adrFacts();
  const b = backlogFacts();
  const next = b.next
    ? `\`${b.next.id}\` [${b.next.value}/${b.next.effort}] — ${b.next.title}`
    : 'none — every todo is blocked or the graph is complete';
  return [
    BEGIN,
    '<!-- Generated from committed sources by tools/status-block.mjs — DO NOT EDIT BY HAND; run `pnpm status:refresh`. -->',
    `- **Decisions:** ${adr.count} ADRs (${adr.first}–${adr.last}) — index in [\`docs/decisions/README.md\`](decisions/README.md).`,
    `- **Backlog:** ${b.total} tasks (${b.breakdown}) — the DAG is [\`docs/backlog/tasks.json\`](backlog/tasks.json) (\`pnpm backlog\`).`,
    `- **Highest-value ready task:** ${next}`,
    END,
  ].join('\n');
}

/** The block currently in STATUS.md (markers included), or null if the markers are absent. */
export function extractBlock(text) {
  const b = text.indexOf(BEGIN);
  const e = text.indexOf(END);
  if (b === -1 || e === -1 || e < b) return null;
  return text.slice(b, e + END.length);
}

/** Normalize for comparison: trim each line + the ends, so a `pnpm format` whitespace tweak can't
 *  false-fail the gate. Numeric/textual drift still fails. */
export const normalizeBlock = (s) =>
  s
    .split('\n')
    .map((l) => l.trimEnd())
    .join('\n')
    .trim();

if (resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const block = renderBlock();
  const text = readFileSync(STATUS_FILE, 'utf8');
  const current = extractBlock(text);
  if (process.argv.includes('--check')) {
    if (current === null) {
      console.error('status-block: AUTOGEN:repo-status markers missing in docs/STATUS.md.');
      process.exit(1);
    }
    if (normalizeBlock(current) !== normalizeBlock(block)) {
      console.error(
        'status-block: docs/STATUS.md repo-status block is STALE — run `pnpm status:refresh`.',
      );
      process.exit(1);
    }
    console.log('status-block: OK — repo-status block matches committed sources.');
  } else {
    if (current === null) {
      console.error(
        'status-block: AUTOGEN:repo-status markers missing in docs/STATUS.md — add the block first.',
      );
      process.exit(1);
    }
    writeFileSync(STATUS_FILE, text.replace(current, block));
    console.log('status-block: wrote repo-status block to docs/STATUS.md.');
  }
}
