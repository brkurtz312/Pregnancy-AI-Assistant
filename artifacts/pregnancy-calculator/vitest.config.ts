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
    dedupe: ["react", "react-dom"],
  },
  test: {
    environment: "happy-dom",
    include: ["src/__tests__/**/*.test.{ts,tsx}"],
    globals: false,
    setupFiles: ["src/__tests__/setup.ts"],
  },
});
