#!/usr/bin/env node
// Saldo's task-graph tool (ADR 0019). Reads docs/backlog/tasks.json — a dependency-aware DAG — and
// answers the question a prose backlog can't: "what is the highest-value READY task right now?".
// Dependency-free (plain Node, like repo-lint.mjs). Usage:
//   node tools/backlog.mjs validate   # schema + dangling-dep + cycle check (CI gate)
//   node tools/backlog.mjs next       # the single highest-value ready task (default)
//   node tools/backlog.mjs ready      # all ready tasks, best first
//   node tools/backlog.mjs list       # the whole graph by status, with blockers
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = resolve(root, 'docs/backlog/tasks.json');

const STATUS = ['todo', 'in_progress', 'done', 'cancelled'];
const VALUE = { high: 3, medium: 2, low: 1 };
const EFFORT = { S: 1, M: 2, L: 3 };
const DONE = new Set(['done', 'cancelled']);

export function load() {
  const data = JSON.parse(readFileSync(FILE, 'utf8'));
  return data.tasks ?? [];
}

/** Validate the graph. Returns an array of error strings (empty = OK). */
export function validateBacklog() {
  let tasks;
  try {
    tasks = load();
  } catch (e) {
    return [`tasks.json failed to parse: ${e.message}`];
  }
  const errors = [];
  const ids = new Set();
  for (const t of tasks) {
    if (!t.id) errors.push(`a task is missing "id"`);
    else if (ids.has(t.id)) errors.push(`${t.id}: duplicate id`);
    else ids.add(t.id);
    if (!STATUS.includes(t.status)) errors.push(`${t.id}: bad status "${t.status}"`);
    if (!(t.value in VALUE)) errors.push(`${t.id}: bad value "${t.value}"`);
    if (!(t.effort in EFFORT)) errors.push(`${t.id}: bad effort "${t.effort}"`);
    if (!Array.isArray(t.depends_on)) errors.push(`${t.id}: depends_on must be an array`);
    if (t.status === 'cancelled' && !t.cancelled_reason)
      errors.push(`${t.id}: cancelled tasks need a cancelled_reason`);
    // Optional typed edges (the knowledge graph, ADR 0031): shapes only — ADR existence,
    // touches-evidence, and orphan detection are verified against the repo in tools/repo-lint.mjs.
    if ('implements_adr' in t) {
      if (!Array.isArray(t.implements_adr)) errors.push(`${t.id}: implements_adr must be an array`);
      else
        for (const a of t.implements_adr)
          if (typeof a !== 'string' || !/^\d{4}$/.test(a))
            errors.push(`${t.id}: implements_adr entry "${a}" must be a 4-digit ADR number`);
    }
    for (const key of ['touches', 'sources'])
      if (key in t && (!Array.isArray(t[key]) || t[key].some((s) => typeof s !== 'string')))
        errors.push(`${t.id}: ${key} must be an array of strings`);
  }
  // Dangling dependencies.
  for (const t of tasks)
    for (const d of t.depends_on ?? [])
      if (!ids.has(d)) errors.push(`${t.id}: depends_on unknown task "${d}"`);
  // Cycle detection (DFS colouring).
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const color = new Map(); // 0 = visiting, 1 = done
  const visit = (id, stack) => {
    if (color.get(id) === 1) return;
    if (color.get(id) === 0) {
      errors.push(`dependency cycle: ${[...stack, id].join(' -> ')}`);
      return;
    }
    color.set(id, 0);
    for (const d of byId.get(id)?.depends_on ?? []) if (byId.has(d)) visit(d, [...stack, id]);
    color.set(id, 1);
  };
  for (const t of tasks) visit(t.id, []);
  return errors;
}

function isReady(t, byId) {
  return t.status === 'todo' && (t.depends_on ?? []).every((d) => DONE.has(byId.get(d)?.status));
}

/** How many not-yet-done tasks list `id` as a prerequisite — i.e. how much work finishing it frees. */
function unblockCount(tasks) {
  const n = new Map(tasks.map((t) => [t.id, 0]));
  for (const t of tasks)
    if (!DONE.has(t.status))
      for (const d of t.depends_on ?? []) if (n.has(d)) n.set(d, n.get(d) + 1);
  return n;
}

/**
 * Order ready work by: value (high first), then leverage (unblocks the most downstream work — this is
 * what a graph buys over a flat list), then effort (quicker wins first), then id for stability.
 */
function rank(unblocks) {
  return (a, b) =>
    VALUE[b.value] - VALUE[a.value] ||
    unblocks.get(b.id) - unblocks.get(a.id) ||
    EFFORT[a.effort] - EFFORT[b.effort] ||
    a.id.localeCompare(b.id);
}

export function readyTasks() {
  const tasks = load();
  const byId = new Map(tasks.map((t) => [t.id, t]));
  return tasks.filter((t) => isReady(t, byId)).sort(rank(unblockCount(tasks)));
}

function fmt(t) {
  return `  ${t.id}  [${t.value}/${t.effort}]  ${t.title}`;
}

// Run the CLI only when invoked directly — NOT when imported (status-block.mjs / repo-lint.mjs
// import load + readyTasks; a top-level dispatch would fire on import).
if (resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const cmd = process.argv[2] ?? 'next';
  if (cmd === 'validate') {
    const errors = validateBacklog();
    if (errors.length) {
      for (const e of errors) console.error('error: ' + e);
      console.error(`\nbacklog: FAILED with ${errors.length} error(s).`);
      process.exit(1);
    }
    console.log(`backlog: OK — ${load().length} tasks, graph is acyclic and fully resolved.`);
  } else if (cmd === 'next') {
    const ready = readyTasks();
    if (!ready.length) {
      console.log('backlog: nothing ready — every todo is blocked or the graph is complete.');
    } else {
      console.log('Next (highest-value ready task):');
      console.log(fmt(ready[0]));
      if (ready.length > 1)
        console.log(`\n(${ready.length - 1} more ready — 'backlog ready' to see all.)`);
    }
  } else if (cmd === 'ready') {
    const ready = readyTasks();
    console.log(ready.length ? 'Ready tasks (best first):' : 'Nothing ready.');
    for (const t of ready) console.log(fmt(t));
  } else if (cmd === 'list') {
    const tasks = load();
    const byId = new Map(tasks.map((t) => [t.id, t]));
    for (const s of STATUS) {
      const group = tasks.filter((t) => t.status === s);
      if (!group.length) continue;
      console.log(`\n${s.toUpperCase()} (${group.length})`);
      for (const t of group) {
        const blockers = (t.depends_on ?? []).filter((d) => !DONE.has(byId.get(d)?.status));
        const tag =
          t.status === 'todo'
            ? blockers.length
              ? ` ⛔ blocked by ${blockers.join(', ')}`
              : ' ✅ ready'
            : '';
        console.log(fmt(t) + tag);
      }
    }
  } else {
    console.error(`unknown command "${cmd}" — use validate | next | ready | list`);
    process.exit(2);
  }
}
