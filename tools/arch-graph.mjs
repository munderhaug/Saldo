#!/usr/bin/env node
// Saldo's architecture-truth generator (ADR 0049). Derives the *structural* facts of the system —
// the ones docs/architecture.md restates by hand and so drift from the code — from committed sources
// into an AUTOGEN block, and mechanically enforces the ONE hard boundary (AGENTS.md):
//   • workspace packages           (pnpm-workspace.yaml → each package.json name)
//   • @saldo/domain purity         (packages/domain/src/**: relative-imports-only, no wall-clock/random)
//   • apps/web module list         (apps/web/app/* directories — the impure side)
//   • client↔server boundary       (route()/index() declarations in apps/web/app/routes.ts)
//   • SQL integrity surface        (db/migrations/*.sql: tables, RLS policies, triggers, functions)
// "State a fact once; link, don't restate" (AGENTS.md): the doc derives from the code, never drifts
// from it, and tools/repo-lint.mjs gates the drift. The purity check is a HARD gate — a domain source
// file that imports anything non-relative, or reaches for Date.now/Math.random/new Date, fails the
// build. Dependency-free, like status-block.mjs/backlog.mjs.
//   node tools/arch-graph.mjs           # write the block into docs/architecture.md (pnpm arch:refresh)
//   node tools/arch-graph.mjs --check   # re-render + re-check purity; exit 1 on drift or violation
//
// NEVER put a HEAD sha / commit date here: facts must derive from committed files only (a block can't
// contain the commit that writes it), and the structural counts are exactly what we WANT to drift so a
// new route/migration/package forces `pnpm arch:refresh` and keeps the map honest.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeBlock } from './status-block.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ARCH_FILE = resolve(root, 'docs/architecture.md');

export const BEGIN = '<!-- AUTOGEN:arch-graph -->';
export const END = '<!-- /AUTOGEN:arch-graph -->';

