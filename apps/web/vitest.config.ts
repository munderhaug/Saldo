import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

// Dedicated Vitest config for the web package. We intentionally do NOT load the
// React Router Vite plugin here: these are server/database integration tests that
// run in a plain Node environment. Container startup dominates the timeouts.
// `tsconfigPaths` resolves the `~/*` → `app/*` alias so unit tests can import app modules.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    include: ['app/**/*.test.ts', 'test/**/*.test.ts'],
    testTimeout: 120_000,
    hookTimeout: 180_000,
  },
});
