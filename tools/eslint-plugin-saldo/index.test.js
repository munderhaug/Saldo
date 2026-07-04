/**
 * RuleTester coverage for the project-local invariant rules (review 2026-07-03 §8). Before this,
 * eslint-plugin-saldo was the ONLY untested enforcement layer — a regression in a rule would have
 * silently stopped guarding the money/design/microcopy invariants repo-wide.
 *
 * The three syntactic rules run on espree with JSX. `no-money-arithmetic` needs TYPE information,
 * so its tester uses the typescript-eslint parser with `projectService.allowDefaultProject` (each
 * snippet is a standalone default-project file — no tsconfig needed here).
 */
import { describe, it } from 'vitest';
import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import plugin from './index.js';

// RuleTester wires itself to whatever test framework is present; point it at vitest's hooks.
// The FIRST type-aware case pays the projectService/TypeScript program bootstrap (~6 s on a cold CI
// runner), so every case gets a generous timeout instead of vitest's 5 s default.
const CASE_TIMEOUT_MS = 30_000;
RuleTester.describe = describe;
RuleTester.it = (name, fn) => it(name, fn, CASE_TIMEOUT_MS);
RuleTester.itOnly = (name, fn) => it.only(name, fn, CASE_TIMEOUT_MS);

const jsxTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

jsxTester.run('no-arbitrary-tailwind', plugin.rules['no-arbitrary-tailwind'], {
  valid: [
    { code: '<div className="bg-background p-4" />' },
    // Arbitrary VARIANT selectors (bracket followed by `:`) are the allowed shadcn idiom.
    { code: '<tr className="[&_td]:border-b data-[state=open]:bg-muted" />' },
    { code: 'cn("grid gap-2", open && "bg-muted")' },
  ],
  invalid: [
    { code: '<div className="bg-[#fff]" />', errors: [{ messageId: 'arbitrary' }] },
    { code: '<div className="h-[100vh]" />', errors: [{ messageId: 'arbitrary' }] },
    { code: 'cn("p-2", "text-[13px]")', errors: [{ messageId: 'arbitrary' }] },
  ],
});

jsxTester.run('no-raw-color-utility', plugin.rules['no-raw-color-utility'], {
  valid: [
    { code: '<p className="text-foreground bg-background border-input" />' },
    { code: '<span className="text-destructive hover:bg-muted" />' },
  ],
  invalid: [
    { code: '<p className="text-black" />', errors: [{ messageId: 'rawColor' }] },
    { code: '<p className="bg-red-500" />', errors: [{ messageId: 'rawColor' }] },
    // Variant prefixes and opacity suffixes do not launder a raw palette shade.
    { code: '<p className="hover:bg-slate-100/50" />', errors: [{ messageId: 'rawColor' }] },
    { code: 'cn("dark:text-white")', errors: [{ messageId: 'rawColor' }] },
  ],
});

jsxTester.run('no-unkeyed-jsx-text', plugin.rules['no-unkeyed-jsx-text'], {
  valid: [
    { code: '<p>{t("invoices.back")}</p>' },
    { code: '<p>—</p>' }, // punctuation/number-only text never flags
    { code: '<td>1 250,00</td>' },
    { code: '<code>pnpm test</code>' }, // code-ish parents carry literal identifiers
  ],
  invalid: [
    { code: '<p>Betal fakturaen</p>', errors: [{ messageId: 'unkeyed' }] },
    { code: '<button>Save</button>', errors: [{ messageId: 'unkeyed' }] },
  ],
});

// ── no-money-arithmetic (type-aware) ────────────────────────────────────────────────────────────
const ØRE_PRELUDE = `
type Øre = number & { readonly __brand: 'øre' };
declare const a: Øre;
declare const b: Øre;
declare function addØre(x: Øre, y: Øre): Øre;
declare const plain: number;
`;

const typedTester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: {
      projectService: { allowDefaultProject: ['*.ts'] },
      tsconfigRootDir: import.meta.dirname,
    },
  },
});

typedTester.run('no-money-arithmetic', plugin.rules['no-money-arithmetic'], {
  valid: [
    { code: `${ØRE_PRELUDE} export const ok = addØre(a, b);`, filename: 'ok.ts' },
    // Plain numbers stay free — the rule keys on the Øre brand, not on arithmetic per se.
    { code: `${ØRE_PRELUDE} export const n = plain + 2;`, filename: 'plain.ts' },
  ],
  invalid: [
    {
      code: `${ØRE_PRELUDE} export const bad = a + b;`,
      filename: 'add.ts',
      errors: [{ messageId: 'banned' }],
    },
    {
      code: `${ØRE_PRELUDE} export const bad = a * 2;`,
      filename: 'mul.ts',
      errors: [{ messageId: 'banned' }],
    },
    {
      code: `${ØRE_PRELUDE} let acc = a; acc += b; export default acc;`,
      filename: 'compound.ts',
      errors: [{ messageId: 'banned' }],
    },
  ],
});
