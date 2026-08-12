#!/usr/bin/env node
/**
 * validate-ios-icon-format.js
 *
 * Pre-build sanity check: confirms that the main iPhone AppIcon asset catalog
 * uses the modern single-image format required by App Store Connect.
 *
 * ## Background
 *
 * Apple's validator rejects builds where the main iOS AppIcon uses the legacy
 * per-size slot format (many entries with idiom="iphone"/"ipad"/"ios-marketing"
 * etc.).  The modern format introduced in Xcode 14 requires exactly one entry:
 *
 *   {
 *     "images": [
 *       {
 *         "filename": "AppIcon.png",
 *         "idiom": "universal",
 *         "platform": "ios",
 *         "size": "1024x1024"
 *       }
 *     ],
 *     "info": { "author": "xcode", "version": 1 }
 *   }
 *
 * validate-watch-icon-format.js intentionally skips non-watchOS catalogs.
 * This companion script fills the gap by validating the main iPhone AppIcon.
 *
 * ## What the check enforces
 *
 *   1. The images array is not missing or empty.
 *   2. Every entry has idiom = "universal"  (no legacy iphone/ipad/ios-marketing
 *      entries that indicate the old per-size slot format).
 *   3. There is at least one entry with size = "1024x1024"  (the App Store
 *      marketing icon, required for submission).
 *
 * ## Usage
 *
 *   node scripts/validate-ios-icon-format.js
 *   # or via package.json:
 *   pnpm run validate:ios-icons
 *
 * ## Exit codes
 *   0 — all catalogs pass (or none found — prebuild may not have run yet)
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
 * (i.e. the path contains "watchapp" or "PregnancyWatchApp", or the catalog's
 * own images declare platform=watchos).
 *
 * These are handled by validate-watch-icon-format.js and must be skipped here.
 */
function isWatchOSCatalog(contentsPath, contents) {
  const normalised = contentsPath.replace(/\\/g, "/");
  if (
    normalised.includes("/watchapp/") ||
    normalised.includes("/PregnancyWatchApp/")
  ) {
    return true;
  }
  if (
    Array.isArray(contents.images) &&
    contents.images.some((img) => img.platform === "watchos")
  ) {
    return true;
  }
  return false;
}

// ── legacy idioms that signal the old per-size slot format ────────────────────

/**
 * Idiom values that indicate the legacy per-size format.
 * Apple's validator accepts these on older SDK targets but rejects them for
 * modern submissions when the modern single-image format is expected.
 */
const LEGACY_IDIOMS = new Set([
  "iphone",
  "ipad",
  "ios-marketing",
  "mac",
  "watch",
  "tv",
  "car",
]);

// ── validate a single catalog ─────────────────────────────────────────────────

/**
 * Validates that `contents` (parsed Contents.json) uses the modern
 * single-image iOS format.  Returns true if valid, false otherwise.
 *
 * Valid modern format:
 *   • images array has at least one entry
 *   • every entry has idiom = "universal"  (no legacy per-device idioms)
 *   • at least one entry has size = "1024x1024"
 *
 * Rejected legacy format:
 *   • entries with idiom = "iphone" / "ipad" / "ios-marketing" etc.
 *     (the old per-size slot format that Apple now rejects on submission)
 */
function validateIOSIconCatalog(contentsPath, contents) {
  const rel = path.relative(ROOT, contentsPath);
  section(`Checking: ${rel}`);

  if (!Array.isArray(contents.images) || contents.images.length === 0) {
    fail(`images array is missing or empty — no icon will be compiled`);
    return false;
  }

  const images = contents.images;
  let catalogPassed = true;

  // Check 1: no legacy idioms (iphone, ipad, ios-marketing, …)
  const legacyEntries = images.filter((img) => LEGACY_IDIOMS.has(img.idiom));
  if (legacyEntries.length > 0) {
    fail(
      `${legacyEntries.length} image entry(ies) use a legacy idiom ` +
        `(${[...new Set(legacyEntries.map((e) => e.idiom))].join(", ")}). ` +
        `The modern format requires idiom="universal" for all entries. ` +
        `Switch to the modern single-image format: one entry with ` +
        `idiom="universal", platform="ios", size="1024x1024".`,
    );
    catalogPassed = false;
  } else {
    ok(`All ${images.length} image entry(ies) use idiom = "universal"`);
  }

  // Check 2: every entry must have idiom = "universal"
  const nonUniversal = images.filter(
    (img) => img.idiom !== "universal" && !LEGACY_IDIOMS.has(img.idiom),
  );
  if (nonUniversal.length > 0) {
    fail(
      `${nonUniversal.length} image entry(ies) have an unrecognised idiom: ` +
        JSON.stringify(
          nonUniversal.map((img) => ({ idiom: img.idiom, size: img.size })),
        ) +
        `. Expected idiom="universal".`,
    );
    catalogPassed = false;
  }

  // Check 3: at least one 1024×1024 entry (required for App Store submission)
  const has1024 = images.some((img) => img.size === "1024x1024");
  if (!has1024) {
    fail(
      `No image entry with size="1024x1024" found. ` +
        `A 1024×1024 marketing icon is required for App Store submission. ` +
        `Add an entry with idiom="universal", platform="ios", size="1024x1024".`,
    );
    catalogPassed = false;
  } else {
    ok(`Found required 1024×1024 marketing icon entry`);
  }

  if (catalogPassed) {
    ok(`${rel} — uses modern single-image iOS format ✓`);
  }

  return catalogPassed;
}

