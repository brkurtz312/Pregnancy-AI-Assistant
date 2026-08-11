/**
 * validateWatchIconFormat.test.ts
 *
 * Verifies that scripts/validate-watch-icon-format.js catches a legacy
 * per-size watchOS AppIcon catalog (the format that triggers ITMS-90391)
 * and exits 1, while a correctly formatted modern catalog exits 0.
 *
 * Strategy: write fixture Contents.json files into a temp directory tree
 * that mimics a real watchapp source folder, then invoke the script as a
 * child process with the ROOT constant patched to point at the temp dir.
 */

import { spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

const SCRIPT = path.resolve(
  __dirname,
  "../scripts/validate-watch-icon-format.js",
);

// ── fixture data ───────────────────────────────────────────────────────────────

/**
 * Modern single-image format — the only format App Store Connect accepts.
 * Should produce exit code 0.
 */
const MODERN_CONTENTS_JSON = {
  images: [
    {
      filename: "AppIcon.png",
      idiom: "universal",
      platform: "watchos",
      size: "1024x1024",
    },
  ],
  info: { author: "xcode", version: 1 },
};

/**
 * Legacy per-size slot format — the format that triggers ITMS-90391.
 * Multiple entries, none with a "platform" field.
 * Should produce exit code 1 and mention ITMS-90391 in stderr.
 */
const LEGACY_CONTENTS_JSON = {
  images: [
    {
      filename: "AppIcon-40@2x.png",
      idiom: "watch",
      scale: "2x",
      size: "40x40",
    },
    {
      filename: "AppIcon-44@2x.png",
      idiom: "watch",
      scale: "2x",
      size: "44x44",
    },
    {
      filename: "AppIcon-50@2x.png",
      idiom: "watch",
      scale: "2x",
      size: "50x50",
    },
    {
      filename: "AppIcon-1024.png",
      idiom: "watch",
      scale: "1x",
      size: "1024x1024",
    },
  ],
  info: { author: "xcode", version: 1 },
};

/**
 * Variant of the legacy format that only fails the "platform" check
 * (idiom is already "universal", but platform is missing).
 */
const MISSING_PLATFORM_CONTENTS_JSON = {
  images: [{ filename: "AppIcon.png", idiom: "universal", size: "1024x1024" }],
  info: { author: "xcode", version: 1 },
};

// ── helper ─────────────────────────────────────────────────────────────────────

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "validate-watch-icon-test-"));
}

/**
 * Run validate-watch-icon-format.js with a synthetic file-system rooted at
 * a temp directory.  `contents` is written to
 * `{tmpDir}/watchapp/AppIcon.appiconset/Contents.json` so the script finds it
 * via its normal watchapp/ search path.
 *
 * We patch ROOT by reading the script source and replacing the ROOT line
 * before eval-ing it in a thin wrapper, exactly as validateEasProvisioning
 * tests do.
 */
