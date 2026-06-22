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
  // ── Accessibility backstop (deterministic; the a11y-reviewer covers the rest) ──
  {
    files: ['apps/web/app/**/*.{tsx,jsx}'],
    plugins: { 'jsx-a11y': jsxA11y },
    rules: {
      ...jsxA11y.flatConfigs.recommended.rules,
    },
  },
);