const read = (p) => readFileSync(p, 'utf8');
const dirs = (p) =>
  existsSync(p)
    ? readdirSync(p, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort()
    : [];

/** Recursively collect files under dir matching filter. */
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

// ── workspace packages: pnpm-workspace.yaml globs → resolved package.json names ──────────────────
function workspacePackages() {
  const yaml = read(join(root, 'pnpm-workspace.yaml'));
  const globs = [...yaml.matchAll(/^\s*-\s*['"]?([^'"\n]+?)['"]?\s*$/gm)].map((m) => m[1]);
  const pkgs = [];
  for (const glob of globs) {
    const base = glob.replace(/\/\*+$/, '');
    for (const d of dirs(join(root, base))) {
      const pj = join(root, base, d, 'package.json');
      if (!existsSync(pj)) continue; // tools/* are bare scripts, no package.json — skip
      const name = JSON.parse(read(pj)).name;
      if (name) pkgs.push({ name, path: `${base}/${d}` });
    }
  }
  return pkgs.sort((a, b) => a.name.localeCompare(b.name));
}

// ── @saldo/domain purity: the ONE hard boundary, enforced ────────────────────────────────────────
// The domain package declares zero dependencies, so any non-relative import is a boundary breach; and
// it must be deterministic, so Date.now/Math.random/new Date are breaches too. Returns [] when pure.
// The clock/randomness injection seam: the single file whose JOB is to encapsulate wall-clock access
// (Clock.now → new Date()) so every other domain module stays deterministic. The import-purity rule
// still applies here; only the wall-clock check is waived — that is what this file exists to provide.
const PURITY_SEAM = new Set(['packages/domain/src/time/clock.ts']);

export function domainPurityViolations() {
  const srcDir = join(root, 'packages/domain/src');
  const files = walk(srcDir, (p) => p.endsWith('.ts') && !p.endsWith('.test.ts'));
  const rel = (p) => p.slice(root.length + 1);
  const violations = [];
  const fromRe = /\bfrom\s+['"]([^'"]+)['"]/; // import/export ... from 'x'
  const sideRe = /^\s*import\s+['"]([^'"]+)['"]/; // bare side-effect import 'x'
  const dynRe = /\bimport\s*\(\s*['"]([^'"]+)['"]/; // dynamic import('x')
  // Only an ARG-LESS new Date() (or Date.now/Math.random) reads the wall clock; new Date(ms) is a pure
  // constructor from an explicit value and stays allowed.
  const nondet = /\b(Date\.now\s*\(|Math\.random\s*\(|new\s+Date\s*\(\s*\))/;
  for (const f of files) {
    const relPath = rel(f);
    const lines = read(f).split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue; // skip comment lines
      const spec = (line.match(fromRe) || line.match(sideRe) || line.match(dynRe))?.[1];
      if (spec && !spec.startsWith('.'))
        violations.push({
          file: relPath,
          line: i + 1,
          reason: `non-relative import '${spec}' (@saldo/domain declares zero dependencies)`,
        });
      if (PURITY_SEAM.has(relPath)) continue; // wall-clock check waived for the injection seam
      const nd = line.match(nondet);
      if (nd)
        violations.push({
          file: relPath,
          line: i + 1,
          reason: `'${nd[1].replace(/\s+/g, ' ').replace(/\($/, '()')}' — inject the clock/randomness, the domain is deterministic`,
        });
    }
  }
  return violations.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

// ── SQL integrity surface across db/migrations/*.sql ─────────────────────────────────────────────
function sqlIntegrity() {
  const dir = join(root, 'db/migrations');
  const files = existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => f.endsWith('.sql'))
        .map((f) => join(dir, f))
    : [];
  const sql = files.map(read).join('\n');
  const count = (re) => [...sql.matchAll(re)].length;
  const names = (re) => [...new Set([...sql.matchAll(re)].map((m) => m[1].toLowerCase()))].sort();
  return {
    migrations: files.length,
    tables: count(/create\s+table\s/gi),
    policies: count(/create\s+policy\s/gi),
    triggers: names(/create\s+trigger\s+([a-z0-9_]+)/gi),
    functions: count(/create\s+(?:or\s+replace\s+)?function\s/gi),
  };
}

// ── route()/index() declarations = the typed client↔server boundary ──────────────────────────────
function routeCount() {
  const f = join(root, 'apps/web/app/routes.ts');
  if (!existsSync(f)) return 0;
  return [...read(f).matchAll(/\b(?:route|index)\s*\(/g)].length;
}

export function facts() {
  return {
    packages: workspacePackages(),
    domainSubmodules: dirs(join(root, 'packages/domain/src')),
    domainModuleFiles: walk(
      join(root, 'packages/domain/src'),
      (p) => p.endsWith('.ts') && !p.endsWith('.test.ts'),
    ).length,
    webModules: dirs(join(root, 'apps/web/app')),
    routes: routeCount(),
    sql: sqlIntegrity(),
  };
}

/** The canonical AUTOGEN block (markers included). The single source the doc must match. */
export function renderBlock() {
  const f = facts();
  const pkgs = f.packages.map((p) => `\`${p.name}\` (${p.path})`).join(', ');
  const s = f.sql;
  return [
    BEGIN,
    '<!-- Generated from committed sources by tools/arch-graph.mjs — DO NOT EDIT BY HAND; run `pnpm arch:refresh`. -->',
    `- **Workspace packages:** ${pkgs}`,
    `- **The one hard boundary — \`@saldo/domain\` (pure):** ${f.domainModuleFiles} source modules, relative-imports-only, no wall-clock/random (enforced by \`pnpm arch:check\`). Submodules: ${f.domainSubmodules.join(', ')}.`,
    `- **\`apps/web\` modules (impure side):** ${f.webModules.join(', ')}.`,
    `- **Client↔server boundary:** ${f.routes} route/index declarations in [\`apps/web/app/routes.ts\`](../apps/web/app/routes.ts) — loaders/actions, no separate API.`,
    `- **SQL integrity surface** (${s.migrations} migrations in \`db/migrations/*.sql\`): ${s.tables} tables, ${s.policies} RLS policies, ${s.triggers.length} triggers, ${s.functions} functions. Integrity triggers: ${s.triggers.join(', ')}.`,
    END,
  ].join('\n');
}

/** The block currently in architecture.md (markers included), or null if the markers are absent. */
export function extractBlock(text) {
  const b = text.indexOf(BEGIN);
  const e = text.indexOf(END);
  if (b === -1 || e === -1 || e < b) return null;
  return text.slice(b, e + END.length);
}

if (resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const violations = domainPurityViolations();
  for (const v of violations) console.error(`error: ${v.file}:${v.line}: ${v.reason}`);
  const block = renderBlock();
  const text = read(ARCH_FILE);
  const current = extractBlock(text);
  const check = process.argv.includes('--check');
  if (current === null) {
    console.error(
      `arch-graph: AUTOGEN:arch-graph markers missing in docs/architecture.md${check ? '.' : ' — add the block first.'}`,
    );
    process.exit(1);
  }
  if (check) {
    if (normalizeBlock(current) !== normalizeBlock(block)) {
      console.error(
        'arch-graph: docs/architecture.md arch-graph block is STALE — run `pnpm arch:refresh`.',
      );
      process.exit(1);
    }
    if (violations.length) {
      console.error(`\narch-graph: FAILED — ${violations.length} domain-purity violation(s).`);
      process.exit(1);
    }
    console.log('arch-graph: OK — arch-graph block matches the code and @saldo/domain is pure.');
  } else {
    writeFileSync(ARCH_FILE, text.replace(current, block));
    console.log('arch-graph: wrote arch-graph block to docs/architecture.md.');
    if (violations.length) {
      console.error(
        `\narch-graph: WARNING — ${violations.length} domain-purity violation(s) above; \`pnpm arch:check\`/CI will fail.`,
      );
      process.exit(1);
    }
  }
}
