/**
 * validateEasProvisioning.test.ts
 *
 * Verifies that scripts/validate-eas-provisioning.js catches a missing or
 * misconfigured Watch bundle ID before an EAS build is submitted.
 *
 * Strategy: write temporary app.json / eas.json fixtures into a temp dir
 * and invoke the script as a child process, then assert on exit code and
 * stderr content.
 */

import { spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

const SCRIPT = path.resolve(
  __dirname,
  "../scripts/validate-eas-provisioning.js",
);

// ── fixture helpers ────────────────────────────────────────────────────────────

const VALID_APP_JSON = {
  expo: {
    name: "Test App",
    slug: "test-app",
    version: "1.0.0",
    ios: {
      bundleIdentifier: "com.example.testapp",
    },
    plugins: ["./plugins/withWatchExtension"],
    extra: {
      eas: {
        projectId: "test-project-id",
        build: {
          experimental: {
            ios: {
              appExtensions: [
                {
                  targetName: "TestWatchApp",
                  bundleIdentifier: "com.example.testapp.watchapp",
                  entitlements: {
                    "com.apple.security.application-groups": [
                      "group.com.example.testapp",
                    ],
                  },
                },
              ],
            },
          },
        },
      },
    },
  },
};

const VALID_EAS_JSON = {
  cli: {
    version: ">= 21.4.0",
  },
  build: {
    production: {
      channel: "production",
      ios: {
        credentialsSource: "remote",
      },
    },
  },
};

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "validate-eas-test-"));
}

/**
 * Run the validation script against arbitrary app.json / eas.json content.
 *
 * We write the fixtures to a temp directory, then invoke the script via
 * Node with a --require shim that overrides the ROOT path used internally.
 */
