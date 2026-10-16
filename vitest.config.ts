import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(root, "src") },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // On a cold cache (CI, first run) the first render of a screen transforms
    // Radix and Motion and can take well over the default 5 s.
    testTimeout: 20_000,
    coverage: {
      provider: "v8",
      include: ["src/lib/**/*.{ts,tsx}", "src/server/**/*.{ts,tsx}"],
      exclude: ["**/*.test.{ts,tsx}"],
      // The finance engine is pure and fully testable (doc 03 §13): enforce it.
      thresholds: {
        "src/lib/finance/**": {
          lines: 95,
          functions: 95,
          branches: 95,
          statements: 95,
        },
      },
    },
  },
});
