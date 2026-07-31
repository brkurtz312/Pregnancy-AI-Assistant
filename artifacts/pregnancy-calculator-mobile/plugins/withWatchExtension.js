/**
 * withWatchExtension.js
 *
 * Expo config plugin that adds the Pregnancy AI Watch App target to the
 * generated Xcode project. Runs during `expo prebuild` / `eas build`.
 *
 * Requirements:
 *   - Expo SDK 50+
 *   - watchOS deployment target 8.0+
 *   - The source files in `watchapp/` are copied to `ios/WatchApp/`
 *
 * Usage in app.json:
 *   "plugins": ["./plugins/withWatchExtension"]
 */

const {
  withXcodeProject,
  withDangerousMod,
  withInfoPlist,
} = require("@expo/config-plugins");
const path = require("path");
const fs = require("fs");

const WATCH_TARGET_NAME = "PregnancyWatchApp";
const MAIN_BUNDLE_ID = "app.replit.pregnancycalculator";
const WATCH_BUNDLE_ID = `${MAIN_BUNDLE_ID}.watchapp`;
const WATCH_EXTENSION_BUNDLE_ID = `${WATCH_BUNDLE_ID}.watchkitextension`;
const WATCHOS_DEPLOYMENT_TARGET = "8.0";

// Swift source files that make up the watch app (in watchapp/ at project root)
const WATCH_SWIFT_SOURCES = [
  "PregnancyWatchApp.swift",
  "ContentView.swift",
  "KickCounterView.swift",
  "ContractionTimerView.swift",
  "TipsView.swift",
  "WatchSessionManager.swift",
  "Models.swift",
];

// iPhone-side native files to add to the main iOS target
const PHONE_BRIDGE_SOURCES = [
  "PhoneWatchBridge.swift",
  "WatchConnectivityModule.swift",
];

/**
 * Step 1 – Copy source files into the generated ios/ directory.
 */
function withWatchFiles(config) {
  return withDangerousMod(config, [
    "ios",
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const iosRoot = config.modRequest.platformProjectRoot;
      const sourceDir = path.join(projectRoot, "watchapp");

      // --- Watch Extension target dir ---
      const watchExtDir = path.join(iosRoot, WATCH_TARGET_NAME);
      if (!fs.existsSync(watchExtDir)) fs.mkdirSync(watchExtDir, { recursive: true });

      for (const file of WATCH_SWIFT_SOURCES) {
        const src = path.join(sourceDir, file);
        const dst = path.join(watchExtDir, file);
        if (fs.existsSync(src)) fs.copyFileSync(src, dst);
      }

      // Copy Info.plist and entitlements
      const infoPlistSrc = path.join(sourceDir, "Info.plist");
      const entitlementsSrc = path.join(sourceDir, "PregnancyWatchApp.entitlements");
      if (fs.existsSync(infoPlistSrc)) fs.copyFileSync(infoPlistSrc, path.join(watchExtDir, "Info.plist"));
      if (fs.existsSync(entitlementsSrc)) fs.copyFileSync(entitlementsSrc, path.join(watchExtDir, `${WATCH_TARGET_NAME}.entitlements`));

      // --- Phone bridge files → main app iOS target dir ---
      const appName = config.modRequest.projectName;
      const mainAppDir = path.join(iosRoot, appName);
      for (const file of PHONE_BRIDGE_SOURCES) {
        const src = path.join(sourceDir, file);
        const dst = path.join(mainAppDir, file);
        if (fs.existsSync(src)) fs.copyFileSync(src, dst);
      }

      return config;
    },
  ]);
}

/**
 * Step 2 – Modify the Xcode project to add the Watch targets.
 */
