/**
 * withWatchExtension.js
 *
 * Expo config plugin – adds the Pregnancy AI Watch App target.
 *
 * v5 – Xcode 26 / EAS fix:
 *  • Xcode 26 does NOT honor cross-platform PBXTargetDependency (iOS→watchOS).
 *    The Watch target MUST appear in the scheme's BuildActionEntries to be
 *    compiled during an archive build.
 *  • addTarget("watch2_app") auto-creates a PBXTargetDependency we don't want
 *    (Xcode 26 ignores it anyway). Strip it immediately after addTarget().
 *  • ALLOW_TARGET_PLATFORM_SPECIALIZATION = YES must be set on the iOS app
 *    target (not only on the Watch target) to allow Xcode 26 to specialize
 *    the build system for cross-platform dependencies.
 *  • withWatchScheme now ADDS the Watch entry (buildForArchiving=YES) instead
 *    of removing it, and restores buildImplicitDependencies = "YES".
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
      throw e;
    }
  });
}

function _withWatchXcodeTargetInner(config) {
  const project = config.modResults;
  const appName = config.modRequest.projectName;

  console.log("[Watch] projectName:", appName);

  const nativeTargets = project.pbxNativeTargetSection();
  const targetNames = Object.values(nativeTargets)
    .filter(t => t && typeof t === "object" && t.name)
    .map(t => t.name);
  console.log("[Watch] existing target names:", JSON.stringify(targetNames));

  let watchUuid;
  const alreadyPresent = targetNames.some(
    (n) => n === `"${WATCH_TARGET_NAME}"` || n === WATCH_TARGET_NAME
  );

  if (alreadyPresent) {
    console.log("[Watch] target already present — skipping addTarget()");
    // Locate existing UUID so we can still run idempotent fixups below
    watchUuid = Object.keys(nativeTargets).find((key) => {
      if (key.endsWith("_comment")) return false;
      const t = nativeTargets[key];
      return (
        t &&
        typeof t === "object" &&
        (t.name === `"${WATCH_TARGET_NAME}"` || t.name === WATCH_TARGET_NAME)
      );
    });
  } else {
    console.log("[Watch] Adding watch2_app target…");

    // addTarget("watch2_app") automatically:
    //   • Creates the PBXNativeTarget
    //   • Adds "Embed Watch Content" PBXCopyFilesBuildPhase to the FIRST target
    //   • Adds a PBXTargetDependency from the first target → Watch target
    const watchTarget = project.addTarget(
      WATCH_TARGET_NAME,
      "watch2_app",
      WATCH_TARGET_NAME,
      WATCH_BUNDLE_ID,
    );
    watchUuid = watchTarget.uuid;
    console.log(`[Watch] uuid: ${watchUuid}`);

    // Fix: addToPbxNativeTargetSection stores comment as '"PregnancyWatchApp"'
    // (JS string includes the surrounding double-quote chars). Strip them.
    const nts2 = project.pbxNativeTargetSection();
    const commentKey = `${watchUuid}_comment`;
    if (typeof nts2[commentKey] === "string") {
      nts2[commentKey] = nts2[commentKey].replace(/^"|"$/g, "");
      console.log(`[Watch] fixed comment key → ${nts2[commentKey]}`);
    }

    // Same fix for the product file reference comment
    const nativeObj = nts2[watchUuid];
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

    // ── Override build settings ────────────────────────────────────────────
    applyWatchBuildSettings(project, watchUuid);
  }

  if (watchUuid) {
    // Keep the PBXTargetDependency that addTarget() auto-creates.
    // Xcode 26 alone ignores cross-platform deps, BUT the combination of:
    //   (a) Watch in scheme BuildActionEntries (added by withWatchScheme), AND
    //   (b) PBXTargetDependency from iOS app → Watch target
    // compiles the Watch correctly for watchOS. The scheme entry alone
    // (without the dep) causes Xcode 26 to compile the Watch for iphoneos
    // (wrong platform) because -destination 'generic/platform=iOS' overrides
    // SDKROOT. The dep provides the watchOS platform signal.
    //
    // Risk: double-scheduling → "Multiple commands produce". That error
    // appeared in earlier builds WITHOUT ALLOW_TARGET_PLATFORM_SPECIALIZATION
    // on the iOS app target. With that flag set (below), the build system
    // should recognise the dep as the authoritative watchOS trigger and not
    // re-schedule the Watch independently from the scheme entry.
    //
    // NOTE: if "Multiple commands produce" reappears, the next step is to
    // set buildForArchiving = "NO" on the scheme entry (dep-only scheduling)
    // while keeping the Watch listed so the build system can resolve its
    // platform.

    // Ensure PBXTargetDependency exists from iOS app → Watch target.
    // addTarget() creates it on first run, but if the target already exists
    // (alreadyPresent=true) addTarget() is skipped so the dep may be absent.
    // This call is idempotent — skips if dep is already wired. Always run.
    ensureWatchTargetDependency(project, watchUuid);

    // Add ALLOW_TARGET_PLATFORM_SPECIALIZATION = YES to the iOS app target's
    // build configurations. This tells Xcode 26 it may build dependencies for
    // a different platform (watchOS) when archiving. Always run — idempotent.
    applyAllowPlatformSpecializationToMainApp(project);
  }

  // NOTE: Phone bridge Swift files (PhoneWatchBridge, WatchConnectivityModule)
  // are copied to the main app directory by withWatchFiles but are NOT added
  // to the Xcode project here — project.addFile() with null group crashes the
  // xcode library and silently unwinds the whole modifier. Wire them manually
  // once the Watch bundle is confirmed working.

  return config;
}

/**
 * Adds PBXContainerItemProxy + PBXTargetDependency from the main iOS app
 * target to the Watch app target. Idempotent — skips if already present.
 *
 * Must be called unconditionally (even when the Watch target already exists)
 * because addTarget() is skipped on subsequent prebuild runs.
 */
