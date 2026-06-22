#!/usr/bin/env node
// Repo hygiene gate: validates the .claude/ harness frontmatter, internal doc-link integrity, and the
// cited-&-dated convention for regulatory/integration pages. Dependency-free. Run via `pnpm lint:repo`.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

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

for (const w of warnings) console.warn('warn: ' + w);
if (errors.length) {
  for (const e of errors) console.error('error: ' + e);
  console.error(`\nrepo-lint: FAILED with ${errors.length} error(s).`);
  process.exit(1);
}
console.log(
  `repo-lint: OK — ${docFiles.length} docs, ${sourced.length} sourced pages, ${warnings.length} warning(s).`,
);
