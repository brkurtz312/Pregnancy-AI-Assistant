/**
 * withAppleSignIn.js
 *
 * Expo config plugin that adds the com.apple.developer.applesignin entitlement
 * to the iOS app target. This ensures the Sign in with Apple capability is
 * present after every `expo prebuild`, since the ios/ directory is gitignored
 * and regenerated from config on each build.
 *
 * `usesAppleSignIn: true` in app.json (expo.ios) requests the capability from
 * Expo's built-in handling, but adding it explicitly here makes the intent
 * clear and guarantees it is applied even if the built-in path changes.
 */

const { withEntitlementsPlist } = require("@expo/config-plugins");

/**
 * @param {import('@expo/config-plugins').ExpoConfig} config
 */
function withAppleSignIn(config) {
  return withEntitlementsPlist(config, (mod) => {
    // Only applies to iOS; the modifier is iOS-only by design.
    mod.modResults["com.apple.developer.applesignin"] = ["Default"];
    return mod;
  });
}

module.exports = withAppleSignIn;
