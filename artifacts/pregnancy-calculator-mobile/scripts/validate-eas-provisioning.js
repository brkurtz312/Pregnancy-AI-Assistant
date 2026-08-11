#!/usr/bin/env node
/**
 * validate-eas-provisioning.js
 *
 * Pre-build sanity check: confirms that both the main app and the Watch
 * extension bundle identifiers are consistently declared in app.json and
 * eas.json before an EAS build is submitted.
 *
 * Catches the class of failure where the Watch provisioning profile is
 * silently missing or misconfigured, which only surfaces as a cryptic
 * codesigning error late in the EAS build — not during prebuild.
 *
 * Usage:
 *   node scripts/validate-eas-provisioning.js
 *   # or via package.json script:
 *   pnpm run validate:provisioning
 *
 * Exit codes:
 *   0 — all checks passed
 *   1 — one or more checks failed (details printed to stderr)
 */

"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

// ── helpers ──────────────────────────────────────────────────────────────────

function loadJson(relPath) {
  const abs = path.join(ROOT, relPath);
  if (!fs.existsSync(abs)) {
    throw new Error(`File not found: ${relPath}`);
  }
  return JSON.parse(fs.readFileSync(abs, "utf8"));
}

let passed = 0;
let failed = 0;

function ok(msg) {
  console.log(`  ✔  ${msg}`);
  passed++;
}

function fail(msg) {
  console.error(`  ✘  ${msg}`);
  failed++;
}

function section(title) {
  console.log(`\n${title}`);
  console.log("─".repeat(title.length));
}

// ── load config files ─────────────────────────────────────────────────────────

let appJson, easJson;
try {
  appJson = loadJson("app.json");
  easJson = loadJson("eas.json");
} catch (err) {
  console.error(`\nFATAL: ${err.message}`);
  process.exit(1);
}

const expoConfig = appJson.expo ?? {};
const iosConfig = expoConfig.ios ?? {};
const extraEas = expoConfig.extra?.eas ?? {};

// ── 1. Main app bundle identifier ─────────────────────────────────────────────

section("1. Main app bundle identifier");

const mainBundleId = iosConfig.bundleIdentifier;
if (mainBundleId) {
  ok(`app.json ios.bundleIdentifier = "${mainBundleId}"`);
} else {
  fail("app.json is missing ios.bundleIdentifier");
}

// ── 2. Watch extension bundle identifier ──────────────────────────────────────

section("2. Watch extension bundle identifier");

const FALLBACK_BUNDLE_ID = "app.replit.pregnancycalculator";
const effectiveBundleId = mainBundleId || FALLBACK_BUNDLE_ID;
const EXPECTED_WATCH_BUNDLE_ID = `${effectiveBundleId}.watchapp`;

const appExtensions = extraEas?.build?.experimental?.ios?.appExtensions ?? [];

const watchExtension = appExtensions.find(
  (ext) => ext.bundleIdentifier === EXPECTED_WATCH_BUNDLE_ID,
);

if (appExtensions.length === 0) {
  fail(
    "app.json extra.eas.build.experimental.ios.appExtensions is empty — " +
      "EAS will not provision a Watch profile",
  );
} else if (!watchExtension) {
  fail(
    `No appExtension with bundleIdentifier "${EXPECTED_WATCH_BUNDLE_ID}" found. ` +
      `Found: [${appExtensions.map((e) => e.bundleIdentifier).join(", ")}]`,
  );
} else {
  ok(
    `app.json appExtensions includes Watch bundleIdentifier "${EXPECTED_WATCH_BUNDLE_ID}"`,
  );

  const targetName = watchExtension.targetName;
  if (targetName) {
    ok(`Watch targetName = "${targetName}"`);
  } else {
    fail("Watch appExtension is missing targetName");
  }

  const appGroups =
    watchExtension.entitlements?.["com.apple.security.application-groups"] ??
    [];
  const expectedGroup = `group.${effectiveBundleId}`;
  if (appGroups.includes(expectedGroup)) {
    ok(`Watch entitlements include App Group "${expectedGroup}"`);
  } else {
    fail(
      `Watch entitlements are missing App Group "${expectedGroup}". ` +
        `Found: [${appGroups.join(", ")}]`,
    );
  }
}

// ── 3. EAS production profile — credentials source ────────────────────────────

section("3. EAS production profile — credentials source");

const productionProfile = easJson?.build?.production ?? {};
const iosCredentialsSource = productionProfile?.ios?.credentialsSource;

if (iosCredentialsSource === "remote") {
  ok(
    'eas.json build.production.ios.credentialsSource = "remote" ' +
      "(EAS always regenerates profiles, never reuses a stale cache)",
  );
} else {
  fail(
    `eas.json build.production.ios.credentialsSource is "${iosCredentialsSource ?? "not set"}". ` +
      'Set it to "remote" so EAS auto-provisioning regenerates both profiles ' +
      "on every build instead of reusing a potentially expired cached profile.",
  );
}

// ── 4. EAS CLI version ────────────────────────────────────────────────────────

section("4. EAS CLI version requirement");

const cliVersion = easJson?.cli?.version;
if (cliVersion) {
  ok(`eas.json cli.version = "${cliVersion}"`);
} else {
  fail("eas.json is missing cli.version");
}

// ── 5. Watch plugin registered ────────────────────────────────────────────────

section("5. Watch config plugin registration");

const plugins = expoConfig.plugins ?? [];
const hasWatchPlugin = plugins.some(
  (p) =>
    p === "./plugins/withWatchExtension" ||
    (Array.isArray(p) && p[0] === "./plugins/withWatchExtension"),
);

if (hasWatchPlugin) {
  ok('app.json plugins includes "./plugins/withWatchExtension"');
} else {
  fail(
    'app.json plugins is missing "./plugins/withWatchExtension" — ' +
      "the Watch Xcode target will not be added during prebuild",
  );
}

// ── summary ───────────────────────────────────────────────────────────────────

console.log(`\n${"═".repeat(50)}`);
if (failed === 0) {
  console.log(
    `\n✅  All ${passed} checks passed. Both provisioning profiles should be ` +
      "provisioned correctly by EAS.\n",
  );
  process.exit(0);
} else {
  console.error(
    `\n❌  ${failed} check(s) failed, ${passed} passed. ` +
      "Fix the issues above before submitting an EAS build to avoid a " +
      "silent codesigning failure.\n",
  );
  process.exit(1);
}