// ── main ──────────────────────────────────────────────────────────────────────

console.log("\niOS app icon format validator");
console.log("═".repeat(50));
console.log(
  "Scanning for main iOS AppIcon asset catalogs under:\n" + `  ${ROOT}\n`,
);

// Search the generated ios/ directory (watchOS catalogs are skipped below).
// The watchapp/ source directory is intentionally excluded — it is covered by
// validate-watch-icon-format.js.
const searchDirs = [path.join(ROOT, "ios")];

const allCatalogs = [];
for (const dir of searchDirs) {
  findAppIconCatalogs(dir, allCatalogs);
}

if (allCatalogs.length === 0) {
  console.warn(
    "\n⚠  No AppIcon.appiconset/Contents.json found in ios/.\n" +
      "   If the project has not been prebuilt yet this is expected.\n" +
      "   Run `expo prebuild --platform ios` first, then re-run this check.\n",
  );
  process.exit(0);
}

let iosCatalogsChecked = 0;

for (const catalogPath of allCatalogs) {
  let contents;
  try {
    contents = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
  } catch (err) {
    section(`Checking: ${path.relative(ROOT, catalogPath)}`);
    fail(`Failed to parse JSON: ${err.message}`);
    continue;
  }

  if (isWatchOSCatalog(catalogPath, contents)) {
    // watchOS catalogs are validated by validate-watch-icon-format.js
    console.log(
      `  —  Skipping (watchOS catalog, handled by validate-watch-icon-format.js): ` +
        path.relative(ROOT, catalogPath),
    );
    continue;
  }

  iosCatalogsChecked++;
  validateIOSIconCatalog(catalogPath, contents);
}

// ── summary ───────────────────────────────────────────────────────────────────

console.log(`\n${"═".repeat(50)}`);

// Check failures first — a parse error sets failed > 0 but leaves
// iosCatalogsChecked at 0 (the catalog loop continues past parse errors),
// so we must not let the "no catalogs" early-exit swallow a real failure.
if (failed > 0) {
  console.error(
    `\n❌  ${failed} check(s) failed across ${iosCatalogsChecked} iOS ` +
      `AppIcon catalog(s).\n` +
      `   Fix the issues above before submitting an EAS build to avoid\n` +
      `   rejection from App Store Connect.\n\n` +
      `   Modern format reference:\n` +
      `     {\n` +
      `       "images": [\n` +
      `         {\n` +
      `           "filename": "AppIcon.png",\n` +
      `           "idiom": "universal",\n` +
      `           "platform": "ios",\n` +
      `           "size": "1024x1024"\n` +
      `         }\n` +
      `       ],\n` +
      `       "info": { "author": "xcode", "version": 1 }\n` +
      `     }\n`,
  );
  process.exit(1);
}

if (iosCatalogsChecked === 0) {
  console.warn(
    "\n⚠  No iOS AppIcon catalogs were found to validate.\n" +
      "   This may mean prebuild has not run yet — that is OK.\n",
  );
  process.exit(0);
}

if (failed === 0) {
  console.log(
    `\n✅  All ${passed} check(s) passed across ${iosCatalogsChecked} iOS ` +
      `AppIcon catalog(s).\n` +
      `   The modern single-image format is in place.\n`,
  );
  process.exit(0);
}