function ensureWatchTargetDependency(project, watchTargetUuid) {
  const nts = project.pbxNativeTargetSection();
  const objects = project.hash.project.objects;

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
    console.warn("[Watch] ensureWatchTargetDependency: main app target not found");
    return;
  }

  const mainTarget = nts[mainTargetUuid];
  if (!mainTarget.dependencies) mainTarget.dependencies = [];

  // Idempotency: check if dep already exists
  const depSection = objects["PBXTargetDependency"] || {};
  for (const dep of mainTarget.dependencies) {
    const depUuid = typeof dep === "object" ? dep.value : dep;
    const depObj = depSection[depUuid];
    if (!depObj) continue;
    const remote = typeof depObj.target === "object" ? depObj.target.value : depObj.target;
    if (remote === watchTargetUuid) {
      console.log("[Watch] PBXTargetDependency already present — skipping");
      return;
    }
  }

  const projectSection = objects["PBXProject"] || {};
  const projectRootUuid = Object.keys(projectSection).find(k => !k.endsWith("_comment"));

  const proxyUuid = project.generateUuid();
  const depUuid = project.generateUuid();

  if (!objects["PBXContainerItemProxy"]) objects["PBXContainerItemProxy"] = {};
  objects["PBXContainerItemProxy"][proxyUuid] = {
    isa: "PBXContainerItemProxy",
    containerPortal: projectRootUuid,
    proxyType: 1,
    remoteGlobalIDString: watchTargetUuid,
    remoteInfo: WATCH_TARGET_NAME,
  };
  objects["PBXContainerItemProxy"][`${proxyUuid}_comment`] = "PBXContainerItemProxy";

  if (!objects["PBXTargetDependency"]) objects["PBXTargetDependency"] = {};
  objects["PBXTargetDependency"][depUuid] = {
    isa: "PBXTargetDependency",
    target: watchTargetUuid,
    targetProxy: proxyUuid,
  };
  objects["PBXTargetDependency"][`${depUuid}_comment`] = "PBXTargetDependency";

  mainTarget.dependencies.push({ value: depUuid, comment: "PBXTargetDependency" });
  console.log(`[Watch] Added PBXTargetDependency (${depUuid}): ${mainTargetUuid} → ${watchTargetUuid}`);
}

/**
 * Removes any PBXTargetDependency (and its PBXContainerItemProxy) wired from
 * the main iOS app target to the Watch target. Kept for reference; not called.
 */
