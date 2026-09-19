import { existsSync } from "node:fs";
import path from "node:path";
import express, { type Express, type RequestHandler } from "express";
import { logger } from "./logger";

/**
 * Serves the built web app from this server.
 *
 * The web client calls the API with *relative* URLs and authenticates with
 * session cookies, so it only works when one origin serves both. On Replit one
 * deployment did that by construction. Off Replit it has to be arranged, and
 * the failure mode is quiet: the API is fine, and the web app simply has
 * nowhere to live. See docs/cutover.md.
 */

/** Where `vite build` puts the client, relative to this package. */
const DEFAULT_WEB_ROOT = path.join(
  "..",
  "..",
  "pregnancy-calculator",
  "dist",
  "public",
);

/**
 * Resolves the directory holding index.html.
 *
 * `WEB_ROOT` overrides it for a layout this default does not predict. The
 * default is relative to the running bundle rather than the process's working
 * directory, which is not ours to assume.
 */
export function webRoot(env: NodeJS.ProcessEnv = process.env): string {
  if (env.WEB_ROOT) return path.resolve(env.WEB_ROOT);
  // `__dirname` is provided by build.mjs's banner in the bundle, and by Node
  // in tests; both point at the directory of the running file.
  return path.resolve(__dirname, DEFAULT_WEB_ROOT);
}

export function webAppAvailable(root: string = webRoot()): boolean {
  return existsSync(path.join(root, "index.html"));
}

/**
 * Mounts the static files and the single-page fallback.
 *
 * Order matters and is the reason this is a function rather than two lines at
 * the bottom of app.ts: the fallback answers *anything* it is given, so it has
 * to be mounted after `/api`, or an unknown API route would return the web
 * app's HTML with a 200 instead of a JSON 404. Requests under `/api` are
 * excluded from it explicitly as well, belt and braces.
 */
export function mountWebApp(app: Express, root: string = webRoot()): boolean {
  if (!webAppAvailable(root)) {
    logger.warn(
      { root },
      "Web app build not found; serving the API only. Anyone opening the site " +
        "in a browser gets a 404. Build @workspace/pregnancy-calculator, or " +
        "set WEB_ROOT if it lives elsewhere.",
    );
    return false;
  }

  // Vite hashes everything it emits into `assets/`, so those names change
  // whenever their contents do and can be cached indefinitely. Nothing else
  // can: index.html is what points at the current hashes, and the static files
  // beside it (opengraph.jpg, icons) keep their names across deploys, so a
  // year-long cache would be unfixable for a year.
  app.use(
    express.static(root, {
      index: false,
      setHeaders: (res, filePath) => {
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        } else if (filePath.endsWith("index.html")) {
          res.setHeader("Cache-Control", "no-cache");
        }
      },
    }),
  );

  const sendIndex: RequestHandler = (req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    if (req.path.startsWith("/api")) return next();
    // The same no-cache as above: almost every HTML request arrives here
    // rather than through express.static, because client-side routes are not
    // files. A cached index.html points at asset hashes from a past deploy.
    res.sendFile(path.join(root, "index.html"), {
      headers: { "Cache-Control": "no-cache" },
    });
  };
  app.use(sendIndex);

  logger.info({ root }, "Serving the web app");
  return true;
}