function runScript(contents: object): {
  exitCode: number;
  stdout: string;
  stderr: string;
} {
  const tmpDir = makeTempDir();
  try {
    // Build the expected path the script will search:
    //   {ROOT}/watchapp/AppIcon.appiconset/Contents.json
    const iconsetDir = path.join(tmpDir, "watchapp", "AppIcon.appiconset");
    fs.mkdirSync(iconsetDir, { recursive: true });
    fs.writeFileSync(
      path.join(iconsetDir, "Contents.json"),
      JSON.stringify(contents, null, 2),
    );

    // Write a thin wrapper that patches ROOT before the script runs.
    const wrapperPath = path.join(tmpDir, "run-validation.js");
    fs.writeFileSync(
      wrapperPath,
      `
"use strict";
const fs = require("fs");
const src = fs.readFileSync(${JSON.stringify(SCRIPT)}, "utf8");
const patched = src.replace(
  /const ROOT = path\\.resolve\\(__dirname, "\\.\\."\\);/,
  ${JSON.stringify(`const ROOT = ${JSON.stringify(tmpDir)};`)}
);
eval(patched);
`,
    );

    // 60 s: spawning a Node process under heavy CI load (concurrent test runs)
    // can easily exceed 10 s; a timed-out spawn returns status=null which
    // collapses to exitCode 1 and silently fails the "happy path" checks.
    const result = spawnSync(process.execPath, [wrapperPath], {
      encoding: "utf8",
      timeout: 60_000,
    });

    return {
      exitCode: result.status ?? 1,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
    };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ── tests ──────────────────────────────────────────────────────────────────────

describe("validate-watch-icon-format.js", () => {
  describe("happy path — modern single-image format", () => {
    it("exits 0 when Contents.json uses the correct modern format", () => {
      const { exitCode } = runScript(MODERN_CONTENTS_JSON);
      expect(exitCode).toBe(0);
    });

    it("reports all checks passed on stdout", () => {
      const { stdout } = runScript(MODERN_CONTENTS_JSON);
      expect(stdout).toMatch(/All \d+ check\(s\) passed/i);
    });

    it("confirms the modern single-image format is in place", () => {
      const { stdout } = runScript(MODERN_CONTENTS_JSON);
      expect(stdout).toMatch(/modern single-image watchos format/i);
    });
  });

  describe("failure path — legacy per-size slot format (ITMS-90391)", () => {
    it("exits 1 when Contents.json uses the legacy per-size format", () => {
      const { exitCode } = runScript(LEGACY_CONTENTS_JSON);
      expect(exitCode).toBe(1);
    });

    it("mentions ITMS-90391 in stderr so the developer knows what to fix", () => {
      const { stderr } = runScript(LEGACY_CONTENTS_JSON);
      expect(stderr).toMatch(/ITMS-90391/);
    });

    it("reports failed check(s) in stderr summary", () => {
      const { stderr } = runScript(LEGACY_CONTENTS_JSON);
      expect(stderr).toMatch(/check\(s\) failed/i);
    });

    it("flags the missing 'platform' field in stderr", () => {
      const { stderr } = runScript(LEGACY_CONTENTS_JSON);
      // The error message should mention that entries are missing platform=watchos
      expect(stderr).toMatch(
        /missing.*platform.*watchos|platform.*watchos.*missing/i,
      );
    });

    it("flags the non-universal idiom entries in stderr", () => {
      const { stderr } = runScript(LEGACY_CONTENTS_JSON);
      // Legacy entries use idiom=watch, not universal
      expect(stderr).toMatch(/idiom/i);
    });
  });

  describe("failure path — missing platform field only", () => {
    it("exits 1 when an entry has idiom=universal but no platform field", () => {
      const { exitCode } = runScript(MISSING_PLATFORM_CONTENTS_JSON);
      expect(exitCode).toBe(1);
    });

    it("mentions ITMS-90391 in stderr", () => {
      const { stderr } = runScript(MISSING_PLATFORM_CONTENTS_JSON);
      expect(stderr).toMatch(/ITMS-90391/);
    });

    it("tells the developer to switch to the modern format", () => {
      const { stderr } = runScript(MISSING_PLATFORM_CONTENTS_JSON);
      expect(stderr).toMatch(/modern single-image format/i);
    });
  });

  describe("edge cases", () => {
    it("exits 0 when the watchapp directory is empty (no catalogs to check)", () => {
      // If no catalogs are found the script exits 0 (prebuild may not have run yet)
      const tmpDir = makeTempDir();
      try {
        fs.mkdirSync(path.join(tmpDir, "watchapp"), { recursive: true });

        const wrapperPath = path.join(tmpDir, "run-validation.js");
        fs.writeFileSync(
          wrapperPath,
          `
"use strict";
const fs = require("fs");
const src = fs.readFileSync(${JSON.stringify(SCRIPT)}, "utf8");
const patched = src.replace(
  /const ROOT = path\\.resolve\\(__dirname, "\\.\\."\\);/,
  ${JSON.stringify(`const ROOT = ${JSON.stringify(tmpDir)};`)}
);
eval(patched);
`,
        );

        const result = spawnSync(process.execPath, [wrapperPath], {
          encoding: "utf8",
          timeout: 10_000,
        });

        expect(result.status).toBe(0);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it("exits 1 when the images array is empty", () => {
      const emptyImages = { images: [], info: { author: "xcode", version: 1 } };

      // We need the path to be recognised as a watchOS catalog.
      // An empty images array means isWatchOSCatalog returns false for the
      // platform check, but the path /watchapp/ still triggers the watch guard.
      const { exitCode, stderr } = runScript(emptyImages);
      expect(exitCode).toBe(1);
      expect(stderr).toMatch(/missing or empty/i);
    });
  });
});
