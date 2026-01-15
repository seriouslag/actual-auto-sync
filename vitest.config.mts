import { defineConfig } from "vitest/config";

export default defineConfig({
  cacheDir: "./node_modules/.cache/vitest",
  test: {
    globals: true,
    environment: "node",
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/e2e/**", // E2E tests run separately via pnpm test:e2e
    ],
  },
});
