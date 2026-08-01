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
    try {
      return _withWatchXcodeTargetInner(config);
    } catch (e) {
      console.error("[Watch] FATAL ERROR in withWatchXcodeTarget:", e && e.message);
      console.error("[Watch] Stack:", e && e.stack);
      throw e; // re-throw so EAS knows the plugin failed
    }
  });
}

function _withWatchXcodeTargetInner(config) {
    const project = config.modResults;
    const appName = config.modRequest.projectName;

    console.log("[Watch] projectName:", appName);

    // Idempotency
    const nativeTargets = project.pbxNativeTargetSection();
    const targetNames = Object.values(nativeTargets)
      .filter(t => t && typeof t === "object" && t.name)
      .map(t => t.name);
    console.log("[Watch] existing target names:", JSON.stringify(targetNames));

    if (
      targetNames.some((n) => n === `"${WATCH_TARGET_NAME}"` || n === WATCH_TARGET_NAME)
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

    // Fix: addToPbxNativeTargetSection stores comment as '"PregnancyWatchApp"'
    // (JS string includes the surrounding double-quote chars). EAS searches by
    // comment without quotes → "Could not find target". Strip them here.
    const nts = project.pbxNativeTargetSection();
    const commentKey = `${watchUuid}_comment`;
    if (typeof nts[commentKey] === "string") {
      nts[commentKey] = nts[commentKey].replace(/^"|"$/g, "");
      console.log(`[Watch] fixed comment key → ${nts[commentKey]}`);
    }

    // Same fix for the product file reference comment
    const nativeObj = nts[watchUuid];
    if (nativeObj) {
      const prodRefUuid =
        typeof nativeObj.productReference === "object"
          ? nativeObj.productReference.value
          : nativeObj.productReference;
      if (prodRefUuid) {
        const frs = project.pbxFileReferenceSection();
        const frComment = `${prodRefUuid}_comment`;
        if (typeof frs[frComment] === "string") {
          frs[frComment] = frs[frComment].replace(/^"|"$/g, "");
          console.log(`[Watch] fixed product ref comment → ${frs[frComment]}`);
        }
      }
    }

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

    // NOTE: Phone bridge Swift files (PhoneWatchBridge, WatchConnectivityModule)
    // are copied to the main app directory by withWatchFiles but are NOT added
    // to the Xcode project here — project.addFile() with null group crashes the
    // xcode library and silently unwinds the whole modifier, leaving no Watch
    // target in the pbxproj. Wire them in via a separate config plugin or
    // manually once the Watch bundle is confirmed working.

    // NOTE: Do NOT add an explicit PBXTargetDependency from the iOS main app
    // to the watchOS Watch app. The "Embed Watch Content" build phase already
    // references BUILT_PRODUCTS_DIR/PregnancyWatchApp.app, which the Xcode
    // build system treats as a build-phase-level implicit dependency — it
    // automatically schedules the Watch target to build before the embed phase
    // runs. Adding an explicit PBXTargetDependency on top of this causes Xcode
    // to schedule the Watch build TWICE (once via dep, once via embed phase),
    // producing "Multiple commands produce" / CreateUniversalBinary
    // duplicate-output errors.

    return config;
}

/**
 * Adds PBXContainerItemProxy + PBXTargetDependency from the main app target
 * to the Watch app target. Idempotent — skips if already present.
 */
function ensureWatchTargetDependency(project, watchTargetUuid) {
  const nts = project.pbxNativeTargetSection();
  const objects = project.hash.project.objects;

  // Find the main iOS app target
  const mainTargetUuid = Object.keys(nts).find((key) => {
    if (key.endsWith("_comment")) return false;
    const t = nts[key];
    return (
      t &&
      typeof t === "object" &&
      (t.productType === '"com.apple.product-type.application"' ||
        t.productType === "com.apple.product-type.application")
    );
  });
  if (!mainTargetUuid) {
    console.warn("[Watch] Could not find main app target for dependency wiring");
    return;
  }

  const mainTarget = nts[mainTargetUuid];
  if (!mainTarget.dependencies) mainTarget.dependencies = [];

  // Check idempotency: scan existing target dependencies
  const depSection = objects["PBXTargetDependency"] || {};
  for (const dep of mainTarget.dependencies) {
    const depUuid = typeof dep === "object" ? dep.value : dep;
    const depObj = depSection[depUuid];
    if (!depObj) continue;
    const remoteUuid =
      typeof depObj.target === "object" ? depObj.target.value : depObj.target;
    if (remoteUuid === watchTargetUuid) {
      console.log("[Watch] PBXTargetDependency already present — skipping");
      return;
    }
  }

  // Find the project root UUID (containerPortal)
  const projectSection = objects["PBXProject"] || {};
  const projectRootUuid = Object.keys(projectSection).find(
    (k) => !k.endsWith("_comment"),
  );

  // Generate UUIDs for proxy and dependency
  const proxyUuid = project.generateUuid();
  const depUuid = project.generateUuid();

  // Add PBXContainerItemProxy
  if (!objects["PBXContainerItemProxy"]) objects["PBXContainerItemProxy"] = {};
  objects["PBXContainerItemProxy"][proxyUuid] = {
    isa: "PBXContainerItemProxy",
    containerPortal: projectRootUuid,
    proxyType: 1,
    remoteGlobalIDString: watchTargetUuid,
    remoteInfo: WATCH_TARGET_NAME,
  };
  objects["PBXContainerItemProxy"][`${proxyUuid}_comment`] =
    "PBXContainerItemProxy";

  // Add PBXTargetDependency
  if (!objects["PBXTargetDependency"]) objects["PBXTargetDependency"] = {};
  objects["PBXTargetDependency"][depUuid] = {
    isa: "PBXTargetDependency",
    target: watchTargetUuid,
    targetProxy: proxyUuid,
  };
  objects["PBXTargetDependency"][`${depUuid}_comment`] = "PBXTargetDependency";

  // Wire into the main app's dependencies array
  mainTarget.dependencies.push({
    value: depUuid,
    comment: "PBXTargetDependency",
  });

  console.log(
    `[Watch] Added PBXTargetDependency (${depUuid}): ${mainTargetUuid} → ${watchTargetUuid}`,
  );
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

// ─── Step 3: Xcode scheme — ensure Watch target is NOT in BuildActionEntries ──
//
// The PBXTargetDependency (added in Step 2 via ensureWatchTargetDependency) is
// sufficient for Xcode 16+'s build system to schedule the Watch target. Adding
// the Watch target ALSO to BuildActionEntries in the scheme causes Xcode to
// schedule it TWICE — once as a direct buildable and once as a dependency —
// which produces "Multiple commands produce" duplicate-output errors during
// CreateUniversalBinary. This step removes any Watch BuildActionEntry if present.

function withWatchScheme(config) {
  return withDangerousMod(config, [
    "ios",
    async (config) => {
      try {
        const iosRoot = config.modRequest.platformProjectRoot;
        const projectName = config.modRequest.projectName;

        const schemePath = path.join(
          iosRoot,
          `${projectName}.xcodeproj`,
          "xcshareddata",
          "xcschemes",
          `${projectName}.xcscheme`,
        );

        if (!fs.existsSync(schemePath)) {
          console.warn(`[Watch/Scheme] Scheme not found at ${schemePath}`);
          return config;
        }

        let schemeXml = fs.readFileSync(schemePath, "utf8");

        // Disable implicit dependencies so xcodebuild doesn't schedule the
        // Watch target a second time via the "Embed Watch Content" phase's
        // BUILT_PRODUCTS_DIR file reference. The explicit PBXTargetDependency
        // (added in withWatchXcodeTarget) is the single authoritative trigger.
        schemeXml = schemeXml.replace(
          /buildImplicitDependencies\s*=\s*"YES"/g,
          'buildImplicitDependencies = "NO"',
        );

        // Remove any Watch BuildActionEntry from the scheme.
        // PBXTargetDependency in the pbxproj is sufficient for Xcode 16+'s
        // build system. Having the Watch target in BOTH the scheme's
        // BuildActionEntries AND as a PBXTargetDependency causes Xcode to
        // schedule it twice → "Multiple commands produce" duplicate-output
        // error during CreateUniversalBinary.
        const watchEntryRegex =
          /\s*<BuildActionEntry[^>]*>[\s\S]*?<BuildableReference[^>]*>[\s\S]*?BlueprintName\s*=\s*"PregnancyWatchApp"[\s\S]*?<\/BuildableReference>\s*<\/BuildActionEntry>/g;

        if (watchEntryRegex.test(schemeXml)) {
          schemeXml = schemeXml.replace(watchEntryRegex, "");
          fs.writeFileSync(schemePath, schemeXml, "utf8");
          console.log("[Watch/Scheme] Removed Watch BuildActionEntry from scheme");
        } else {
          console.log("[Watch/Scheme] Watch entry not in scheme — nothing to remove");
        }
      } catch (e) {
        console.error("[Watch/Scheme] ERROR:", e && e.message);
        console.error("[Watch/Scheme] Stack:", e && e.stack);
        throw e;
      }
      return config;
    },
  ]);
}

// ─── Export ───────────────────────────────────────────────────────────────────

module.exports = (config) => {
  config = withWatchFiles(config);
  config = withWatchXcodeTarget(config);
  config = withWatchScheme(config);
  return config;
};
