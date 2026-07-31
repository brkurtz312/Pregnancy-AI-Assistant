/**
 * withWatchExtension.js
 *
 * Expo config plugin that adds the Pregnancy AI Watch App target to the
 * generated Xcode project during `expo prebuild` / `eas build`.
 *
 * Fixed version: finds build configurations by target UUID (not PRODUCT_NAME)
 * and explicitly sets PRODUCT_BUNDLE_IDENTIFIER so EAS can provision it.
 */

const {
  withXcodeProject,
  withDangerousMod,
} = require("@expo/config-plugins");
const path = require("path");
const fs = require("fs");

const WATCH_TARGET_NAME = "PregnancyWatchApp";
const MAIN_BUNDLE_ID = "app.replit.pregnancycalculator";
const WATCH_BUNDLE_ID = `${MAIN_BUNDLE_ID}.watchapp`;
const DEVELOPMENT_TEAM = "AW7GD9Q3AP";
const WATCHOS_DEPLOYMENT_TARGET = "8.0";

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

// ─── Step 1: copy Swift files into the generated ios/ directory ────────────

function withWatchFiles(config) {
  return withDangerousMod(config, [
    "ios",
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const iosRoot = config.modRequest.platformProjectRoot;
      const sourceDir = path.join(projectRoot, "watchapp");
      const appName = config.modRequest.projectName;

      // Watch Extension target dir
      const watchDir = path.join(iosRoot, WATCH_TARGET_NAME);
      fs.mkdirSync(watchDir, { recursive: true });

      for (const file of WATCH_SWIFT_SOURCES) {
        const src = path.join(sourceDir, file);
        if (fs.existsSync(src)) fs.copyFileSync(src, path.join(watchDir, file));
      }
      // Info.plist + entitlements
      ["Info.plist", "PregnancyWatchApp.entitlements"].forEach((f) => {
        const src = path.join(sourceDir, f);
        if (fs.existsSync(src)) fs.copyFileSync(src, path.join(watchDir, f));
      });

      // Phone bridge files → main app dir
      const mainDir = path.join(iosRoot, appName);
      for (const file of PHONE_BRIDGE_SOURCES) {
        const src = path.join(sourceDir, file);
        if (fs.existsSync(src)) fs.copyFileSync(src, path.join(mainDir, file));
      }

      return config;
    },
  ]);
}

// ─── Step 2: add Watch Extension target to the Xcode project ──────────────

function withWatchXcodeTarget(config) {
  return withXcodeProject(config, (config) => {
    const project = config.modResults;
    const appName = config.modRequest.projectName;

    // Idempotency guard
    const targets = project.pbxNativeTargetSection();
    if (Object.values(targets).some((t) => t && t.name === WATCH_TARGET_NAME)) {
      return config;
    }

    // ── Add the WatchKit Extension target ─────────────────────────────────
    const extTarget = project.addTarget(
      WATCH_TARGET_NAME,
      "watchkit_extension",
      WATCH_TARGET_NAME,
      WATCH_BUNDLE_ID,
    );
    const extUuid = extTarget.uuid;

    // ── Set build settings via target UUID (reliable, not PRODUCT_NAME) ───
    applyWatchBuildSettings(project, extUuid);

    // ── Add build phases ──────────────────────────────────────────────────
    const swiftFiles = WATCH_SWIFT_SOURCES.map(
      (f) => `${WATCH_TARGET_NAME}/${f}`,
    );
    project.addBuildPhase(
      swiftFiles,
      "PBXSourcesBuildPhase",
      "Sources",
      extUuid,
    );
    project.addBuildPhase(
      ["WatchKit.framework", "WatchConnectivity.framework"],
      "PBXFrameworksBuildPhase",
      "Frameworks",
      extUuid,
    );
    project.addBuildPhase([], "PBXResourcesBuildPhase", "Resources", extUuid);

    // ── Phone bridge files → main app target ──────────────────────────────
    const mainTargetUuid = project.getFirstTarget().uuid;
    for (const file of PHONE_BRIDGE_SOURCES) {
      project.addFile(`${appName}/${file}`, null, {
        target: mainTargetUuid,
        lastKnownFileType: "sourcecode.swift",
      });
    }

    // ── Link WatchConnectivity to main app ────────────────────────────────
    const mainFrameworkPhase = project.pbxFrameworksBuildPhaseObj(mainTargetUuid);
    const hasWC =
      mainFrameworkPhase &&
      Array.isArray(mainFrameworkPhase.files) &&
      mainFrameworkPhase.files.some(
        (f) => f.comment && f.comment.includes("WatchConnectivity"),
      );
    if (!hasWC) {
      project.addFramework("WatchConnectivity.framework", {
        target: mainTargetUuid,
      });
    }

    // ── Embed Watch Content copy-files build phase ────────────────────────
    project.addBuildPhase(
      [],
      "PBXCopyFilesBuildPhase",
      "Embed Watch Content",
      mainTargetUuid,
      "$(CONTENTS_FOLDER_PATH)/Watch",
    );

    // Add Watch Extension product to the embed phase
    const productRef =
      extTarget.pbxNativeTarget && extTarget.pbxNativeTarget.productReference;
    if (productRef) {
      const pbxCopy = project.pbxCopyfilesBuildPhaseObj(mainTargetUuid);
      if (pbxCopy) {
        pbxCopy.files = pbxCopy.files || [];
        pbxCopy.files.push({
          value: productRef,
          comment: `${WATCH_TARGET_NAME}.appex in Embed Watch Content`,
        });
      }
    }

    return config;
  });
}

