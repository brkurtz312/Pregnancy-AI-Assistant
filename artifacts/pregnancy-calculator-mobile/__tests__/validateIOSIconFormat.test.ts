/**
 * validateIOSIconFormat.test.ts
 *
 * Verifies that scripts/validate-ios-icon-format.js catches a legacy per-size
 * iOS AppIcon catalog (the format Apple rejects on submission) and exits 1,
 * while a correctly formatted modern catalog exits 0.
 *
 * Strategy: write fixture Contents.json files into a temp directory tree that
 * mimics a real ios/ prebuild output folder, then invoke the script as a child
 * process with the ROOT constant patched to point at the temp dir.
 */

import { spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

const SCRIPT = path.resolve(
  __dirname,
  "../scripts/validate-ios-icon-format.js",
);

// ── fixture data ───────────────────────────────────────────────────────────────

/**
 * Modern single-image format — the only format App Store Connect accepts for
 * contemporary iOS submissions.  Should produce exit code 0.
 */
const MODERN_CONTENTS_JSON = {
  images: [
    {
      filename: "App-Icon-1024x1024@1x.png",
      idiom: "universal",
      platform: "ios",
      size: "1024x1024",
    },
  ],
  info: { author: "xcode", version: 1 },
};

/**
 * Legacy per-size slot format — many entries with device-specific idioms.
 * This is the old format Apple's validator rejects on submission.
 * Should produce exit code 1.
 */
const LEGACY_CONTENTS_JSON = {
  images: [
    { idiom: "iphone", scale: "2x", size: "20x20" },
    { idiom: "iphone", scale: "3x", size: "20x20" },
    { idiom: "iphone", scale: "2x", size: "29x29" },
    { idiom: "iphone", scale: "3x", size: "29x29" },
    { idiom: "iphone", scale: "2x", size: "40x40" },
    { idiom: "iphone", scale: "3x", size: "40x40" },
    { idiom: "iphone", scale: "2x", size: "60x60" },
    { idiom: "iphone", scale: "3x", size: "60x60" },
    { idiom: "ipad", scale: "1x", size: "20x20" },
    { idiom: "ipad", scale: "2x", size: "20x20" },
    { idiom: "ios-marketing", scale: "1x", size: "1024x1024" },
  ],
  info: { author: "xcode", version: 1 },
};

/**
 * Catalog that has idiom=universal but is missing the 1024×1024 entry.
 * Should produce exit code 1 because the marketing icon is missing.
 */
const MISSING_MARKETING_ICON_CONTENTS_JSON = {
  images: [
    {
      filename: "AppIcon-60@2x.png",
      idiom: "universal",
      size: "60x60",
      scale: "2x",
    },
    {
      filename: "AppIcon-60@3x.png",
      idiom: "universal",
      size: "60x60",
      scale: "3x",
    },
  ],
  info: { author: "xcode", version: 1 },
};

/**
 * A watchOS catalog that the iOS validator must skip entirely.
 * The script under test must NOT fail on this fixture.
 */
const WATCHOS_CONTENTS_JSON = {
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

// ── helper ─────────────────────────────────────────────────────────────────────

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "validate-ios-icon-test-"));
}

/**
 * Run validate-ios-icon-format.js with a synthetic file-system rooted at a
 * temp directory.  `contents` is written to
 * `{tmpDir}/ios/PregnancyAIAssistant/Images.xcassets/AppIcon.appiconset/Contents.json`
 * so the script finds it via its normal ios/ search path.
 *
 * We patch ROOT by reading the script source and replacing the ROOT line before
 * eval-ing it in a thin wrapper (same pattern used by validateWatchIconFormat
 * and validateEasProvisioning tests).
 */
