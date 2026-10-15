import { defineConfig } from 'vitest/config';

export default defineConfig({
  cacheDir: './node_modules/.cache/vitest',
  test: {
    globals: true,
    environment: 'node',
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      // E2E tests run separately via pnpm test:e2e
      'src/__tests__/e2e/**',
      // Live Watchgoose test runs via pnpm test:watchgoose, outside pull-request and main CI
      'src/__tests__/watchgoose.integration.test.ts',
    ],
  },
});