function removeWatchTargetDependency(project, watchTargetUuid) {
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
    console.warn("[Watch] removeWatchTargetDependency: main app target not found");
    return;
  }

  const mainTarget = nts[mainTargetUuid];
  if (!mainTarget.dependencies || !mainTarget.dependencies.length) {
    console.log("[Watch] No dependencies on main target — nothing to remove");
    return;
  }

  const depSection = objects["PBXTargetDependency"] || {};
  const proxySection = objects["PBXContainerItemProxy"] || {};
  const toRemove = [];

  for (const dep of mainTarget.dependencies) {
    const depUuid = typeof dep === "object" ? dep.value : dep;
    const depObj = depSection[depUuid];
    if (!depObj) continue;
    const remoteUuid =
      typeof depObj.target === "object" ? depObj.target.value : depObj.target;
    if (remoteUuid === watchTargetUuid) {
      toRemove.push(depUuid);
      // Also remove the proxy object
      const proxyUuid =
        typeof depObj.targetProxy === "object"
          ? depObj.targetProxy.value
          : depObj.targetProxy;
      if (proxyUuid) {
        delete proxySection[proxyUuid];
        delete proxySection[`${proxyUuid}_comment`];
        console.log(`[Watch] Removed PBXContainerItemProxy ${proxyUuid}`);
      }
      delete depSection[depUuid];
      delete depSection[`${depUuid}_comment`];
    }
  }

  if (toRemove.length > 0) {
    mainTarget.dependencies = mainTarget.dependencies.filter((dep) => {
      const depUuid = typeof dep === "object" ? dep.value : dep;
      return !toRemove.includes(depUuid);
    });
    console.log(
      `[Watch] Removed ${toRemove.length} PBXTargetDependency entry(ies) → main app is clean`,
    );
  } else {
    console.log("[Watch] PBXTargetDependency already absent — nothing to strip");
  }
}

/**
 * Sets ALLOW_TARGET_PLATFORM_SPECIALIZATION = YES on the main iOS app target's
 * build configurations (Debug + Release). Idempotent.
 *
 * Reason: Xcode 26 requires this on the HOST target to permit the build system
 * to specialize platform for dependencies. Without it, cross-platform deps
 * (watchOS companion) are silently skipped even when listed in the scheme.
 */
function applyAllowPlatformSpecializationToMainApp(project) {
  const nts = project.pbxNativeTargetSection();
  const objects = project.hash.project.objects;

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
  if (!mainTargetUuid) return;

  const mainTarget = nts[mainTargetUuid];
  const configListUuidRaw = mainTarget.buildConfigurationList;
  const configListUuid =
    typeof configListUuidRaw === "object"
      ? configListUuidRaw.value
      : configListUuidRaw;

  const configList = (objects.XCConfigurationList || {})[configListUuid];
  if (!configList) return;

  const buildConfigs = objects.XCBuildConfiguration || {};
  (configList.buildConfigurations || []).forEach((ref) => {
    const cfgUuid = typeof ref === "object" ? ref.value : ref;
    const cfg = buildConfigs[cfgUuid];
    if (!cfg || !cfg.buildSettings) return;
    if (cfg.buildSettings.ALLOW_TARGET_PLATFORM_SPECIALIZATION !== "YES") {
      cfg.buildSettings.ALLOW_TARGET_PLATFORM_SPECIALIZATION = "YES";
      console.log(
        `[Watch] Set ALLOW_TARGET_PLATFORM_SPECIALIZATION=YES on main app config ${cfgUuid} (${cfg.name})`,
      );
    }
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

    Object.assign(cfg.buildSettings, {
      INFOPLIST_FILE: `"${WATCH_TARGET_NAME}/Info.plist"`,
      CODE_SIGN_ENTITLEMENTS: `"${WATCH_TARGET_NAME}/PregnancyWatchApp.entitlements"`,
      SDKROOT: "watchos",
      WATCHOS_DEPLOYMENT_TARGET: WATCHOS_DEPLOYMENT_TARGET,
      TARGETED_DEVICE_FAMILY: '"4"',
      SUPPORTED_PLATFORMS: '"watchos watchsimulator"',
      CODE_SIGN_STYLE: "Automatic",
      DEVELOPMENT_TEAM: DEVELOPMENT_TEAM,
      SWIFT_VERSION: "5.0",
      LD_RUNPATH_SEARCH_PATHS:
        '"$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks"',
      SKIP_INSTALL: "YES",
      ALWAYS_SEARCH_USER_PATHS: "NO",
      CLANG_ENABLE_MODULES: "YES",
      // Belt-and-suspenders: also set on Watch target itself
      ALLOW_TARGET_PLATFORM_SPECIALIZATION: "YES",
    });
    console.log(`[Watch] patched buildSettings for config ${cfgUuid}`);
  });
}

// ─── Step 3: Xcode scheme — ensure Watch target IS in BuildActionEntries ──────
//
// Xcode 26's new build system does NOT honor cross-platform PBXTargetDependency
// (iOS→watchOS). The only reliable way to schedule the Watch target during an
// archive build is to list it in the scheme's BuildActionEntries with
// buildForArchiving = "YES".
//
// This modifier uses withXcodeProject (not withDangerousMod) so it can read the
// Watch target UUID from the project object, then writes the scheme file directly.

