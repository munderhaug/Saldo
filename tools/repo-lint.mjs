#!/usr/bin/env node
// Repo hygiene gate: validates the .claude/ harness frontmatter, internal doc-link integrity, the
// cited-&-dated convention for regulatory/integration pages, neutral documentation voice (no
// reader-addressing second person), and the no-contradiction invariants (ADR cross-references
// resolve, no "Locked" status label, cited db/reference paths exist).
// Dependency-free. Run via `pnpm lint:repo`.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load as loadTasks } from './backlog.mjs';
import { renderBlock, extractBlock, normalizeBlock } from './status-block.mjs';
import {
  renderBlock as renderArchBlock,
  extractBlock as extractArchBlock,
  domainPurityViolations,
} from './arch-graph.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const warnings = [];
const today = new Date().toISOString().slice(0, 10);

const rel = (p) => relative(root, p);
const read = (p) => readFileSync(p, 'utf8');
const frontmatter = (text) => {
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  return m ? m[1] : null;
};
function walk(dir, filter) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p, filter));
    else if (filter(p)) out.push(p);
  }
  return out;
}

// A) .claude/ harness frontmatter (skills + agents must declare name + description)
for (const f of walk(join(root, '.claude/skills'), (p) => p.endsWith('SKILL.md'))) {
  const fm = frontmatter(read(f));
  if (!fm || !/\bname:/.test(fm) || !/\bdescription:/.test(fm))
    errors.push(`${rel(f)}: skill needs frontmatter with name + description`);
}
for (const f of walk(join(root, '.claude/agents'), (p) => p.endsWith('.md'))) {
  const fm = frontmatter(read(f));
  if (!fm || !/\bname:/.test(fm) || !/\bdescription:/.test(fm))
    errors.push(`${rel(f)}: agent needs frontmatter with name + description`);
}

