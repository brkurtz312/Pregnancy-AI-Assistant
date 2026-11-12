import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@workspace/learn-content-ids": path.resolve(
        import.meta.dirname,
        "../../lib/learn-content-ids/src/index.ts",
      ),
    },
    // Must match vite.config.ts; see src/__tests__/single-react-query.test.tsx.
    dedupe: ["react", "react-dom", "@tanstack/react-query"],
  },
  test: {
    environment: "happy-dom",
    include: ["src/__tests__/**/*.test.{ts,tsx}"],
    globals: false,
    setupFiles: ["src/__tests__/setup.ts"],
    // Raise the per-test timeout from the default 5 000 ms to 120 000 ms so
    // that component renders and act() flush chains have room under CI load.
    // When all workspace packages run simultaneously, 44+ sequential tests can
    // consume 70+ seconds of wall time before a given test starts; a 120 s cap
    // catches genuinely hung tests while never triggering on environmental lag.
    testTimeout: 120000,
    // Run all test files in a single worker (no parallelism). When all
    // workspace packages run simultaneously (pnpm -r run test), spawning 9
    // parallel fork workers alongside 41 mobile and 29 API-server workers
    // saturates the machine and causes React's async work queue to stall
    // indefinitely. Sequential file execution reduces peak memory pressure
    // while still completing the full web suite in a few seconds.
    fileParallelism: false,
  },
});
