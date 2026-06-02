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
  },
});
