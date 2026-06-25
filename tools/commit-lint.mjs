#!/usr/bin/env node
// Conventional Commits gate — dependency-free, like repo-lint / backlog / status-block. Validates the
// subject line of each commit in a range against the Conventional Commits spec + Saldo's allowed types.
// The history already follows the convention by hand; this makes it mechanical so it can't drift.
//
//   node tools/commit-lint.mjs                 # lint origin/main..HEAD (the branch's own commits)
//   node tools/commit-lint.mjs <range|rev>     # lint an explicit git range
//
// Safe in CI: if the range can't be resolved (e.g. a shallow checkout with no origin/main), it prints
// a notice and exits 0 rather than false-failing a PR. CI fetches full history so the range resolves.
import { execFileSync } from 'node:child_process';

const TYPES = [
  'feat',
  'fix',
  'docs',
  'chore',
  'refactor',
  'test',
  'perf',
  'build',
  'ci',
  'style',
  'revert',
];
const HEADER_MAX = 100; // generous; Conventional Commits has no hard limit, but a sane ceiling helps
// type(scope)!: subject — scope optional, ! optional (breaking change)
const HEADER_RE = new RegExp(`^(${TYPES.join('|')})(\\([^)]+\\))?!?: .+`);

const range = process.argv[2] ?? 'origin/main..HEAD';
const git = (args) => execFileSync('git', args, { encoding: 'utf8' });

let hashes;
try {
  hashes = git(['rev-list', '--no-merges', range]).split('\n').filter(Boolean);
} catch {
  console.log(`commit-lint: range "${range}" not resolvable (shallow checkout?) — skipping.`);
  process.exit(0);
}

const errors = [];
for (const h of hashes) {
  const subject = git(['show', '-s', '--format=%s', h]).trim();
  const short = h.slice(0, 9);
  // Default-git merge/revert subjects ("Merge …", "Revert …") aren't authored prose — skip them.
  if (subject.startsWith('Merge ') || subject.startsWith('Revert ')) continue;
  if (!HEADER_RE.test(subject)) errors.push(`${short}: not "type(scope): subject" — "${subject}"`);
  else if (subject.length > HEADER_MAX)
    errors.push(`${short}: subject ${subject.length} > ${HEADER_MAX} chars — "${subject}"`);
}

if (errors.length) {
  for (const e of errors) console.error('error: ' + e);
  console.error(
    `\ncommit-lint: FAILED — ${errors.length} commit(s). Allowed types: ${TYPES.join(', ')}.`,
  );
  process.exit(1);
}
console.log(`commit-lint: OK — ${hashes.length} commit(s) in ${range} conform.`);