function runScript(
  contents: object,
  opts: { iOSPath?: string } = {},
): {
  exitCode: number;
  stdout: string;
  stderr: string;
} {
  const tmpDir = makeTempDir();
  try {
    // Build the expected path the script will search:
    //   {ROOT}/ios/<AppName>/Images.xcassets/AppIcon.appiconset/Contents.json
    const relPath =
      opts.iOSPath ??
      "ios/PregnancyAIAssistant/Images.xcassets/AppIcon.appiconset";
    const iconsetDir = path.join(tmpDir, relPath);
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

    // 60 s timeout: spawning a Node process under heavy CI load (concurrent
    // test runs) can easily exceed 10 s; a timed-out spawn returns status=null
    // which collapses to exitCode 1 and silently fails the "happy path" checks.
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

/**
 * Run the script against a temp directory that has an ios/ folder but no
 * AppIcon.appiconset inside (simulates a pre-prebuild state).
 */
function runScriptWithEmptyIos(): {
  exitCode: number;
  stdout: string;
  stderr: string;
} {
  const tmpDir = makeTempDir();
  try {
    fs.mkdirSync(path.join(tmpDir, "ios"), { recursive: true });

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

describe("validate-ios-icon-format.js", () => {
  // ── happy path ───────────────────────────────────────────────────────────────

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
      expect(stdout).toMatch(/modern single-image iOS format/i);
    });

    it("confirms the 1024×1024 marketing icon entry was found", () => {
      const { stdout } = runScript(MODERN_CONTENTS_JSON);
      expect(stdout).toMatch(/1024.1024 marketing icon/i);
    });
  });

  // ── failure path: legacy per-size format ─────────────────────────────────────

  describe("failure path — legacy per-size slot format", () => {
    it("exits 1 when Contents.json uses the legacy per-size format", () => {
      const { exitCode } = runScript(LEGACY_CONTENTS_JSON);
      expect(exitCode).toBe(1);
    });

    it("reports failed check(s) in stderr summary", () => {
      const { stderr } = runScript(LEGACY_CONTENTS_JSON);
      expect(stderr).toMatch(/check\(s\) failed/i);
    });

    it("flags legacy idioms (iphone/ipad/ios-marketing) in stderr", () => {
      const { stderr } = runScript(LEGACY_CONTENTS_JSON);
      // The error should mention at least one of the legacy idioms found
      expect(stderr).toMatch(/legacy idiom|iphone|ipad|ios-marketing/i);
    });

    it("tells the developer to switch to the modern format in stderr", () => {
      const { stderr } = runScript(LEGACY_CONTENTS_JSON);
      expect(stderr).toMatch(/modern single-image format/i);
    });

    it("instructs developer to use idiom=universal in stderr", () => {
      const { stderr } = runScript(LEGACY_CONTENTS_JSON);
      expect(stderr).toMatch(/idiom.*universal|universal.*idiom/i);
    });
  });

  // ── failure path: missing 1024×1024 entry ────────────────────────────────────

  describe("failure path — missing 1024×1024 marketing icon", () => {
    it("exits 1 when no 1024×1024 entry is present", () => {
      const { exitCode } = runScript(MISSING_MARKETING_ICON_CONTENTS_JSON);
      expect(exitCode).toBe(1);
    });

    it("mentions 1024×1024 as the required size in stderr", () => {
      const { stderr } = runScript(MISSING_MARKETING_ICON_CONTENTS_JSON);
      expect(stderr).toMatch(/1024.1024/);
    });

    it("mentions App Store submission requirement in stderr", () => {
      const { stderr } = runScript(MISSING_MARKETING_ICON_CONTENTS_JSON);
      expect(stderr).toMatch(/App Store submission|marketing icon/i);
    });
  });

  // ── watchOS catalog exclusion ────────────────────────────────────────────────

  describe("watchOS catalog exclusion", () => {
    it("exits 0 when the only catalog is a watchOS one (no iOS catalogs to check)", () => {
      // Place the fixture under ios/PregnancyWatchApp/ so it is skipped
      const { exitCode } = runScript(WATCHOS_CONTENTS_JSON, {
        iOSPath: "ios/PregnancyWatchApp/Assets.xcassets/AppIcon.appiconset",
      });
      // No iOS catalogs found → script exits 0 with a warning
      expect(exitCode).toBe(0);
    });

    it("emits a warning (not an error) when no iOS catalogs remain after skipping watchOS ones", () => {
      const { stdout, stderr } = runScript(WATCHOS_CONTENTS_JSON, {
        iOSPath: "ios/PregnancyWatchApp/Assets.xcassets/AppIcon.appiconset",
      });
      // Should either warn on stdout or stderr — not fail
      const combined = stdout + stderr;
      expect(combined).toMatch(/skipping|no ios appicon|prebuild/i);
    });
  });

  // ── edge cases ───────────────────────────────────────────────────────────────

  describe("edge cases", () => {
    it("exits 0 when the ios/ directory is empty (no catalogs — prebuild not yet run)", () => {
      const { exitCode } = runScriptWithEmptyIos();
      expect(exitCode).toBe(0);
    });

    it("emits a warning when ios/ is empty", () => {
      const { stdout, stderr } = runScriptWithEmptyIos();
      const combined = stdout + stderr;
      expect(combined).toMatch(/no appicon|prebuild/i);
    });

    it("exits 0 when the ios/ directory does not exist at all", () => {
      // Entirely missing ios/ dir (ROOT has no ios/ child)
      const tmpDir = makeTempDir();
      try {
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
      const { exitCode, stderr } = runScript(emptyImages);
      expect(exitCode).toBe(1);
      expect(stderr).toMatch(/missing or empty/i);
    });

    it("exits 1 when Contents.json is not valid JSON", () => {
      const tmpDir = makeTempDir();
      try {
        const iconsetDir = path.join(
          tmpDir,
          "ios/PregnancyAIAssistant/Images.xcassets/AppIcon.appiconset",
        );
        fs.mkdirSync(iconsetDir, { recursive: true });
        fs.writeFileSync(
          path.join(iconsetDir, "Contents.json"),
          "{ not valid json ,,",
        );

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

        expect(result.status).toBe(1);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });
});
