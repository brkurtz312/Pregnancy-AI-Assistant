/**
 * withValidateIOSIconCatalog.js
 *
 * Expo config plugin — validates the generated iPhone AppIcon asset catalog
 * during `expo prebuild`, AFTER Expo has written the ios/ directory.
 *
 * ## Why this exists
 *
 * `eas-build-post-install` runs before Expo prebuild, so the ios/ directory
 * does not exist yet at that point — validate-ios-icon-format.js exits 0
 * silently when ios/ is absent.  `withFinalizedMod` schedules last in the
 * Expo mod pipeline (after all built-in mods, including those that write the
 * AppIcon asset catalog), making it the correct hook for post-prebuild
 * inspection.
 *
 * Throwing from a `withFinalizedMod` handler aborts `expo prebuild` before
 * Xcode compilation begins, so no EAS build credits are consumed.
 *
 * ## Validation performed
 *
 * See validate-ios-icon-format.js for the standalone-script rule set; this
 * plugin enforces the same checks via the exported `validateCatalog` helper:
 *   1. images array is not missing or empty
 *   2. every entry has idiom = "universal" (no legacy iphone/ipad/ios-marketing)
 *   3. at least one entry has size = "1024x1024"
 *
 * ## Exports
 *
 * module.exports               — the Expo config plugin function
 * module.exports.validateCatalog — validation helper (used by tests directly)
 * module.exports.isWatchOSCatalog — catalog-type helper (used by tests)
 * module.exports.findIOSAppIconCatalogs — catalog-finder helper (used by tests)
 */

"use strict";

const { withFinalizedMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

// ── shared validation helpers ─────────────────────────────────────────────────

/** Idiom values that indicate the legacy per-size format. */
const LEGACY_IDIOMS = new Set([
  "iphone",
  "ipad",
  "ios-marketing",
  "mac",
  "watch",
  "tv",
  "car",
]);

/**
 * Walk `dir` recursively and return all paths matching
 * `AppIcon.appiconset/Contents.json`.
 */
function findIOSAppIconCatalogs(dir, results = []) {
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
        if (fs.existsSync(contentsJson)) results.push(contentsJson);
      } else {
        findIOSAppIconCatalogs(full, results);
      }
    }
  }
  return results;
}

/**
 * Returns true if the Contents.json belongs to a watchOS asset catalog.
 * Those are validated by validate-watch-icon-format.js and must be skipped.
 *
 * @param {string} contentsPath  Absolute path to Contents.json
 * @param {object} contents      Parsed JSON object
 * @returns {boolean}
 */
function isWatchOSCatalog(contentsPath, contents) {
  const norm = contentsPath.replace(/\\/g, "/");
  if (norm.includes("/watchapp/") || norm.includes("/PregnancyWatchApp/")) {
    return true;
  }
  return (
    Array.isArray(contents.images) &&
    contents.images.some((img) => img.platform === "watchos")
  );
}

/**
 * Validate a single AppIcon catalog.
 *
 * Returns an empty array when the catalog is valid, or an array of
 * human-readable error messages (one per failing check) when it is not.
 * WatchOS catalogs are always skipped (return []).
 *
 * @param {string} catalogPath  Absolute path to Contents.json
 * @returns {string[]}          Error messages; empty = valid
 */
