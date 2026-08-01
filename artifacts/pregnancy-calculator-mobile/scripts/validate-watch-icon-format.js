#!/usr/bin/env node
/**
 * validate-watch-icon-format.js
 *
 * Pre-build sanity check: confirms that every watchOS AppIcon asset catalog
 * uses the modern single-image format required by App Store Connect.
 *
 * ## Background
 *
 * Build #116 passed EAS compilation and included a valid Assets.car but was
 * rejected by Apple's validator with ITMS-90391 because the AppIcon asset
 * catalog used the legacy per-size format — many entries each reusing the
 * same 1024×1024 image. Xcode's asset catalog compiler accepted the file
 * silently; the error only surfaced after upload to App Store Connect.
 *
 * Build #124 fixed this by switching to the modern single-image format:
 *
 *   {
 *     "images": [
 *       {
 *         "filename": "AppIcon.png",
 *         "idiom": "universal",
 *         "platform": "watchos",
 *         "size": "1024x1024"
 *       }
 *     ],
 *     "info": { "author": "xcode", "version": 1 }
 *   }
 *
 * This script catches a regression before it reaches EAS / Apple.
 *
 * ## What the check enforces
 *
 *   1. Exactly one image entry (or, if multiple, every entry carries
 *      `"platform": "watchos"` — Xcode 16+ accepts that too).
 *   2. Every image entry has `"idiom": "universal"`.
 *   3. No image entry is missing `"platform"` (which is the hallmark of the
 *      old per-size slot format that triggers ITMS-90391).
 *
 * ## Usage
 *
 *   node scripts/validate-watch-icon-format.js
 *   # or via package.json:
 *   pnpm run validate:watch-icons
 *
 * ## Exit codes
 *   0 — all catalogs pass
 *   1 — one or more catalogs fail (details printed to stderr)
 */

"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

// ── helpers ──────────────────────────────────────────────────────────────────

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

// ── locate all AppIcon appiconset Contents.json files ─────────────────────────

/**
 * Walk `dir` recursively and return all paths matching
 * `AppIcon.appiconset/Contents.json` (case-sensitive).
 */
function findAppIconCatalogs(dir, results = []) {
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (
        entry.name.endsWith(".appiconset") &&
        entry.name.startsWith("AppIcon")
      ) {
        const contentsJson = path.join(full, "Contents.json");
        if (fs.existsSync(contentsJson)) {
          results.push(contentsJson);
        }
      } else {
        findAppIconCatalogs(full, results);
      }
    }
  }
  return results;
}

// ── determine whether a catalog belongs to a watchOS target ──────────────────

/**
 * Returns true if the Contents.json lives inside a watchOS asset catalog
 * (i.e. the path contains "watchapp" or "PregnancyWatchApp" or the catalog's
 * own images already declare platform=watchos).
 */
function isWatchOSCatalog(contentsPath, contents) {
  const normalised = contentsPath.replace(/\\/g, "/");
  if (
    normalised.includes("/watchapp/") ||
    normalised.includes("/PregnancyWatchApp/")
  ) {
    return true;
  }
  // Also treat it as watchOS if the images already declare platform=watchos
  if (
    Array.isArray(contents.images) &&
    contents.images.some((img) => img.platform === "watchos")
  ) {
    return true;
  }
  return false;
}

// ── validate a single catalog ─────────────────────────────────────────────────

/**
 * Validates that `contents` (parsed Contents.json) uses the modern
 * single-image watchOS format.  Returns true if valid, false otherwise.
 *
 * Valid modern format:
 *   • images array has exactly one entry  (or all entries have platform=watchos)
 *   • every entry has idiom = "universal"
 *   • every entry has platform = "watchos"
 *
 * Rejected legacy format:
 *   • multiple entries without platform  (the per-size slot format that causes
 *     ITMS-90391 — Xcode compiles it silently but Apple's validator rejects it)
 */
