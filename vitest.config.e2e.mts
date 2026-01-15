import { defineConfig } from "vitest/config";

export default defineConfig({
  cacheDir: "./node_modules/.cache/vitest-e2e",
  test: {
    globals: true,
    environment: "node",
    include: ["src/__tests__/e2e/**/*.e2e.test.ts"],
    // E2E tests need longer timeouts for server operations
    testTimeout: 60000,
    hookTimeout: 60000,
    // Run tests sequentially to avoid race conditions with shared server
    sequence: {
      concurrent: false,
    },
    // Retry flaky tests once
    retry: 1,
  },
});