/**
 * Find the build configurations owned by a specific native target UUID
 * and apply all required Watch Extension build settings.
 *
 * Using target UUID is reliable; searching by PRODUCT_NAME is not because
 * newly created targets may not yet have PRODUCT_NAME in buildSettings.
 */
function applyWatchBuildSettings(project, targetUuid) {
  // Get the native target object
  const nativeTargets = project.pbxNativeTargetSection();
  const targetObj = nativeTargets[targetUuid];
  if (!targetObj) return;

  // Get this target's configuration list
  const configListUuid =
    typeof targetObj.buildConfigurationList === "object"
      ? targetObj.buildConfigurationList.value
      : targetObj.buildConfigurationList;

  const configLists = project.pbxXCConfigurationListSection
    ? project.pbxXCConfigurationListSection()
    : project.hash.project.objects.XCConfigurationList;

  const configList = configLists[configListUuid];
  if (!configList) return;

  const buildConfigs = project.pbxXCBuildConfigurationSection
    ? project.pbxXCBuildConfigurationSection()
    : project.hash.project.objects.XCBuildConfiguration;

  // Apply settings to each configuration (Debug, Release, …)
  (configList.buildConfigurations || []).forEach((ref) => {
    const cfgUuid = typeof ref === "object" ? ref.value : ref;
    const cfg = buildConfigs[cfgUuid];
    if (!cfg || !cfg.buildSettings) return;

    Object.assign(cfg.buildSettings, {
      PRODUCT_BUNDLE_IDENTIFIER: WATCH_BUNDLE_ID,
      PRODUCT_NAME: `"${WATCH_TARGET_NAME}"`,
      CODE_SIGN_STYLE: "Automatic",
      DEVELOPMENT_TEAM: DEVELOPMENT_TEAM,
      SWIFT_VERSION: "5.0",
      WATCHOS_DEPLOYMENT_TARGET: WATCHOS_DEPLOYMENT_TARGET,
      TARGETED_DEVICE_FAMILY: '"4"',
      SDKROOT: "watchos",
      SUPPORTED_PLATFORMS: '"watchos watchsimulator"',
      ALWAYS_SEARCH_USER_PATHS: "NO",
      CLANG_ENABLE_MODULES: "YES",
      INFOPLIST_FILE: `"${WATCH_TARGET_NAME}/Info.plist"`,
      CODE_SIGN_ENTITLEMENTS: `"${WATCH_TARGET_NAME}/PregnancyWatchApp.entitlements"`,
      LD_RUNPATH_SEARCH_PATHS:
        '"$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks"',
      SKIP_INSTALL: "YES",
    });
  });
}

// ─── Compose ────────────────────────────────────────────────────────────────

module.exports = (config) => {
  config = withWatchFiles(config);
  config = withWatchXcodeTarget(config);
  return config;
};
