/**
 * withWatchExtension.js
 *
 * Expo config plugin – adds the Pregnancy AI Watch App target.
 *
 * v4 – correct architecture:
 *  • Uses "watch2_app" → com.apple.product-type.application.watchapp2
 *    (xcode lib automatically creates "Embed Watch Content" phase on main target)
 *  • Does NOT manually add an embed phase – that duplicated/corrupted it
 *  • Overrides INFOPLIST_FILE (lib defaults to "<Name>-Info.plist", ours is "Info.plist")
 *  • Sets SKIP_INSTALL YES (correct for an embedded Watch app, lib default)
 *  • Adds Sources / Frameworks / Resources build phases with actual Swift files
 *  • Adds WatchConnectivity to the main app
 */

const { withXcodeProject, withDangerousMod } = require("@expo/config-plugins");
const path = require("path");
const fs = require("fs");

const WATCH_TARGET_NAME = "PregnancyWatchApp";
const MAIN_BUNDLE_ID = "app.replit.pregnancycalculator";
const WATCH_BUNDLE_ID = `${MAIN_BUNDLE_ID}.watchapp`;
const DEVELOPMENT_TEAM = "AW7GD9Q3AP";
const WATCHOS_DEPLOYMENT_TARGET = "9.0";

const WATCH_SWIFT_SOURCES = [
  "PregnancyWatchApp.swift",
  "ContentView.swift",
  "KickCounterView.swift",
  "ContractionTimerView.swift",
  "TipsView.swift",
  "WatchSessionManager.swift",
  "Models.swift",
];

const PHONE_BRIDGE_SOURCES = [
  "PhoneWatchBridge.swift",
  "WatchConnectivityModule.swift",
];

// ─── Step 1: copy source files ────────────────────────────────────────────────

function withWatchFiles(config) {
  return withDangerousMod(config, [
    "ios",
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const iosRoot = config.modRequest.platformProjectRoot;
      const sourceDir = path.join(projectRoot, "watchapp");
      const appName = config.modRequest.projectName;

      const watchDir = path.join(iosRoot, WATCH_TARGET_NAME);
      fs.mkdirSync(watchDir, { recursive: true });

      for (const file of WATCH_SWIFT_SOURCES) {
        const src = path.join(sourceDir, file);
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, path.join(watchDir, file));
          console.log(`[Watch] copied ${file}`);
        } else {
          console.warn(`[Watch] NOT FOUND: ${src}`);
        }
      }

      for (const file of ["Info.plist", "PregnancyWatchApp.entitlements"]) {
        const src = path.join(sourceDir, file);
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, path.join(watchDir, file));
          console.log(`[Watch] copied ${file}`);
        }
      }

      const mainDir = path.join(iosRoot, appName);
      for (const file of PHONE_BRIDGE_SOURCES) {
        const src = path.join(sourceDir, file);
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, path.join(mainDir, file));
          console.log(`[Watch] copied ${file} → main`);
        }
      }

      return config;
    },
  ]);
}

// ─── Step 2: Xcode project manipulation ──────────────────────────────────────

function withWatchXcodeTarget(config) {
  return withXcodeProject(config, (config) => {
    const project = config.modResults;
    const appName = config.modRequest.projectName;

    // Idempotency
    const nativeTargets = project.pbxNativeTargetSection();
    if (
      Object.values(nativeTargets).some((t) => t && t.name === `"${WATCH_TARGET_NAME}"`)
    ) {
      console.log("[Watch] target already present, skipping");
      return config;
    }

    console.log("[Watch] Adding watch2_app target…");

    // addTarget("watch2_app") automatically:
    //   • Creates the PBXNativeTarget
    //   • Adds "Embed Watch Content" PBXCopyFilesBuildPhase to the FIRST target
    //   • Adds a target dependency from first target → this target
    const watchTarget = project.addTarget(
      WATCH_TARGET_NAME,
      "watch2_app",
      WATCH_TARGET_NAME,
      WATCH_BUNDLE_ID,
    );
    const watchUuid = watchTarget.uuid;
    console.log(`[Watch] uuid: ${watchUuid}`);

    // ── Build phases on the Watch target ──────────────────────────────────
    const swiftFiles = WATCH_SWIFT_SOURCES.map(
      (f) => `${WATCH_TARGET_NAME}/${f}`,
    );
    project.addBuildPhase(
      swiftFiles,
      "PBXSourcesBuildPhase",
      "Sources",
      watchUuid,
    );
    project.addBuildPhase(
      ["WatchKit.framework", "WatchConnectivity.framework"],
      "PBXFrameworksBuildPhase",
      "Frameworks",
      watchUuid,
    );
    project.addBuildPhase([], "PBXResourcesBuildPhase", "Resources", watchUuid);

    // ── Override build settings (addTarget sets some defaults we need to fix) ─
    applyWatchBuildSettings(project, watchUuid);

    // ── Phone bridge → main target ────────────────────────────────────────
    const mainTargetUuid = project.getFirstTarget().uuid;
    for (const file of PHONE_BRIDGE_SOURCES) {
      project.addFile(`${appName}/${file}`, null, {
        target: mainTargetUuid,
        lastKnownFileType: "sourcecode.swift",
      });
    }

    // ── WatchConnectivity on main app ─────────────────────────────────────
    const mainFrameworks = project.pbxFrameworksBuildPhaseObj(mainTargetUuid);
    const hasWC =
      mainFrameworks &&
      Array.isArray(mainFrameworks.files) &&
      mainFrameworks.files.some(
        (f) => f.comment && f.comment.includes("WatchConnectivity"),
      );
    if (!hasWC) {
      project.addFramework("WatchConnectivity.framework", {
        target: mainTargetUuid,
      });
    }

    return config;
  });
}