function withWatchXcodeTarget(config) {
  return withXcodeProject(config, async (config) => {
    const project = config.modResults;
    const appName = config.modRequest.projectName;

    // Avoid adding the target twice on repeated prebuild runs
    const existingTargets = project.pbxNativeTargetSection();
    const alreadyAdded = Object.values(existingTargets).some(
      (t) => t && t.name === WATCH_TARGET_NAME,
    );
    if (alreadyAdded) return config;

    // ── 1. Watch App Extension target ──────────────────────────────────────
    const extTarget = project.addTarget(
      WATCH_TARGET_NAME,
      "watchkit_extension",
      WATCH_TARGET_NAME,
      WATCH_EXTENSION_BUNDLE_ID,
    );

    // Source files build phase
    const swiftFiles = WATCH_SWIFT_SOURCES.map(
      (f) => `${WATCH_TARGET_NAME}/${f}`,
    );
    project.addBuildPhase(
      swiftFiles,
      "PBXSourcesBuildPhase",
      "Sources",
      extTarget.uuid,
    );

    // Frameworks build phase
    project.addBuildPhase(
      ["WatchKit.framework", "WatchConnectivity.framework"],
      "PBXFrameworksBuildPhase",
      "Frameworks",
      extTarget.uuid,
    );

    // Resources build phase (empty)
    project.addBuildPhase([], "PBXResourcesBuildPhase", "Resources", extTarget.uuid);

    // Build settings for the extension
    const extBuildConfig = project.pbxXCBuildConfigurationSection();
    Object.keys(extBuildConfig).forEach((key) => {
      const bc = extBuildConfig[key];
      if (
        bc &&
        bc.buildSettings &&
        bc.buildSettings.PRODUCT_NAME === `"${WATCH_TARGET_NAME}"`
      ) {
        bc.buildSettings.SWIFT_VERSION = "5.0";
        bc.buildSettings.WATCHOS_DEPLOYMENT_TARGET = WATCHOS_DEPLOYMENT_TARGET;
        bc.buildSettings.TARGETED_DEVICE_FAMILY = '"4"';
        bc.buildSettings.SDKROOT = "watchos";
        bc.buildSettings.SUPPORTED_PLATFORMS = '"watchos watchsimulator"';
        bc.buildSettings.ALWAYS_SEARCH_USER_PATHS = "NO";
        bc.buildSettings.CODE_SIGN_ENTITLEMENTS = `"${WATCH_TARGET_NAME}/${WATCH_TARGET_NAME}.entitlements"`;
        bc.buildSettings.INFOPLIST_FILE = `"${WATCH_TARGET_NAME}/Info.plist"`;
        bc.buildSettings.LD_RUNPATH_SEARCH_PATHS =
          '"$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks"';
      }
    });

    // ── 2. Add phone bridge sources to the main app target ─────────────────
    const mainTarget = project.getFirstTarget().uuid;
    PHONE_BRIDGE_SOURCES.forEach((file) => {
      project.addFile(`${appName}/${file}`, null, {
        target: mainTarget,
        lastKnownFileType: "sourcecode.swift",
      });
    });

    // ── 3. Add WatchConnectivity.framework to the main app ─────────────────
    const existingFrameworks = project.pbxFrameworksBuildPhaseObj(mainTarget);
    const hasWatchConn =
      existingFrameworks &&
      existingFrameworks.files &&
      existingFrameworks.files.some(
        (f) => f.comment && f.comment.includes("WatchConnectivity"),
      );
    if (!hasWatchConn) {
      project.addFramework("WatchConnectivity.framework", { target: mainTarget });
    }

    // ── 4. Add "Embed Watch Content" copy-files build phase to main app ────
    const copyPhase = project.addBuildPhase(
      [],
      "PBXCopyFilesBuildPhase",
      "Embed Watch Content",
      mainTarget,
      "$(CONTENTS_FOLDER_PATH)/Watch",
    );
    // Reference the Watch Extension product
    if (extTarget && extTarget.pbxNativeTarget) {
      const productRef = extTarget.pbxNativeTarget.productReference;
      if (productRef && copyPhase && copyPhase.buildPhase) {
        const fileRef = { value: productRef, comment: "Embed Watch Content" };
        copyPhase.buildPhase.files = copyPhase.buildPhase.files || [];
        copyPhase.buildPhase.files.push(fileRef);
      }
    }

    return config;
  });
}

/**
 * Step 3 – Add WKCompanionAppBundleIdentifier to the main app's Info.plist
 * (not strictly required for modern watchOS but good practice).
 */
function withWatchInfoPlist(config) {
  return withInfoPlist(config, (config) => {
    config.modResults.WKCompanionAppBundleIdentifier = MAIN_BUNDLE_ID;
    return config;
  });
}

// Compose all three modifiers
module.exports = (config) => {
  config = withWatchFiles(config);
  config = withWatchXcodeTarget(config);
  // withWatchInfoPlist modifies the *main* app plist, skip to avoid confusion
  return config;
};
