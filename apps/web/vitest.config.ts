import { defineConfig } from 'vitest/config';

// Dedicated Vitest config for the web package. We intentionally do NOT load the
// React Router Vite plugin here: these are server/database integration tests that
// run in a plain Node environment. Container startup dominates the timeouts.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['app/**/*.test.ts', 'test/**/*.test.ts'],
    testTimeout: 120_000,
    hookTimeout: 180_000,
  },
});
