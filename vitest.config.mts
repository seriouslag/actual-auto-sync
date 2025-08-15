import { defineConfig } from "vitest/config";

export default defineConfig({
  cacheDir: "./node_modules/.cache/vitest",
  test: {
    globals: true,
    environment: "node",
  },
});