// B) internal markdown link integrity (.md targets resolve relative to file or repo root)
const docFiles = [
  ...walk(join(root, 'docs'), (p) => p.endsWith('.md')),
  ...['README.md', 'CONTRIBUTING.md', 'SECURITY.md'].map((f) => join(root, f)).filter(existsSync),
];
const linkRe = /\]\(([^)\s]+\.md)(#[^)]*)?\)/g;
for (const f of docFiles) {
  const text = read(f);
  let m;
  while ((m = linkRe.exec(text))) {
    const target = m[1];
    if (/^https?:\/\//.test(target)) continue;
    const candidates = [resolve(dirname(f), target), resolve(root, target.replace(/^\//, ''))];
    if (!candidates.some(existsSync)) errors.push(`${rel(f)}: broken link -> ${target}`);
  }
}

// C) regulatory/integration pages must cite sources and carry a verify-by date
const sourced = [
  ...walk(join(root, 'docs/integrations'), (p) => p.endsWith('.md')),
  ...walk(join(root, 'docs/regulatory'), (p) => p.endsWith('.md')),
].filter((p) => !/README\.md$/.test(p));
for (const f of sourced) {
  const text = read(f);
  if (!/^##\s+Sources/im.test(text)) {
    errors.push(`${rel(f)}: missing "## Sources" section (cite primary sources)`);
    continue;
  }
  const vb = text.match(/verify-by:\s*(\d{4}-\d{2}-\d{2})/i);
  if (!vb) errors.push(`${rel(f)}: Sources present but no verify-by date`);
  else if (vb[1] < today)
    warnings.push(
      `${rel(f)}: verify-by ${vb[1]} has passed — re-confirm against the primary source`,
    );
}

// D) ADR cross-references resolve to a file in docs/decisions/ (no phantom ADR numbers).
const adrNums = new Set(
  walk(join(root, 'docs/decisions'), (p) => /\/\d{4}-.*\.md$/.test(p)).map(
    (p) => p.match(/\/(\d{4})-/)[1],
  ),
);
for (const f of docFiles) {
  for (const m of read(f).matchAll(/\bADRs?[-\s]?(\d{4})/g)) {
    if (!adrNums.has(m[1]))
      errors.push(`${rel(f)}: references ADR ${m[1]}, which has no file in docs/decisions/`);
  }
}

// E) "Locked" must not be used as a status label (the vocabulary is Current / Intended / Superseded).
for (const f of docFiles) {
  const text = read(f);
  if (/—\s*LOCKED\b/.test(text) || /\bstatus\b\s*[:|]\s*\*{0,2}\s*locked\b/i.test(text))
    errors.push(`${rel(f)}: uses "Locked" as a status label — use Current / Intended / Superseded`);
}

// F) every cited db/reference/<dir> path actually exists (no citing a source that was never captured).
for (const f of docFiles) {
  for (const m of read(f).matchAll(/db\/reference\/([a-z0-9][a-z0-9-]*)/g)) {
    if (!existsSync(join(root, 'db/reference', m[1])))
      errors.push(`${rel(f)}: cites db/reference/${m[1]}/ which does not exist`);
  }
}

// G) .claude/rules path globs must point at real paths (catch rules pre-positioned for absent code).
for (const f of walk(join(root, '.claude/rules'), (p) => p.endsWith('.md'))) {
  const fm = frontmatter(read(f));
  const m = fm && fm.match(/paths:\s*\[([^\]]*)\]/);
  if (!m) continue;
  for (const raw of m[1].match(/["']([^"']+)["']/g) || []) {
    const glob = raw.slice(1, -1);
    const base = glob.split('*')[0].replace(/\/+$/, '');
    if (base && !existsSync(join(root, base)))
      warnings.push(
        `${rel(f)}: paths glob "${glob}" matches nothing (base "${base}" absent) — narrow it or add the code`,
      );
  }
}

// H) marketing slop has no place in a system-of-record doc set (warn, not fail).
const slopRe = /\b(world-class|crown jewel|vibe-coded)\b/i;
for (const f of [...docFiles, join(root, 'AGENTS.md')].filter(existsSync)) {
  const lines = read(f).split('\n');
  const i = lines.findIndex((l) => slopRe.test(l));
  if (i >= 0)
    warnings.push(
      `${rel(f)}:${i + 1}: marketing slop "${lines[i].match(slopRe)[0]}" — prefer plain language`,
    );
}

// I) neutral documentation voice — no reader-addressing second person in the doc corpus.
// The product's own voice (how the app speaks to the user) lives in experience-principles.md; the
// audit report quotes findings verbatim. Quoted "…"/'…'/`…` spans are stripped first so a UI-copy
// example ("You're caught up") does not trip the gate.
const voiceAllow = new Set([
  'docs/experience-principles.md',
  'docs/archive/repo-consistency-audit-2026-06-23.md',
]);
const stripSpans = (s) =>
  s
    .replace(/"[^"]*"/g, '')
    .replace(/'[^']*'/g, '')
    .replace(/`[^`]*`/g, '');
const secondPersonRe = /\byou(r|'ll|'ve|'d|'re)?\b/i;
for (const f of docFiles) {
  if (voiceAllow.has(rel(f))) continue;
  const lines = read(f).split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (secondPersonRe.test(stripSpans(lines[i])))
      errors.push(
        `${rel(f)}:${i + 1}: reader-addressing second person ("you/your") — use neutral documentation voice`,
      );
  }
}

// J) the generated repo-status block in STATUS.md must match a fresh render (ADR 0031). Editing the
// ADR set or tasks.json without `pnpm status:refresh` fails here. Whitespace is normalized so a
// `pnpm format` tweak can't false-fail; numeric/textual drift does.
{
  const statusFile = join(root, 'docs/STATUS.md');
  const current = existsSync(statusFile) ? extractBlock(read(statusFile)) : null;
  if (current === null)
    errors.push('docs/STATUS.md: AUTOGEN:repo-status block missing — run `pnpm status:refresh`');
  else if (normalizeBlock(current) !== normalizeBlock(renderBlock()))
    errors.push('docs/STATUS.md: repo-status block is stale — run `pnpm status:refresh`');
}

// K) task-graph evidence (the knowledge graph, ADR 0031). Typed edges in tasks.json must hold up
// against the repo: implements_adr must resolve to a real ADR; a done/in_progress task's touches must
// still exist (stale-done); an ADR no task implements or references is reported once (orphan-ADR).
{
  let tasks = [];
  try {
    tasks = loadTasks();
  } catch {
    /* backlog validate owns parse errors; skip the evidence pass if it can't load */
  }
  const referencedAdrs = new Set();
  for (const t of tasks) {
    for (const a of t.implements_adr ?? []) {
      referencedAdrs.add(a);
      if (!adrNums.has(a))
        errors.push(`${t.id}: implements_adr ${a} has no file in docs/decisions/`);
    }
    // Any ADR a task names in refs/notes also counts as "referenced" for orphan detection.
    const blob = [...(t.refs ?? []), t.notes ?? ''].join(' ');
    for (const m of blob.matchAll(/(?:ADR[-\s]?|decisions\/)(\d{4})/g)) referencedAdrs.add(m[1]);
    // stale-done: a completed task must not claim files that are gone.
    if (t.status === 'done' || t.status === 'in_progress')
      for (const glob of t.touches ?? []) {
        const base = glob.split('*')[0].replace(/\/+$/, '');
        if (base && !existsSync(join(root, base)))
          errors.push(`${t.id}: ${t.status} but touches "${glob}" matches nothing (stale-done)`);
      }
  }
  // Foundational ADRs are architecture/charter decisions no single task implements (online-first,
  // integer-øre, RR7, shadcn, OSS-self-hostable, drizzle-SQL-source-of-truth, proprietary license).
  // Allowlisting them keeps this warning meaningful — it fires only for a NEW orphan (e.g. a freshly
  // added ADR with no implementing/referencing task), not the known-foundational set every run.
  const FOUNDATIONAL_ADRS = new Set(['0001', '0004', '0005', '0006', '0008', '0011', '0023']);
  const orphans = [...adrNums]
    .filter((a) => !referencedAdrs.has(a) && !FOUNDATIONAL_ADRS.has(a))
    .sort();
  if (orphans.length)
    warnings.push(
      `docs/decisions: ${orphans.length} ADR(s) have no implementing/referencing task (orphan): ` +
        `${orphans.join(', ')} — add an implements_adr edge in tasks.json, or (if foundational) ` +
        `add it to FOUNDATIONAL_ADRS in tools/repo-lint.mjs`,
    );
}

// L) the generated arch-graph block in architecture.md must match a fresh render (ADR 0049). Adding a
// package/route/domain-submodule/migration without `pnpm arch:refresh` fails here, like the status block.
{
  const archFile = join(root, 'docs/architecture.md');
  const current = existsSync(archFile) ? extractArchBlock(read(archFile)) : null;
  if (current === null)
    errors.push('docs/architecture.md: AUTOGEN:arch-graph block missing — run `pnpm arch:refresh`');
  else if (normalizeBlock(current) !== normalizeBlock(renderArchBlock()))
    errors.push('docs/architecture.md: arch-graph block is stale — run `pnpm arch:refresh`');
}

// M) the one hard boundary (ADR 0049): @saldo/domain source must be relative-imports-only and
// deterministic. A non-relative import or a Date.now/Math.random/new Date is a build-failing breach.
for (const v of domainPurityViolations())
  errors.push(`${v.file}:${v.line}: domain-purity breach — ${v.reason}`);

for (const w of warnings) console.warn('warn: ' + w);
if (errors.length) {
  for (const e of errors) console.error('error: ' + e);
  console.error(`\nrepo-lint: FAILED with ${errors.length} error(s).`);
  process.exit(1);
}
console.log(
  `repo-lint: OK — ${docFiles.length} docs, ${sourced.length} sourced pages, ${warnings.length} warning(s).`,
);