function validateCatalog(catalogPath) {
  let contents;
  try {
    contents = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
  } catch (err) {
    return [`Failed to parse ${catalogPath}: ${err.message}`];
  }

  if (isWatchOSCatalog(catalogPath, contents)) return [];

  const errors = [];
  const images = contents.images;

  if (!Array.isArray(images) || images.length === 0) {
    errors.push(
      `${catalogPath}: images array is missing or empty — no icon will be compiled`,
    );
    return errors;
  }

  // Check 1: no legacy idioms (iphone, ipad, ios-marketing, …)
  const legacyEntries = images.filter((img) => LEGACY_IDIOMS.has(img.idiom));
  if (legacyEntries.length > 0) {
    const idioms = [...new Set(legacyEntries.map((e) => e.idiom))].join(", ");
    errors.push(
      `${catalogPath}: ${legacyEntries.length} image entry(ies) use a legacy idiom ` +
        `(${idioms}). Switch to the modern single-image format: one entry with ` +
        `idiom="universal", platform="ios", size="1024x1024".`,
    );
  }

  // Check 2: any remaining non-universal, non-legacy idiom is also wrong
  const nonUniversal = images.filter(
    (img) => img.idiom !== "universal" && !LEGACY_IDIOMS.has(img.idiom),
  );
  if (nonUniversal.length > 0) {
    errors.push(
      `${catalogPath}: ${nonUniversal.length} image entry(ies) have an unrecognised idiom: ` +
        JSON.stringify(
          nonUniversal.map((img) => ({ idiom: img.idiom, size: img.size })),
        ) +
        `. Expected idiom="universal".`,
    );
  }

  // Check 3: at least one 1024×1024 entry (required for App Store submission)
  if (!images.some((img) => img.size === "1024x1024")) {
    errors.push(
      `${catalogPath}: No image entry with size="1024x1024" found. ` +
        `A 1024×1024 marketing icon is required for App Store submission. ` +
        `Add an entry with idiom="universal", platform="ios", size="1024x1024".`,
    );
  }

  return errors;
}

// ── plugin ────────────────────────────────────────────────────────────────────

/**
 * Expo config plugin that validates the generated iOS AppIcon catalog.
 *
 * Uses `withFinalizedMod` which is scheduled LAST in the Expo mod pipeline —
 * after all built-in mods (including those that write the AppIcon asset
 * catalog) — so the generated Contents.json reflects the final prebuild output.
 *
 * Throws on any validation failure, aborting `expo prebuild` before Xcode
 * compilation begins.
 *
 * @param {import('@expo/config-plugins').ExpoConfig} config
 * @returns {import('@expo/config-plugins').ExpoConfig}
 */
function withValidateIOSIconCatalog(config) {
  return withFinalizedMod(config, [
    "ios",
    (cfg) => {
      const projectRoot = cfg.modRequest.projectRoot;
      const iosDir = path.join(projectRoot, "ios");

      if (!fs.existsSync(iosDir)) {
        console.warn(
          "[withValidateIOSIconCatalog] ios/ directory not found — skipping icon validation",
        );
        return cfg;
      }

      const catalogs = findIOSAppIconCatalogs(iosDir);
      const iOSCatalogs = catalogs.filter((p) => {
        try {
          const c = JSON.parse(fs.readFileSync(p, "utf8"));
          return !isWatchOSCatalog(p, c);
        } catch {
          return true; // parse errors are surfaced by validateCatalog
        }
      });

      if (iOSCatalogs.length === 0) {
        console.warn(
          "[withValidateIOSIconCatalog] No iOS AppIcon catalogs found in ios/ — skipping",
        );
        return cfg;
      }

      const allErrors = iOSCatalogs.flatMap((p) => validateCatalog(p));

      if (allErrors.length > 0) {
        const msg = [
          "",
          "❌  iOS AppIcon validation failed — aborting prebuild.",
          "   Fix the issues below before submitting to EAS:",
          "",
          ...allErrors.map((e) => `   • ${e}`),
          "",
          "   Modern format reference:",
          '     { "images": [ { "filename": "AppIcon.png",',
          '         "idiom": "universal", "platform": "ios", "size": "1024x1024" } ],',
          '       "info": { "author": "xcode", "version": 1 } }',
          "",
        ].join("\n");
        throw new Error(msg);
      }

      console.log(
        `[withValidateIOSIconCatalog] ✅  ${iOSCatalogs.length} iOS AppIcon catalog(s) validated — modern format confirmed`,
      );
      return cfg;
    },
  ]);
}

// Export the plugin as the default export, with helpers attached so that
// test suites can import and exercise the real validation logic directly.
module.exports = withValidateIOSIconCatalog;
module.exports.validateCatalog = validateCatalog;
module.exports.isWatchOSCatalog = isWatchOSCatalog;
module.exports.findIOSAppIconCatalogs = findIOSAppIconCatalogs;
