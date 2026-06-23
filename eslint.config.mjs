// Flat ESLint config (ESLint 9). Type-aware rules are enabled so the money
// guardrails below can reason about the `Øre` branded type.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import saldo from './tools/eslint-plugin-saldo/index.js';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/.react-router/**',
      '**/coverage/**',
      'db/reference/saf-t/**',
      // Generated Drizzle introspection output (source of truth: db/migrations/*.sql).
      'apps/web/app/db/schema.ts',
      'apps/web/app/db/relations.ts',
      // Config + tooling files have no tsconfig project; exclude from type-aware linting.
      '**/*.config.{ts,mts,cts,js,cjs,mjs}',
      'eslint.config.mjs',
      'tools/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { saldo },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',

      // ── Money guardrails (see .claude/rules/money.md) ──────────────────────
      // Hard invariant: money is integer `Øre`, never `number`, never float math.
      // The custom rule below flags `+ - * /` arithmetic on `Øre`-typed operands;
      // use addØre/subØre/mulRate instead. See tools/eslint-plugin-saldo.
      'saldo/no-money-arithmetic': 'error',
      // Interim defense-in-depth until the typed rule has full coverage:
      'no-restricted-globals': ['error', 'parseFloat'],
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'round',
          message: 'Use roundØre() from @saldo/domain for money.',
        },
      ],
    },
  },
  {
    // The money primitives are the ONE sanctioned place for raw integer arithmetic on Øre —
    // they implement addØre/subØre/mulRate/roundØre/formatKr. Exempt only this file.
    files: ['packages/domain/src/money/ore.ts'],
    rules: { 'saldo/no-money-arithmetic': 'off', 'no-restricted-properties': 'off' },
  },
  {
    // ── Architectural boundary: packages/domain ↛ apps/web ─────────────────────
    // The domain is the one hard boundary (CLAUDE.md): a PURE accounting core with no I/O that runs
    // in route actions AND the browser. It must never depend on the web app — the dependency is
    // strictly one-way (web → domain). Enforce it mechanically so the purity can't silently rot.
    files: ['packages/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@saldo/web', '@saldo/web/**', '**/apps/web/**'],
              message:
                'packages/domain must not import apps/web — the domain is a pure, one-way dependency (CLAUDE.md). Move shared logic into the domain instead.',
            },
          ],
        },
      ],
    },
  },
  // ── Accessibility backstop (deterministic; the a11y-reviewer covers the rest) ──
  {
    files: ['apps/web/app/**/*.{tsx,jsx}'],
    plugins: { 'jsx-a11y': jsxA11y, saldo },
    rules: {
      ...jsxA11y.flatConfigs.recommended.rules,
      // Design-system gates (.claude/rules/design-system.md; tokens live in app/app.css). Enforced
      // now so the first component written is already on-bar — the UI lands soon.
      //  · no inline styles — use Tailwind tokens / shadcn components;
      //  · no arbitrary Tailwind values (bg-[#fff], h-[100vh]) — add a token instead;
      //  · no raw colour utilities (text-black, bg-red-500) — use the semantic tokens.
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='style']",
          message:
            'No inline styles — use Tailwind token utilities / shadcn components (.claude/rules/design-system.md).',
        },
      ],
      'saldo/no-arbitrary-tailwind': 'error',
      'saldo/no-raw-color-utility': 'error',
    },
  },
);