function validateWatchIconCatalog(contentsPath, contents) {
  const rel = path.relative(ROOT, contentsPath);
  section(`Checking: ${rel}`);

  if (!Array.isArray(contents.images) || contents.images.length === 0) {
    fail(`images array is missing or empty — no icon will be compiled`);
    return false;
  }

  const images = contents.images;
  let catalogPassed = true;

  // Check 1: every entry must have idiom = "universal"
  const nonUniversal = images.filter((img) => img.idiom !== "universal");
  if (nonUniversal.length > 0) {
    fail(
      `${nonUniversal.length} image entry(ies) have idiom != "universal": ` +
        JSON.stringify(
          nonUniversal.map((img) => ({ idiom: img.idiom, size: img.size })),
        ),
    );
    catalogPassed = false;
  } else {
    ok(`All ${images.length} image entry(ies) have idiom = "universal"`);
  }

  // Check 2: every entry must have platform = "watchos"
  const missingPlatform = images.filter((img) => img.platform !== "watchos");
  if (missingPlatform.length > 0) {
    fail(
      `${missingPlatform.length} image entry(ies) are missing "platform": "watchos" — ` +
        `this is the legacy per-size slot format that triggers ITMS-90391 on submission. ` +
        `Switch to the modern single-image format: one entry with idiom="universal", ` +
        `platform="watchos", size="1024x1024".`,
    );
    catalogPassed = false;
  } else {
    ok(`All ${images.length} image entry(ies) have platform = "watchos"`);
  }

  // Check 3: warn if more than one entry (not an error, but unusual)
  if (images.length > 1 && catalogPassed) {
    console.warn(
      `  ⚠  ${images.length} image entries found. ` +
        `The modern format typically uses one entry (idiom=universal, platform=watchos, ` +
        `size=1024x1024). Multiple entries are accepted as long as all pass checks above.`,
    );
  }

  if (catalogPassed) {
    ok(`${rel} — uses modern single-image watchOS format ✓`);
  }

  return catalogPassed;
}

// ── main ──────────────────────────────────────────────────────────────────────

console.log("\nwatch icon format validator");
console.log("═".repeat(50));
console.log(
  "Scanning for watchOS AppIcon asset catalogs under:\n" + `  ${ROOT}\n`,
);

// Search the watchapp source directory and the generated ios/ directory
const searchDirs = [path.join(ROOT, "watchapp"), path.join(ROOT, "ios")];

const allCatalogs = [];
for (const dir of searchDirs) {
  findAppIconCatalogs(dir, allCatalogs);
}

if (allCatalogs.length === 0) {
  console.warn(
    "\n⚠  No AppIcon.appiconset/Contents.json found in watchapp/ or ios/.\n" +
      "   If the watch target has not been prebuilt yet this is expected.\n" +
      "   Run `expo prebuild --platform ios` first, then re-run this check.\n",
  );
  process.exit(0);
}

let watchCatalogsChecked = 0;

for (const catalogPath of allCatalogs) {
  let contents;
  try {
    contents = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
  } catch (err) {
    section(`Checking: ${path.relative(ROOT, catalogPath)}`);
    fail(`Failed to parse JSON: ${err.message}`);
    continue;
  }

  if (!isWatchOSCatalog(catalogPath, contents)) {
    // Skip non-watchOS catalogs (e.g. the main iPhone AppIcon)
    console.log(
      `  —  Skipping (not a watchOS catalog): ${path.relative(ROOT, catalogPath)}`,
    );
    continue;
  }

  watchCatalogsChecked++;
  validateWatchIconCatalog(catalogPath, contents);
  // fail() calls inside validateWatchIconCatalog already increment `failed`
}

// ── summary ───────────────────────────────────────────────────────────────────

console.log(`\n${"═".repeat(50)}`);

if (watchCatalogsChecked === 0) {
  console.warn(
    "\n⚠  No watchOS AppIcon catalogs were found to validate.\n" +
      "   This may mean prebuild has not run yet — that is OK.\n",
  );
  process.exit(0);
}

if (failed === 0) {
  console.log(
    `\n✅  All ${passed} check(s) passed across ${watchCatalogsChecked} watchOS ` +
      `AppIcon catalog(s).\n` +
      `   The modern single-image format is in place — ITMS-90391 will not fire.\n`,
  );
  process.exit(0);
} else {
  console.error(
    `\n❌  ${failed} check(s) failed across ${watchCatalogsChecked} watchOS ` +
      `AppIcon catalog(s).\n` +
      `   Fix the issues above before submitting an EAS build to avoid an\n` +
      `   ITMS-90391 rejection from App Store Connect.\n\n` +
      `   Modern format reference:\n` +
      `     {\n` +
      `       "images": [\n` +
      `         {\n` +
      `           "filename": "AppIcon.png",\n` +
      `           "idiom": "universal",\n` +
      `           "platform": "watchos",\n` +
      `           "size": "1024x1024"\n` +
      `         }\n` +
      `       ],\n` +
      `       "info": { "author": "xcode", "version": 1 }\n` +
      `     }\n`,
  );
  process.exit(1);
}
