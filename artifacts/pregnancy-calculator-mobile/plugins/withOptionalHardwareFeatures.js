/**
 * withOptionalHardwareFeatures.js
 *
 * Expo config plugin that marks hardware features the app doesn't need as
 * optional in AndroidManifest.xml (<uses-feature android:required="false">).
 *
 * Google Play infers required features from other manifest entries:
 * - "orientation": "portrait" in app.json locks the activity to portrait, which
 *   implies android.hardware.screen.portrait. Landscape-only devices
 *   (Chromebooks, desktop, Android XR) were then excluded, although the app
 *   runs fine letterboxed on them.
 * - @react-native-community/netinfo requests ACCESS_WIFI_STATE, which implies
 *   android.hardware.wifi. NetInfo only reports connectivity; the app works on
 *   any network.
 *
 * Play Console flagged both when 1.1.1 (versionCode 3) was sent for review.
 * Declaring a feature explicitly with required="false" overrides the implied
 * requirement.
 */

const { withAndroidManifest } = require("@expo/config-plugins");

const OPTIONAL_FEATURES = [
  "android.hardware.screen.portrait",
  "android.hardware.wifi",
];

/** @typedef {{ $: Record<string, string> }} UsesFeature */

/**
 * Adds or updates <uses-feature android:required="false"> entries.
 * Exported for tests.
 *
 * @template {{ manifest: { "uses-feature"?: UsesFeature[] } }} M
 * @param {M} manifest The parsed AndroidManifest.xml (modResults).
 * @param {string[]} features Feature names to mark optional.
 * @returns {M}
 */
function markFeaturesOptional(manifest, features = OPTIONAL_FEATURES) {
  const root = manifest.manifest;
  const existing = root["uses-feature"] ?? [];

  for (const name of features) {
    const entry = existing.find((f) => f.$?.["android:name"] === name);
    if (entry) {
      entry.$["android:required"] = "false";
    } else {
      existing.push({
        $: { "android:name": name, "android:required": "false" },
      });
    }
  }

  root["uses-feature"] = existing;
  return manifest;
}

/**
 * @param {import('@expo/config-plugins').ExpoConfig} config
 */
function withOptionalHardwareFeatures(config) {
  return withAndroidManifest(config, (mod) => {
    markFeaturesOptional(mod.modResults);
    return mod;
  });
}

module.exports = withOptionalHardwareFeatures;
module.exports.markFeaturesOptional = markFeaturesOptional;
module.exports.OPTIONAL_FEATURES = OPTIONAL_FEATURES;
