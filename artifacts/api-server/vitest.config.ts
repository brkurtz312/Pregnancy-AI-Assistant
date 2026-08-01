import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Workspace packages expose their TS source via a "workspace" export
    // condition; make Vitest's resolver honor it so imports load source.
    conditions: ["workspace"],
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globals: false,
    // Raise the per-test timeout to 120 000 ms. The validation suite runs
    // `pnpm --filter @workspace/api-server run test` in parallel with
    // `pnpm run test` (which also runs api-server), so api-server tests
    // execute twice simultaneously under extreme resource contention.
    // 120 s gives individual tests room to complete without a flaky timeout
    // while still catching genuinely hung tests.
    testTimeout: 120000,
    // Run test files sequentially (single fork) to avoid "Timeout waiting for
    // worker to respond" failures under concurrent validation load. The
    // validation workflow runs `pnpm run test` (which also runs api-server
    // tests) simultaneously with `pnpm --filter @workspace/api-server run test`,
    // causing extreme fork-creation pressure. fileParallelism:false serialises
    // files without sacrificing test isolation, at the cost of longer wall time.
    fileParallelism: false,
  },
});
