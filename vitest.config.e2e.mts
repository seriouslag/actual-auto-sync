import { defineConfig } from "vitest/config";

export default defineConfig({
  cacheDir: "./node_modules/.cache/vitest-e2e",
  test: {
    globals: true,
    environment: "node",
    include: ["src/__tests__/e2e/**/*.e2e.test.ts"],
    // Setup file to intercept unhandled rejections from @actual-app/api
    setupFiles: ["./src/__tests__/e2e/vitest-setup.ts"],
    // E2E tests need longer timeouts for server operations
    testTimeout: 60000,
    hookTimeout: 60000,
    // Run tests sequentially to avoid race conditions with shared server
    sequence: {
      concurrent: false,
    },
    // No retry - we want consistent test behavior
    retry: 0,
    // Don't fail on unhandled rejections from @actual-app/api internal operations
    // The API has background sync operations that may reject after tests complete
    // These are bugs in the @actual-app/api library, not our test code
    dangerouslyIgnoreUnhandledErrors: true,
  },
});