function runScript(
  appJson: object,
  easJson: object,
): { exitCode: number; stdout: string; stderr: string } {
  const tmpDir = makeTempDir();
  try {
    fs.writeFileSync(
      path.join(tmpDir, "app.json"),
      JSON.stringify(appJson, null, 2),
    );
    fs.writeFileSync(
      path.join(tmpDir, "eas.json"),
      JSON.stringify(easJson, null, 2),
    );

    // Write a thin wrapper that patches __dirname for the required module so
    // loadJson resolves relative to our temp dir instead of the real package root.
    const wrapperPath = path.join(tmpDir, "run-validation.js");
    fs.writeFileSync(
      wrapperPath,
      `
"use strict";
const path = require("path");
const Module = require("module");

// Patch Module._resolveFilename so that when the script calls
// path.resolve(__dirname, "..") it gets our tmpDir.
// Simpler: just monkey-patch fs.existsSync + readFileSync for the
// two config files, then require the real script.
//
// Actually the cleanest approach: re-implement the ROOT override via
// an env variable read by a patched loader. But the script doesn't
// support that.
//
// Cleanest feasible approach without modifying the script: copy it here
// and override ROOT before the rest of the module executes. We do that
// by reading the script source, replacing the ROOT line, and eval-ing it.

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

describe("validate-eas-provisioning.js", () => {
  describe("happy path — both profiles correctly declared", () => {
    it("exits 0 and reports all checks passed", () => {
      const { exitCode, stdout } = runScript(VALID_APP_JSON, VALID_EAS_JSON);
      expect(exitCode).toBe(0);
      expect(stdout).toMatch(/All \d+ checks passed/);
    });
  });

  describe("missing Watch appExtension", () => {
    it("exits 1 when appExtensions array is empty", () => {
      const appJson = JSON.parse(JSON.stringify(VALID_APP_JSON));
      appJson.expo.extra.eas.build.experimental.ios.appExtensions = [];

      const { exitCode, stderr } = runScript(appJson, VALID_EAS_JSON);
      expect(exitCode).toBe(1);
      expect(stderr).toMatch(/appExtensions is empty/i);
    });

    it("exits 1 when appExtensions key is absent entirely", () => {
      const appJson = JSON.parse(JSON.stringify(VALID_APP_JSON));
      delete appJson.expo.extra.eas.build.experimental.ios.appExtensions;

      const { exitCode, stderr } = runScript(appJson, VALID_EAS_JSON);
      expect(exitCode).toBe(1);
      expect(stderr).toMatch(/appExtensions is empty/i);
    });

    it("exits 1 when the whole extra.eas block is absent", () => {
      const appJson = JSON.parse(JSON.stringify(VALID_APP_JSON));
      delete appJson.expo.extra;

      const { exitCode, stderr } = runScript(appJson, VALID_EAS_JSON);
      expect(exitCode).toBe(1);
      expect(stderr).toMatch(/appExtensions is empty/i);
    });
  });

  describe("wrong Watch bundle identifier", () => {
    it("exits 1 when bundleIdentifier has a typo", () => {
      const appJson = JSON.parse(JSON.stringify(VALID_APP_JSON));
      appJson.expo.extra.eas.build.experimental.ios.appExtensions[0].bundleIdentifier =
        "com.example.testapp.watchapp-TYPO";

      const { exitCode, stderr } = runScript(appJson, VALID_EAS_JSON);
      expect(exitCode).toBe(1);
      // Should mention the expected identifier
      expect(stderr).toMatch(/com\.example\.testapp\.watchapp/);
    });

    it("exits 1 when bundleIdentifier uses wrong suffix (.watch instead of .watchapp)", () => {
      const appJson = JSON.parse(JSON.stringify(VALID_APP_JSON));
      appJson.expo.extra.eas.build.experimental.ios.appExtensions[0].bundleIdentifier =
        "com.example.testapp.watch";

      const { exitCode, stderr } = runScript(appJson, VALID_EAS_JSON);
      expect(exitCode).toBe(1);
      expect(stderr).toMatch(/No appExtension with bundleIdentifier/i);
    });

    it("exits 1 when bundleIdentifier is missing the main app prefix", () => {
      const appJson = JSON.parse(JSON.stringify(VALID_APP_JSON));
      appJson.expo.extra.eas.build.experimental.ios.appExtensions[0].bundleIdentifier =
        "watchapp";

      const { exitCode, stderr } = runScript(appJson, VALID_EAS_JSON);
      expect(exitCode).toBe(1);
      expect(stderr).toMatch(/No appExtension with bundleIdentifier/i);
    });
  });

  describe("missing main ios.bundleIdentifier", () => {
    it("exits 1 when ios.bundleIdentifier is absent", () => {
      const appJson = JSON.parse(JSON.stringify(VALID_APP_JSON));
      delete appJson.expo.ios.bundleIdentifier;

      const { exitCode, stderr } = runScript(appJson, VALID_EAS_JSON);
      expect(exitCode).toBe(1);
      expect(stderr).toMatch(/missing ios\.bundleIdentifier/i);
    });
  });

  describe("missing Watch config plugin", () => {
    it("exits 1 when withWatchExtension plugin is not registered", () => {
      const appJson = JSON.parse(JSON.stringify(VALID_APP_JSON));
      appJson.expo.plugins = []; // remove all plugins

      const { exitCode, stderr } = runScript(appJson, VALID_EAS_JSON);
      expect(exitCode).toBe(1);
      expect(stderr).toMatch(/withWatchExtension/i);
    });
  });

  describe("EAS production profile misconfiguration", () => {
    it("exits 1 when credentialsSource is not 'remote'", () => {
      const easJson = JSON.parse(JSON.stringify(VALID_EAS_JSON));
      easJson.build.production.ios.credentialsSource = "local";

      const { exitCode, stderr } = runScript(VALID_APP_JSON, easJson);
      expect(exitCode).toBe(1);
      expect(stderr).toMatch(/credentialsSource/i);
    });

    it("exits 1 when cli.version is missing", () => {
      const easJson = JSON.parse(JSON.stringify(VALID_EAS_JSON));
      delete easJson.cli.version;

      const { exitCode, stderr } = runScript(VALID_APP_JSON, easJson);
      expect(exitCode).toBe(1);
      expect(stderr).toMatch(/cli\.version/i);
    });
  });

  describe("missing or wrong App Group entitlement", () => {
    it("exits 1 when the entitlements block is absent entirely", () => {
      const appJson = JSON.parse(JSON.stringify(VALID_APP_JSON));
      delete appJson.expo.extra.eas.build.experimental.ios.appExtensions[0]
        .entitlements;

      const { exitCode, stderr } = runScript(appJson, VALID_EAS_JSON);
      expect(exitCode).toBe(1);
      expect(stderr).toMatch(/App Group/i);
      expect(stderr).toMatch(/group\.com\.example\.testapp/);
    });

    it("exits 1 when com.apple.security.application-groups array is empty", () => {
      const appJson = JSON.parse(JSON.stringify(VALID_APP_JSON));
      appJson.expo.extra.eas.build.experimental.ios.appExtensions[0].entitlements[
        "com.apple.security.application-groups"
      ] = [];

      const { exitCode, stderr } = runScript(appJson, VALID_EAS_JSON);
      expect(exitCode).toBe(1);
      expect(stderr).toMatch(/App Group/i);
      expect(stderr).toMatch(/group\.com\.example\.testapp/);
    });

    it("exits 1 when application-groups contains a wrong group name", () => {
      const appJson = JSON.parse(JSON.stringify(VALID_APP_JSON));
      appJson.expo.extra.eas.build.experimental.ios.appExtensions[0].entitlements[
        "com.apple.security.application-groups"
      ] = ["group.com.example.otherapp"];

      const { exitCode, stderr } = runScript(appJson, VALID_EAS_JSON);
      expect(exitCode).toBe(1);
      // Error mentions the expected group
      expect(stderr).toMatch(/group\.com\.example\.testapp/);
      // Error also lists what was actually found
      expect(stderr).toMatch(/group\.com\.example\.otherapp/);
    });

    it("exits 0 when the correct App Group is among multiple groups", () => {
      const appJson = JSON.parse(JSON.stringify(VALID_APP_JSON));
      appJson.expo.extra.eas.build.experimental.ios.appExtensions[0].entitlements[
        "com.apple.security.application-groups"
      ] = ["group.com.example.other", "group.com.example.testapp"];

      const { exitCode, stdout } = runScript(appJson, VALID_EAS_JSON);
      expect(exitCode).toBe(0);
      expect(stdout).toMatch(/App Group/i);
    });
  });

  describe("error messages are descriptive", () => {
    it("lists the found bundle identifiers when the Watch ID is wrong", () => {
      const appJson = JSON.parse(JSON.stringify(VALID_APP_JSON));
      appJson.expo.extra.eas.build.experimental.ios.appExtensions[0].bundleIdentifier =
        "com.example.testapp.wrongsuffix";

      const { exitCode, stderr } = runScript(appJson, VALID_EAS_JSON);
      expect(exitCode).toBe(1);
      // The error should list what was actually found
      expect(stderr).toMatch(/com\.example\.testapp\.wrongsuffix/);
    });

    it("prints a non-zero failure count summary", () => {
      const appJson = JSON.parse(JSON.stringify(VALID_APP_JSON));
      appJson.expo.extra.eas.build.experimental.ios.appExtensions = [];

      const { exitCode, stderr } = runScript(appJson, VALID_EAS_JSON);
      expect(exitCode).toBe(1);
      expect(stderr).toMatch(/check\(s\) failed/i);
    });
  });
});
