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
    ],
  },
});