/**
 * Override build settings added by the xcode library's addTarget() defaults.
 *
 * addTarget() pre-populates Debug + Release with:
 *   INFOPLIST_FILE = "PregnancyWatchApp/PregnancyWatchApp-Info.plist"  ← WRONG
 *   SKIP_INSTALL   = YES                                               ← correct
 *   PRODUCT_NAME   = "PregnancyWatchApp"                              ← correct
 *   PRODUCT_BUNDLE_IDENTIFIER = "<bundleId>"                          ← correct
 *
 * We need to fix INFOPLIST_FILE and add watchOS-specific keys.
 */
function applyWatchBuildSettings(project, targetUuid) {
  const nativeTargets = project.pbxNativeTargetSection();
  const targetObj = nativeTargets[targetUuid];
  if (!targetObj) return;

  const configListUuidRaw = targetObj.buildConfigurationList;
  const configListUuid =
    typeof configListUuidRaw === "object"
      ? configListUuidRaw.value
      : configListUuidRaw;

  const objects = project.hash.project.objects;

  // XCConfigurationList lives under objects.XCConfigurationList
  const configList = (objects.XCConfigurationList || {})[configListUuid];
  if (!configList) {
    console.warn(`[Watch] no XCConfigurationList for ${configListUuid}`);
    return;
  }

  const buildConfigs = objects.XCBuildConfiguration || {};

  (configList.buildConfigurations || []).forEach((ref) => {
    const cfgUuid = typeof ref === "object" ? ref.value : ref;
    const cfg = buildConfigs[cfgUuid];
    if (!cfg || !cfg.buildSettings) return;

    // Merge – existing keys set by addTarget() are left unless we override
    Object.assign(cfg.buildSettings, {
      // Fix the plist path (lib generated "<Name>-Info.plist", ours is "Info.plist")
      INFOPLIST_FILE: `"${WATCH_TARGET_NAME}/Info.plist"`,
      CODE_SIGN_ENTITLEMENTS: `"${WATCH_TARGET_NAME}/PregnancyWatchApp.entitlements"`,
      // watchOS target identity
      SDKROOT: "watchos",
      WATCHOS_DEPLOYMENT_TARGET: WATCHOS_DEPLOYMENT_TARGET,
      TARGETED_DEVICE_FAMILY: '"4"',
      SUPPORTED_PLATFORMS: '"watchos watchsimulator"',
      // Signing
      CODE_SIGN_STYLE: "Automatic",
      DEVELOPMENT_TEAM: DEVELOPMENT_TEAM,
      // Swift
      SWIFT_VERSION: "5.0",
      // Runtime paths
      LD_RUNPATH_SEARCH_PATHS:
        '"$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks"',
      // Keep SKIP_INSTALL YES (embedded via "Embed Watch Content" phase)
      SKIP_INSTALL: "YES",
      ALWAYS_SEARCH_USER_PATHS: "NO",
      CLANG_ENABLE_MODULES: "YES",
    });
    console.log(`[Watch] patched buildSettings for config ${cfgUuid}`);
  });
}

// ─── Export ───────────────────────────────────────────────────────────────────

module.exports = (config) => {
  config = withWatchFiles(config);
  config = withWatchXcodeTarget(config);
  return config;
};
