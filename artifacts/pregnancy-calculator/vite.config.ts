import { defineConfig, type UserConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

// PORT is only meaningful when Vite is serving — a build never binds a port.
// Requiring it at module load meant `vite build` failed before reading a single
// file anywhere that does not inject it: Cloudflare Pages, CI, a plain laptop.
// Still required for dev and preview, where silently landing on Vite's default
// port would break the Replit workflow that expects a specific one.
function resolveServePort(): number {
  const rawPort = process.env.PORT;

  if (!rawPort) {
    throw new Error(
      "PORT environment variable is required but was not provided.",
    );
  }

  const port = Number(rawPort);

  if (Number.isNaN(port) || port <= 0) {
    throw new Error(`Invalid PORT value: "${rawPort}"`);
  }

  return port;
}

// Replit injects BASE_PATH to serve the app under a path prefix. Everywhere
// else it is served from the domain root — Vite's own default.
const basePath = process.env.BASE_PATH ?? "/";

if (!process.env.VITE_APP_URL) {
  const replitDomains = process.env.REPLIT_DOMAINS;
  if (replitDomains) {
    const primaryDomain = replitDomains.split(",")[0].trim();
    process.env.VITE_APP_URL = `https://${primaryDomain}`;
  }
}

export default defineConfig(async ({ command }): Promise<UserConfig> => {
  const port = command === "serve" ? resolveServePort() : undefined;

  return {
    base: basePath,
    plugins: [
      react(),
      tailwindcss({ optimize: false }),
      runtimeErrorOverlay(),
      ...(process.env.NODE_ENV !== "production" &&
      process.env.REPL_ID !== undefined
        ? [
            await import("@replit/vite-plugin-cartographer").then((m) =>
              m.cartographer({
                root: path.resolve(import.meta.dirname, ".."),
              }),
            ),
            await import("@replit/vite-plugin-dev-banner").then((m) =>
              m.devBanner(),
            ),
          ]
        : []),
    ],
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "src"),
        "@assets": path.resolve(
          import.meta.dirname,
          "..",
          "..",
          "attached_assets",
        ),
      },
      // One copy each, or the API client's hooks miss the app's providers and the
      // whole site renders blank. See src/__tests__/single-react-query.test.tsx.
      dedupe: ["react", "react-dom", "@tanstack/react-query"],
    },
    root: path.resolve(import.meta.dirname),
    build: {
      outDir: path.resolve(import.meta.dirname, "dist/public"),
      emptyOutDir: true,
    },
    server: {
      port,
      host: "0.0.0.0",
      allowedHosts: true,
      fs: {
        strict: true,
        deny: ["**/.*"],
      },
    },
    preview: {
      port,
      host: "0.0.0.0",
      allowedHosts: true,
    },
  };
});
