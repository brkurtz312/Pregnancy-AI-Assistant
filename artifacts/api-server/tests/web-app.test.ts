import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import express, { type Express } from "express";
import request from "supertest";
import { mountWebApp, webAppAvailable, webRoot } from "../src/lib/web-app";

let root: string;

beforeAll(() => {
  root = mkdtempSync(path.join(tmpdir(), "web-app-"));
  mkdirSync(path.join(root, "assets"));
  writeFileSync(
    path.join(root, "index.html"),
    "<!doctype html><title>app</title>",
  );
  writeFileSync(path.join(root, "assets", "index-abc123.js"), "console.log(1)");
  writeFileSync(path.join(root, "opengraph.jpg"), "not really a jpeg");
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

/** An app shaped like the real one: an /api router, then the web app. */
function buildApp(): Express {
  const app = express();
  app.get("/api/healthz", (_req, res) => {
    res.json({ status: "ok" });
  });
  mountWebApp(app, root);
  return app;
}

describe("webRoot", () => {
  it("prefers WEB_ROOT when the layout is not the default one", () => {
    expect(webRoot({ WEB_ROOT: "/srv/site" })).toBe(path.resolve("/srv/site"));
  });

  it("falls back to the built client beside this package", () => {
    expect(webRoot({})).toMatch(/pregnancy-calculator[/\\]dist[/\\]public$/);
  });
});

describe("with no build present", () => {
  it("reports unavailable and mounts nothing", () => {
    const empty = mkdtempSync(path.join(tmpdir(), "web-app-empty-"));
    try {
      expect(webAppAvailable(empty)).toBe(false);
      const app = express();
      expect(mountWebApp(app, empty)).toBe(false);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});

describe("serving the built client", () => {
  it("serves index.html at the root", async () => {
    const res = await request(buildApp()).get("/");
    expect(res.status).toBe(200);
    expect(res.text).toContain("<title>app</title>");
  });

  // Client-side routes are not files on disk. Without the fallback every deep
  // link and every refresh away from "/" is a 404.
  it("serves index.html for a client-side route", async () => {
    const res = await request(buildApp()).get("/due-date");
    expect(res.status).toBe(200);
    expect(res.text).toContain("<title>app</title>");
  });

  // The regression that matters: the fallback answers anything it is given, so
  // an unknown API route must never come back as the web app with a 200.
  it("does not answer unknown /api routes with the web app", async () => {
    const res = await request(buildApp()).get("/api/not-a-route");
    expect(res.status).toBe(404);
    expect(res.text).not.toContain("<title>app</title>");
  });

  it("leaves real API routes alone", async () => {
    const res = await request(buildApp()).get("/api/healthz");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  it("does not answer a non-GET request with HTML", async () => {
    const res = await request(buildApp()).post("/anything");
    expect(res.status).toBe(404);
    expect(res.text).not.toContain("<title>app</title>");
  });
});

describe("caching", () => {
  it("caches hashed assets indefinitely", async () => {
    const res = await request(buildApp()).get("/assets/index-abc123.js");
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe(
      "public, max-age=31536000, immutable",
    );
  });

  // index.html carries the asset hashes, so a cached copy points at a past
  // deploy's files.
  it("never caches the document, whichever path serves it", async () => {
    const direct = await request(buildApp()).get("/index.html");
    expect(direct.headers["cache-control"]).toBe("no-cache");
    const viaFallback = await request(buildApp()).get("/due-date");
    expect(viaFallback.headers["cache-control"]).toBe("no-cache");
  });

  // Unhashed files keep their names across deploys, so a long cache on them
  // could not be undone.
  it("does not cache unhashed files hard", async () => {
    const res = await request(buildApp()).get("/opengraph.jpg");
    expect(res.headers["cache-control"]).not.toContain("31536000");
  });
});
