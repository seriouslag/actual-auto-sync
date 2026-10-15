import { defineConfig } from 'vitest/config';

export default defineConfig({
  cacheDir: './node_modules/.cache/vitest-watchgoose',
  test: {
    globals: true,
    environment: 'node',
    include: ['src/__tests__/watchgoose.integration.test.ts'],
    // One live check, plus time for Watchgoose to publish each status.
    testTimeout: 90_000,
    hookTimeout: 30_000,
    fileParallelism: false,
    sequence: {
      concurrent: false,
    },
    retry: 0,
  },
});