function withWatchScheme(config) {
  return withXcodeProject(config, (config) => {
    try {
      const project = config.modResults;
      const iosRoot = config.modRequest.platformProjectRoot;
      const projectName = config.modRequest.projectName;

      // Find Watch target UUID
      const nts = project.pbxNativeTargetSection();
      const watchTargetUuid = Object.keys(nts).find((key) => {
        if (key.endsWith("_comment")) return false;
        const t = nts[key];
        return (
          t &&
          typeof t === "object" &&
          (t.name === WATCH_TARGET_NAME || t.name === `"${WATCH_TARGET_NAME}"`)
        );
      });

      if (!watchTargetUuid) {
        console.warn("[Watch/Scheme] Watch target not found in project — skipping scheme update");
        return config;
      }
      console.log(`[Watch/Scheme] Watch target UUID: ${watchTargetUuid}`);

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

      // 1. Restore buildImplicitDependencies = "YES" if a previous plugin run
      //    set it to "NO".
      schemeXml = schemeXml.replace(
        /buildImplicitDependencies\s*=\s*"NO"/g,
        'buildImplicitDependencies = "YES"',
      );

      // 2. Strip any existing Watch BuildActionEntry (idempotency — prevents
      //    duplicates on repeated prebuild runs).
      const watchEntryRegex =
        /[ \t]*<BuildActionEntry[^>]*>[\s\S]*?<BuildableReference[^>]*>[\s\S]*?BlueprintName\s*=\s*"PregnancyWatchApp"[\s\S]*?<\/BuildableReference>[\s\S]*?<\/BuildActionEntry>\n?/g;
      const before = schemeXml;
      schemeXml = schemeXml.replace(watchEntryRegex, "");
      if (schemeXml !== before) {
        console.log("[Watch/Scheme] Removed stale Watch BuildActionEntry");
      }

      // 3. Inject a fresh Watch entry immediately before </BuildActionEntries>.
      //    buildForArchiving = YES ensures it compiles during `xcodebuild archive`.
      //    All other flags are NO — no simulator runs, no tests, no profiling.
      const watchEntry =
        `         <BuildActionEntry\n` +
        `            buildForTesting = "NO"\n` +
        `            buildForRunning = "NO"\n` +
        `            buildForProfiling = "NO"\n` +
        `            buildForArchiving = "YES"\n` +
        `            buildForAnalyzing = "NO">\n` +
        `            <BuildableReference\n` +
        `               BuildableIdentifier = "primary"\n` +
        `               BlueprintIdentifier = "${watchTargetUuid}"\n` +
        `               BuildableName = "${WATCH_TARGET_NAME}.app"\n` +
        `               BlueprintName = "${WATCH_TARGET_NAME}"\n` +
        `               ReferencedContainer = "container:${projectName}.xcodeproj">\n` +
        `            </BuildableReference>\n` +
        `         </BuildActionEntry>\n`;

      if (!schemeXml.includes("</BuildActionEntries>")) {
        console.warn("[Watch/Scheme] </BuildActionEntries> marker not found — scheme may be malformed");
        return config;
      }

      schemeXml = schemeXml.replace(
        "</BuildActionEntries>",
        `${watchEntry}      </BuildActionEntries>`,
      );

      fs.writeFileSync(schemePath, schemeXml, "utf8");
      console.log(
        `[Watch/Scheme] Added Watch BuildActionEntry (UUID: ${watchTargetUuid}, buildForArchiving=YES)`,
      );
    } catch (e) {
      console.error("[Watch/Scheme] ERROR:", e && e.message);
      console.error("[Watch/Scheme] Stack:", e && e.stack);
      throw e;
    }
    return config;
  });
}

// ─── Export ───────────────────────────────────────────────────────────────────

// Export order matters: Expo processes withXcodeProject mods LIFO (last applied
// runs first). withWatchXcodeTarget must run BEFORE withWatchScheme because the
// scheme step needs the Watch target UUID that withWatchXcodeTarget creates.
// Therefore withWatchXcodeTarget is applied LAST so it executes FIRST.
module.exports = (config) => {
  config = withWatchFiles(config);
  config = withWatchScheme(config);     // applied second → executes second (LIFO)
  config = withWatchXcodeTarget(config); // applied last  → executes first  (LIFO)
  return config;
};
