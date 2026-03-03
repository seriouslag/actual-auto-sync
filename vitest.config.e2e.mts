import { defineConfig } from 'vitest/config';

export default defineConfig({
  cacheDir: '/tmp/vitest-e2e',
  test: {
    globals: true,
    environment: 'node',
    include: ['src/__tests__/e2e/**/*.e2e.test.ts'],
    // Setup file to intercept unhandled rejections from @actual-app/api
    setupFiles: ['./src/__tests__/e2e/vitest-setup.ts'],
    // E2E tests need longer timeouts for server operations
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // Run tests sequentially to avoid race conditions with shared server and data directory
    sequence: {
      concurrent: false,
    },
    // Run test files one at a time (not in parallel)
    fileParallelism: false,
    // Run each test file in isolation to avoid shared state issues
    isolate: true,
    // No retry - we want consistent test behavior
    retry: 0,
  },
});
