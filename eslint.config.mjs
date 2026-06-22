// Flat ESLint config (ESLint 9). Type-aware rules are enabled so the money
// guardrails below can reason about the `Øre` branded type.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import saldo from './tools/eslint-plugin-saldo/index.js';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/.react-router/**',
      '**/coverage/**',
      'db/reference/saf-t/**',
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
        { object: 'Math', property: 'round', message: 'Use roundØre() from @saldo/domain for money.' },
      ],
    },
  },
);
