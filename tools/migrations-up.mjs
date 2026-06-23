#!/usr/bin/env node
// Print the concatenated `-- migrate:up` body of every committed SQL migration, in filename order.
// Used to feed squawk ONLY the forward migrations (the part that runs against live data) — the
// `-- migrate:down` rollbacks legitimately DROP objects, which would otherwise trip squawk's
// (deliberately kept-active) destructive-operation rules. Mirrors the test harness's upMigrationSql().
// Dependency-free.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const migrationsDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'db', 'migrations');

const up = readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => {
    const text = readFileSync(join(migrationsDir, f), 'utf8');
    const afterUp = text.split('-- migrate:up')[1] ?? '';
    return `-- ${f}\n${afterUp.split('-- migrate:down')[0] ?? ''}`;
  })
  .join('\n');

process.stdout.write(up);
