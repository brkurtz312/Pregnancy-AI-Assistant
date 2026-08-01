import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    conditions: ["workspace"],
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globals: false,
    // Raise the per-test timeout from the default 5 000 ms to 30 000 ms.
    // The check-whats-new CLI tests use spawnSync(tsx, ...) which can take
    // several seconds to JIT-compile on the first run under concurrent CI load.
    testTimeout: 60000,
    // eslint-timeout-guard.test.ts pre-warms ESLint in a beforeAll hook.
    // Under concurrent CI load (multiple test suites running simultaneously),
    // ESLint's config-parse step can take 2-3 minutes. Raise the hook timeout
    // from the default 10 s so the beforeAll is never cut short.
    hookTimeout: 300000,
  },
});
