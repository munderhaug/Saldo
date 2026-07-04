#!/usr/bin/env node
// Trigger-eval runner for a skill's description — does it activate on the right prompts and stay quiet
// on near-misses? Implements the loop from the optimizing-descriptions guide: fixed train/validation
// split, multiple runs per query, a trigger rate per query, and an HTML report. This is a LOCAL,
// MODEL-DEPENDENT tool (it shells out to `claude -p`), so it is NOT a CI gate — CI enforces only that
// the eval datasets exist and are well-formed (tools/eval-validate.mjs). Output-quality evals
// (evals.json) are run by spawning the skill with/without a fresh agent and grading assertions; see
// the evaluating-skills guide — that loop is driven interactively, not by this script.
//
//   node tools/skill-eval.mjs <skill> [--runs 3] [--report]
//
// Detection note: this parses `claude -p --output-format json` and looks for a Skill tool call naming
// the skill. The exact JSON shape can vary by CLI version — adjust findSkillCall() if detection drifts.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const skill = process.argv[2];
if (!skill) {
  console.error('usage: node tools/skill-eval.mjs <skill> [--runs N] [--report]');
  process.exit(2);
}
const runs = Number(process.argv[includesFlagIndex('--runs') + 1]) || 3;
const wantReport = process.argv.includes('--report');

function includesFlagIndex(f) {
  const i = process.argv.indexOf(f);
  return i === -1 ? -1 : i;
}

// `claude` available?
try {
  execFileSync('claude', ['--version'], { stdio: 'ignore' });
} catch {
  console.log(
    'skill-eval: the `claude` CLI is not on PATH — this is a local, model-dependent tool, not a CI\n' +
      'gate. Install/auth the CLI, then re-run. (CI enforces dataset presence via eval-validate.)',
  );
  process.exit(0);
}

const queries = JSON.parse(
  readFileSync(join('.claude', 'skills', skill, 'evals', 'eval_queries.json'), 'utf8'),
);

// Fixed, reproducible 60/40 split by index (no RNG → same split every run).
const train = queries.filter((_, i) => i % 5 < 3);
const val = queries.filter((_, i) => i % 5 >= 3);

function findSkillCall(node) {
  if (!node || typeof node !== 'object') return false;
  if (node.type === 'tool_use' && node.name === 'Skill' && node?.input?.skill === skill)
    return true;
  return Object.values(node).some(findSkillCall);
}

function triggered(query) {
  try {
    const out = execFileSync('claude', ['-p', query, '--output-format', 'json'], {
      encoding: 'utf8',
      timeout: 120000,
    });
    return findSkillCall(JSON.parse(out));
  } catch {
    return false; // a failed run counts as not-triggered (and is logged in the rate)
  }
}

function evalSet(set) {
  const rows = [];
  for (const q of set) {
    let hits = 0;
    for (let r = 0; r < runs; r++) if (triggered(q.query)) hits++;
    const rate = hits / runs;
    const pass = q.should_trigger ? rate > 0.5 : rate < 0.5;
    rows.push({ ...q, rate, pass });
    process.stdout.write(
      `  [${pass ? 'PASS' : 'FAIL'}] rate=${rate.toFixed(2)} want=${q.should_trigger} :: ${q.query.slice(0, 60)}\n`,
    );
  }
  const passRate = rows.filter((r) => r.pass).length / rows.length;
  return { rows, passRate };
}

console.log(`\nskill-eval: ${skill} — ${runs} run(s) per query\n--- train (${train.length}) ---`);
const trainRes = evalSet(train);
console.log(`--- validation (${val.length}) ---`);
const valRes = evalSet(val);
console.log(
  `\ntrain pass-rate ${(trainRes.passRate * 100).toFixed(0)}%  |  validation pass-rate ${(valRes.passRate * 100).toFixed(0)}%`,
);

if (wantReport) {
  mkdirSync('reports', { recursive: true });
  const row = (r) =>
    `<tr class="${r.pass ? 'p' : 'f'}"><td>${r.pass ? 'PASS' : 'FAIL'}</td><td class="n">${r.rate.toFixed(2)}</td><td>${r.should_trigger}</td><td>${escapeHtml(r.query)}</td></tr>`;
  const table = (title, res) =>
    `<h2>${title} — ${(res.passRate * 100).toFixed(0)}%</h2><table><thead><tr><th>result</th><th>rate</th><th>should-trigger</th><th>query</th></tr></thead><tbody>${res.rows.map(row).join('')}</tbody></table>`;
  const html = `<!doctype html><meta charset="utf-8"><title>skill-eval ${skill}</title><style>body{font:14px system-ui;margin:2rem;max-width:60rem}table{border-collapse:collapse;width:100%;margin:.5rem 0}th,td{border:1px solid #ddd;padding:.3rem .5rem;text-align:left}.n{font-variant-numeric:tabular-nums;text-align:right}.p td{background:#f3fbf3}.f td{background:#fdecec}</style><h1>Trigger eval — ${skill}</h1><p>${runs} run(s) per query · generated ${new Date().toISOString()}</p>${table('Train', trainRes)}${table('Validation', valRes)}`;
  const path = join('reports', `skill-eval-${skill}.html`);
  writeFileSync(path, html);
  console.log(`report → ${path}`);
}

// Non-zero exit if the validation set regressed below an acceptable bar, so a CI/manual run can fail.
process.exit(valRes.passRate >= 0.8 ? 0 : 1);

function escapeHtml(s) {
  return s.replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
  );
}
