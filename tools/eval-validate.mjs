#!/usr/bin/env node
// Eval-presence gate — keeps house-standards' promise honest: "the load-bearing skills get trigger +
// with/without-skill evals before they're trusted." That claim used to be aspirational (zero eval
// files existed). This gate fails CI if any load-bearing skill is missing a well-formed eval set, so
// the claim can't silently rot back to fiction. It validates STRUCTURE, not model output — actually
// running the evals is a model-dependent local loop (tools/skill-eval.mjs).
//
//   node tools/eval-validate.mjs
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// The load-bearing skills — the ones that gate correctness. Must match docs/house-standards.md §3.
const LOAD_BEARING = [
  'add-migration',
  'new-vat-scenario',
  'saft-validate',
  'ehf-validate',
  'new-feature',
  'regulatory-update',
];

const MIN_TRIGGER_QUERIES = 16; // ~20 per the optimizing-descriptions guide
const MIN_PER_CLASS = 6; // enough should-trigger AND should-not-trigger (near-miss) cases
const MIN_OUTPUT_CASES = 2; // "Start with 2-3 test cases" (evaluating-skills guide)
const MIN_ASSERTIONS = 2; // each output case needs verifiable assertions

const root = process.cwd();
const errors = [];

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    errors.push(`${path}: not valid JSON — ${e.message}`);
    return null;
  }
}

for (const skill of LOAD_BEARING) {
  const dir = join(root, '.claude', 'skills', skill, 'evals');
  const qPath = join(dir, 'eval_queries.json');
  const ePath = join(dir, 'evals.json');

  // Trigger evals -----------------------------------------------------------
  if (!existsSync(qPath)) {
    errors.push(`${skill}: missing evals/eval_queries.json (trigger evals)`);
  } else {
    const q = readJson(qPath);
    if (Array.isArray(q)) {
      if (q.length < MIN_TRIGGER_QUERIES)
        errors.push(`${skill}: ${q.length} trigger queries < ${MIN_TRIGGER_QUERIES}`);
      const pos = q.filter((x) => x && x.should_trigger === true).length;
      const neg = q.filter((x) => x && x.should_trigger === false).length;
      if (pos < MIN_PER_CLASS) errors.push(`${skill}: ${pos} should-trigger < ${MIN_PER_CLASS}`);
      if (neg < MIN_PER_CLASS)
        errors.push(`${skill}: ${neg} should-not-trigger (near-miss) < ${MIN_PER_CLASS}`);
      const bad = q.filter(
        (x) => !x || typeof x.query !== 'string' || typeof x.should_trigger !== 'boolean',
      );
      if (bad.length)
        errors.push(
          `${skill}: ${bad.length} query item(s) not {query:string, should_trigger:boolean}`,
        );
    } else if (q !== null) {
      errors.push(`${skill}: eval_queries.json must be an array`);
    }
  }

  // Output-quality evals ----------------------------------------------------
  if (!existsSync(ePath)) {
    errors.push(`${skill}: missing evals/evals.json (output-quality evals)`);
  } else {
    const e = readJson(ePath);
    if (e && Array.isArray(e.evals)) {
      if (e.evals.length < MIN_OUTPUT_CASES)
        errors.push(`${skill}: ${e.evals.length} output case(s) < ${MIN_OUTPUT_CASES}`);
      e.evals.forEach((c, i) => {
        if (!c || typeof c.prompt !== 'string' || typeof c.expected_output !== 'string')
          errors.push(`${skill}: case[${i}] needs string prompt + expected_output`);
        if (!Array.isArray(c?.assertions) || c.assertions.length < MIN_ASSERTIONS)
          errors.push(`${skill}: case[${i}] needs >= ${MIN_ASSERTIONS} assertions`);
      });
    } else if (e !== null) {
      errors.push(`${skill}: evals.json must be { skill_name, evals: [...] }`);
    }
  }
}

if (errors.length) {
  for (const e of errors) console.error('error: ' + e);
  console.error(`\neval-validate: FAILED — ${errors.length} issue(s) across load-bearing skills.`);
  process.exit(1);
}
console.log(
  `eval-validate: OK — ${LOAD_BEARING.length} load-bearing skills have well-formed eval sets.`,
);
