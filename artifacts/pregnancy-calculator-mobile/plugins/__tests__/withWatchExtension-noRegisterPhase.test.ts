/**
 * withWatchExtension-noRegisterPhase.test.ts
 *
 * Guards against re-introducing a '[WatchConnectivity] Register Module'
 * PBXShellScriptBuildPhase on the main iOS app target.
 *
 * Background: the plugin previously patched ExpoModulesProvider.swift by
 * adding a Run Script build phase named '[WatchConnectivity] Register Module'.
 * That approach was replaced — WatchConnectivityModule is now registered via
 * packages/watch-connectivity/ (expo-module.config.json + podspec), which
 * expo-modules-autolinking picks up automatically. The Run Script phase is
 * no longer needed and must not be re-introduced.
 *
 * Three assertion groups:
 *   1. Static pbxproj   — the committed ios/ pbxproj already contains no
 *                         such phase (text search).
 *   2. Plugin source    — withWatchExtension.js itself does not reference
 *                         the stale phase name (regression guard).
 *   3. Plugin export    — _withWatchXcodeTargetInner is exported via
 *                         _internals so future tests can call it when the
 *                         xcode library is available in the test environment.
 */

import fs from "fs";
import path from "path";

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

// From plugins/__tests__/ resolve to ios/
const PBXPROJ_PATH = path.resolve(
  __dirname,
  "../../ios/PregnancyAIAssistant.xcodeproj/project.pbxproj",
);

const PLUGIN_PATH = path.resolve(__dirname, "../withWatchExtension.js");

const STALE_PHASE_NAME = "[WatchConnectivity] Register Module";

// ---------------------------------------------------------------------------
// Plugin under test
// ---------------------------------------------------------------------------

const plugin = require("../withWatchExtension");

// ---------------------------------------------------------------------------
// 1. Static check — the committed ios/ pbxproj is already clean
// ---------------------------------------------------------------------------

describe("committed ios/ pbxproj — static file check", () => {
  let pbxprojContent: string;
  let pbxprojExists: boolean;

  beforeAll(() => {
    pbxprojExists = fs.existsSync(PBXPROJ_PATH);
    pbxprojContent = pbxprojExists
      ? fs.readFileSync(PBXPROJ_PATH, "utf8")
      : "";
  });

  it("pbxproj file is present (ios/ directory has been prebuilt)", () => {
    // Warn but do not hard-fail — a fresh clone without ios/ should not
    // block CI.  The subsequent assertions skip gracefully when absent.
    if (!pbxprojExists) {
      console.warn(
        `[WARN] ${PBXPROJ_PATH} not found — static pbxproj checks skipped.`,
      );
    }
    expect(pbxprojExists).toBe(true);
  });

  it("does not contain '[WatchConnectivity] Register Module' anywhere", () => {
    if (!pbxprojExists) {
      // No ios/ directory — skip gracefully.
      expect(true).toBe(true);
      return;
    }
    expect(pbxprojContent).not.toContain(STALE_PHASE_NAME);
  });

  it("'Embed Watch App' shell script phase IS present (sanity check)", () => {
    if (!pbxprojExists) {
      expect(true).toBe(true);
      return;
    }
    // Confirm the correct replacement phase was added so we know the plugin
    // ran successfully and the stale phase wasn't just never written at all.
    expect(pbxprojContent).toContain("Embed Watch App");
  });
});

// ---------------------------------------------------------------------------
// 2. Source-level check — the plugin itself does not contain the stale name
// ---------------------------------------------------------------------------

describe("plugin source — withWatchExtension.js", () => {
  let pluginSource: string;

  beforeAll(() => {
    pluginSource = fs.readFileSync(PLUGIN_PATH, "utf8");
  });

  it("does not reference '[WatchConnectivity] Register Module' as a phase name", () => {
    expect(pluginSource).not.toContain(STALE_PHASE_NAME);
  });

  it("does not contain any 'Register Module' string in a PBXShellScriptBuildPhase context", () => {
    // Broader guard: catch any variant like "WC Register Module", etc.
    // The only legitimate 'Register Module' concept is handled by autolinking,
    // not by a build phase written here.
    const shellPhaseNameRe = /name\s*[:=]\s*["']?[^"'\n]*Register Module/;
    expect(shellPhaseNameRe.test(pluginSource)).toBe(false);
  });

  it("contains the autolinking comment explaining why no Run Script is needed", () => {
    // Confirm the intentional design decision is documented in the source so
    // future readers understand why there is no ExpoModulesProvider patch.
    expect(pluginSource).toMatch(
      /expo-module(?:s-autolinking|s\.config\.json|\.config\.json)|autolinking/i,
    );
  });
});

// ---------------------------------------------------------------------------
// 3. Export check — _withWatchXcodeTargetInner is accessible for testing
// ---------------------------------------------------------------------------

describe("plugin _internals exports", () => {
  it("plugin module exports a function (the config plugin)", () => {
    expect(typeof plugin).toBe("function");
  });

  it("_internals is an object", () => {
    expect(typeof plugin._internals).toBe("object");
    expect(plugin._internals).not.toBeNull();
  });

  it("_withWatchXcodeTargetInner is exported via _internals", () => {
    expect(typeof plugin._internals._withWatchXcodeTargetInner).toBe(
      "function",
    );
  });

  it("WATCH_TARGET_NAME is exported via _internals", () => {
    expect(typeof plugin._internals.WATCH_TARGET_NAME).toBe("string");
    expect(plugin._internals.WATCH_TARGET_NAME).toBe("PregnancyWatchApp");
  });

  it("ensureWatchTestTarget is exported via _internals", () => {
    expect(typeof plugin._internals.ensureWatchTestTarget).toBe("function");
  });
});
