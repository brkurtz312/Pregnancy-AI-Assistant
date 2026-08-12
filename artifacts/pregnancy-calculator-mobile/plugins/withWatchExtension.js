/**
 * withWatchExtension.js
 *
 * Expo config plugin – adds the Pregnancy AI Watch App target.
 *
 * v6 – Xcode 26 / EAS final approach:
 *
 * History of scheduling combinations tried (all with ATPS=YES on iOS app):
 *   Dep only                 → Watch NOT compiled (Xcode 26 ignores cross-platform deps entirely)
 *   Scheme only              → Watch compiles for watchos ✓ but "Embed Watch Content" copy phase
 *                              looks in Release-iphoneos/ → lstat ENOENT at archive time
 *   Scheme + dep             → Watch compiles for watchos ✓ but scheduled TWICE (dep + scheme)
 *                              → "Multiple commands produce"
 *   Scheme only, strip dep,  → Still double-schedules because addTarget("watch2_app") ALSO
 *   but call ensureWatchDep    auto-adds to scheme — two triggers: manual scheme + auto-scheme
 *
 * Final design:
 *   1. Scheme entry ONLY (no PBXTargetDependency):
 *      - addTarget auto-injects Watch into scheme; we keep it
 *      - removeWatchTargetDependency strips the auto-created dep unconditionally
 *      - Watch is placed FIRST in BuildActionEntries so it builds before iOS app
 *   2. "Embed Watch Content" PBXCopyFilesBuildPhase is REMOVED (it hardcodes
 *      Release-iphoneos/ which the Watch never occupies)
 *   3. A PBXShellScriptBuildPhase on the iOS app does the actual embed:
 *      - Locates PregnancyWatchApp.app in OBJROOT/UninstalledProducts/watchos/
 *        (where SKIP_INSTALL=YES targets land during archive)
 *      - Copies it into $(BUILT_PRODUCTS_DIR)/$(WRAPPER_NAME)/Watch/
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
  "KickSessionRestorePolicy.swift",
  "ContractionTimerView.swift",
  "TipsView.swift",
  "WatchSessionManager.swift",
  "WatchSessionPersistence.swift",
  "Models.swift",
];

// ─── Watch unit-test target ──────────────────────────────────────────────────
// A watchOS unit-test bundle that compiles the XCTest suites from watchapp/
// together with the non-UI production sources they exercise. Runs via:
//   xcodebuild test -scheme <app> -destination 'platform=watchOS Simulator,…'
const WATCH_TEST_TARGET_NAME = "PregnancyWatchAppTests";

// XCTest suites copied from watchapp/ into the test target.
const WATCH_TEST_SOURCES = [
  "ContractionTimerTests.swift",
  "PhoneWatchBridgeCallbackTests.swift",
  "KickCounterTimerTests.swift",
  "TipsViewEmptyStateTests.swift",
  "WatchContractionRetryQueueTests.swift",
  "WatchOfflineDeliveryTests.swift",
  "WatchPhoneForceQuitDeliveryTests.swift",
  "WatchSessionManagerContractionCountTests.swift",
  "WatchSessionManagerKickCountTests.swift",
  "WatchSessionManagerClearSessionTests.swift",
  "WatchFreshInstallSyncTests.swift",
];

// Production (non-UI) sources compiled INTO the test bundle so the tests can
// exercise the real implementations (WatchSessionManager.clearPersistedSession,
// WatchSessionPersistence.allKeys, Models types) without a TEST_HOST.
const WATCH_TEST_PRODUCTION_SOURCES = [
  "Models.swift",
  "WatchSessionPersistence.swift",
  "WatchSessionManager.swift",
  "KickSessionRestorePolicy.swift",
];

// Standalone icon PNGs copied directly into the Watch bundle root.
// Required for Apple's ITMS-90391 validator which checks CFBundleIconFiles
// for actual PNG files in the bundle — it does not inspect Assets.car.
// Sizes cover all watchOS icon slots (notificationCenter, appLauncher,
// quickLook, companionSettings, and watch-marketing).
const WATCH_ICON_FILES = [
  "AppIcon-58.png",   // 29pt @2x  — Companion Settings
  "AppIcon-80.png",   // 40pt @2x  — Home 38mm
  "AppIcon-87.png",   // 29pt @3x  — Companion Settings @3x
  "AppIcon-88.png",   // 44pt @2x  — Home 40mm
  "AppIcon-100.png",  // 50pt @2x  — Home 44mm
  "AppIcon-102.png",  // 51pt @2x  — Home 45mm
  "AppIcon-108.png",  // 54pt @2x  — Home 49mm (Ultra)
  "AppIcon-172.png",  // 86pt @2x  — QuickLook 38mm
  "AppIcon-196.png",  // 98pt @2x  — QuickLook 42mm
  "AppIcon-216.png",  // 108pt @2x — QuickLook 44/45mm
  "AppIcon-234.png",  // 117pt @2x — QuickLook 49mm (Ultra)
  "AppIcon-1024.png", // 1024pt @1x — App Store marketing
];

const PHONE_BRIDGE_SOURCES = [
  "PhoneWatchBridge.swift",
  "PhoneWatchMessageDispatcher.swift",
  "WatchConnectivityModule.swift",
];

// Phone-side production sources ALSO compiled into the PregnancyWatchAppTests
// bundle so the tests exercise the real dispatch logic (they live in the
// iPhone app directory, unlike WATCH_TEST_PRODUCTION_SOURCES).
// PhoneWatchBridge.swift itself cannot join them — it implements iOS-only
// WCSessionDelegate requirements that don't compile against the watchOS SDK.
const PHONE_TEST_PRODUCTION_SOURCES = [
  "PhoneWatchMessageDispatcher.swift",
];
// Directory (Xcode group path) of the iPhone app sources referenced by
// PHONE_TEST_PRODUCTION_SOURCES. Matches config.modRequest.projectName.
const PHONE_APP_DIR = "PregnancyAIAssistant";

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

      // Copy standalone icon PNGs (required for CFBundleIconFiles / ITMS-90391).
      for (const iconFile of WATCH_ICON_FILES) {
        const src = path.join(sourceDir, iconFile);
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, path.join(watchDir, iconFile));
          console.log(`[Watch] copied ${iconFile}`);
        } else {
          console.warn(`[Watch] icon NOT FOUND: ${src}`);
        }
      }

      // Copy Assets.xcassets (app icons + any other assets) recursively.
      // Required for ASSETCATALOG_COMPILER_APPICON_NAME to find AppIcon at build time.
      const assetsSrc = path.join(sourceDir, "Assets.xcassets");
      const assetsDst = path.join(watchDir, "Assets.xcassets");
      if (fs.existsSync(assetsSrc)) {
        function copyDirRecursive(src, dst) {
          fs.mkdirSync(dst, { recursive: true });
          for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
            const s = path.join(src, entry.name);
            const d = path.join(dst, entry.name);
            if (entry.isDirectory()) copyDirRecursive(s, d);
            else fs.copyFileSync(s, d);
          }
        }
        copyDirRecursive(assetsSrc, assetsDst);
        console.log(`[Watch] copied Assets.xcassets → ${assetsDst}`);
      } else {
        console.warn(`[Watch] Assets.xcassets not found at ${assetsSrc} — Watch icons will be missing`);
      }

      // Copy XCTest suites into the unit-test target directory.
      const testDir = path.join(iosRoot, WATCH_TEST_TARGET_NAME);
      fs.mkdirSync(testDir, { recursive: true });
      for (const file of WATCH_TEST_SOURCES) {
        const src = path.join(sourceDir, file);
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, path.join(testDir, file));
          console.log(`[Watch] copied ${file} → ${WATCH_TEST_TARGET_NAME}`);
        } else {
          console.warn(`[Watch] test source NOT FOUND: ${src}`);
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

    // ── Fix productType ────────────────────────────────────────────────────
    // addTarget("watch2_app") sets productType = "com.apple.product-type.application.watchapp2"
    // (the legacy WatchKit 2 container). Modern standalone watchOS apps (watchOS 7+,
    // @main App with WKApplication=true) must use "com.apple.product-type.application".
    // Without this fix iOS won't recognise the embedded app as a Watch companion.
    const nts3 = project.pbxNativeTargetSection();
    const watchTargetObj = nts3[watchUuid];
    if (watchTargetObj) {
      const wrongType = '"com.apple.product-type.application.watchapp2"';
      if (watchTargetObj.productType === wrongType ||
          watchTargetObj.productType === "com.apple.product-type.application.watchapp2") {
        watchTargetObj.productType = '"com.apple.product-type.application"';
        console.log("[Watch] Fixed productType: watchapp2 → application (standalone watchOS 7+ app)");
      }
    }

    // ── Override build settings ────────────────────────────────────────────
    applyWatchBuildSettings(project, watchUuid);

    // addTarget("watch2_app") auto-creates a PBXTargetDependency AND injects
    // the Watch into the scheme. We KEEP the scheme entry (Watch must be in the
    // scheme to build in Xcode 26) but REMOVE the dep (dep + scheme = double
    // scheduling → "Multiple commands produce").
    removeWatchTargetDependency(project, watchUuid);
    console.log("[Watch] Removed auto-created dep (scheme-only scheduling)");
  }

  if (watchUuid) {
    // Fix productType unconditionally (idempotent) — covers both the fresh-add
    // path (where it was already fixed above) and re-run paths (alreadyPresent=true)
    // where the pbxproj may still carry the stale watchapp2 type from a previous
    // build that didn't include this fix.
    const ntsCheck = project.pbxNativeTargetSection();
    const wtObj = ntsCheck[watchUuid];
    if (wtObj) {
      const wt2 = '"com.apple.product-type.application.watchapp2"';
      if (wtObj.productType === wt2 ||
          wtObj.productType === "com.apple.product-type.application.watchapp2") {
        wtObj.productType = '"com.apple.product-type.application"';
        console.log("[Watch] Fixed productType (re-run): watchapp2 → application");
      }
    }

    // Scheme-only scheduling (NO PBXTargetDependency).
    // removeWatchTargetDependency is idempotent — call unconditionally so that
    // on re-runs (alreadyPresent=true) any leftover dep from a previous run is
    // also stripped.
    removeWatchTargetDependency(project, watchUuid);

    // Remove the "Embed Watch Content" PBXCopyFilesBuildPhase that addTarget
    // created. It looks in Release-iphoneos/ which the Watch never occupies
    // (Watch builds to watchos path). A shell script phase replaces it.
    removeEmbedWatchPhase(project);

    // Add a shell script phase that finds the Watch app in the correct watchos
    // build products directory and copies it into the iOS app bundle.
    addEmbedWatchShellScript(project);

    // ATPS belt-and-suspenders — keep it in case future Xcode versions use it.
    applyAllowPlatformSpecializationToMainApp(project);

    // Register Assets.xcassets in the Watch target's Resources phase so that
    // ASSETCATALOG_COMPILER_APPICON_NAME has input at build time.
    addWatchAssetCatalogToResources(project, watchUuid);

    // Register standalone icon PNGs in the Watch Resources phase.
    // Apple's ITMS-90391 validator checks for actual PNG files listed in
    // CFBundleIconFiles — it does not look inside Assets.car for icons.
    addWatchIconFilesToResources(project, watchUuid);

    // Ensure ALL WATCH_SWIFT_SOURCES are registered in the Watch target's
    // Sources phase. The addBuildPhase() call above only runs on the fresh-add
    // path; when the target already exists (prebuild re-runs), any source file
    // added to WATCH_SWIFT_SOURCES later (e.g. KickSessionRestorePolicy.swift)
    // would otherwise never be compiled → "unresolved identifier" at build.
    ensureWatchSourcesInWatchTarget(project, watchUuid);

    // Create / maintain the watchOS unit-test bundle target that compiles the
    // XCTest suites together with the non-UI production sources.
    ensureWatchTestTarget(project);
  }

  // ── Always apply: phone bridge Swift files to main target Sources ─────────
  // project.addFile() with null group crashes the xcode library. Instead we
  // manually insert PBXFileReference + PBXBuildFile entries with phase-aware
  // idempotency (checks phase membership, not just global file refs).
  addPhoneBridgeToMainTarget(project, appName);

  return config;
}

/**
 * Registers each standalone icon PNG (from WATCH_ICON_FILES) directly in the
 * Watch target's Resources build phase so they are copied into the Watch bundle
 * root. Idempotent — skips files already present in the phase.
 *
 * Apple's ITMS-90391 validator scans the bundle for actual PNG files listed in
 * CFBundleIconFiles. It does NOT inspect Assets.car for icons. Without these
 * standalone PNGs in the bundle the validator says "No icons found" even though
 * Assets.car contains correctly compiled icon data.
 */
function addWatchIconFilesToResources(project, watchTargetUuid) {
  const objects = project.hash.project.objects;
  const nts = project.pbxNativeTargetSection();
  const watchTarget = nts[watchTargetUuid];
  if (!watchTarget) return;

  const frs = project.pbxFileReferenceSection();
  const resourcesSection = objects["PBXResourcesBuildPhase"] || {};
  const buildFileSection = objects["PBXBuildFile"] || {};
  if (!objects["PBXFileReference"]) objects["PBXFileReference"] = {};
  if (!objects["PBXBuildFile"]) objects["PBXBuildFile"] = {};

  // Find Watch target's Resources phase
  let resourcesPhaseUuid = null;
  for (const phase of watchTarget.buildPhases || []) {
    const uuid = typeof phase === "object" ? phase.value : phase;
    if (resourcesSection[uuid]) { resourcesPhaseUuid = uuid; break; }
  }
  if (!resourcesPhaseUuid) {
    console.warn("[Watch] addWatchIconFilesToResources: Resources phase not found");
    return;
  }
  const resourcesPhase = resourcesSection[resourcesPhaseUuid];
  if (!resourcesPhase.files) resourcesPhase.files = [];

  for (const iconFile of WATCH_ICON_FILES) {
    const iconPath = `${WATCH_TARGET_NAME}/${iconFile}`;

    // Find existing file reference (idempotency)
    let fileRefUuid = Object.keys(frs).find((k) => {
      if (k.endsWith("_comment")) return false;
      const fr = frs[k];
      if (!fr || typeof fr !== "object") return false;
      const p = fr.path || fr.name || "";
      return p === `"${iconPath}"` || p === iconPath || p === `"${iconFile}"` || p === iconFile;
    });

    if (fileRefUuid) {
      // Check if already in Resources phase
      const inPhase = resourcesPhase.files.some((ref) => {
        const bfUuid = typeof ref === "object" ? ref.value : ref;
        if (!bfUuid || bfUuid.endsWith("_comment")) return false;
        const bf = buildFileSection[bfUuid];
        if (!bf) return false;
        const fr = typeof bf.fileRef === "object" ? bf.fileRef.value : bf.fileRef;
        return fr === fileRefUuid;
      });
      if (inPhase) {
        console.log(`[Watch] ${iconFile} already in Resources — skipping`);
        continue;
      }
    } else {
      fileRefUuid = project.generateUuid();
      objects["PBXFileReference"][fileRefUuid] = {
        isa: "PBXFileReference",
        lastKnownFileType: "image.png",
        name: `"${iconFile}"`,
        path: `"${iconPath}"`,
        sourceTree: '"<group>"',
      };
      objects["PBXFileReference"][`${fileRefUuid}_comment`] = iconFile;
    }

    const buildFileUuid = project.generateUuid();
    objects["PBXBuildFile"][buildFileUuid] = { isa: "PBXBuildFile", fileRef: fileRefUuid };
    objects["PBXBuildFile"][`${buildFileUuid}_comment`] = `${iconFile} in Resources`;
    resourcesPhase.files.push({ value: buildFileUuid, comment: `${iconFile} in Resources` });
    console.log(`[Watch] Registered ${iconFile} in Watch Resources phase`);
  }
}

/**
 * Registers PregnancyWatchApp/Assets.xcassets as a PBXFileReference on the
 * Watch target's Resources build phase. Idempotent — skips if already present.
 *
 * Must be called unconditionally (both fresh-add and re-run paths) because
 * addTarget() skips the Resources phase setup on subsequent prebuild runs.
 * Without the asset catalog registered here, ASSETCATALOG_COMPILER_APPICON_NAME
 * has no input → no icons compiled → ITMS-90391 / ITMS-90713 on submission.
 */
function addWatchAssetCatalogToResources(project, watchTargetUuid) {
  const CATALOG_PATH = `${WATCH_TARGET_NAME}/Assets.xcassets`;
  const objects = project.hash.project.objects;
  const nts = project.pbxNativeTargetSection();
  const watchTarget = nts[watchTargetUuid];
  if (!watchTarget) return;

  // ── 1. Locate (or create) the PBXFileReference for Assets.xcassets ───────
  const frs = project.pbxFileReferenceSection();
  let assetRefUuid = Object.keys(frs).find((k) => {
    if (k.endsWith("_comment")) return false;
    const fr = frs[k];
    if (!fr || typeof fr !== "object") return false;
    const p = fr.path || fr.name || "";
    return (
      p === `"${CATALOG_PATH}"` ||
      p === CATALOG_PATH ||
      p === '"Assets.xcassets"' ||
      p === "Assets.xcassets"
    );
  });

  if (!assetRefUuid) {
    if (!objects["PBXFileReference"]) objects["PBXFileReference"] = {};
    assetRefUuid = project.generateUuid();
    objects["PBXFileReference"][assetRefUuid] = {
      isa: "PBXFileReference",
      lastKnownFileType: "folder.assetcatalog",
      name: '"Assets.xcassets"',
      path: `"${CATALOG_PATH}"`,
      sourceTree: '"<group>"',
    };
    objects["PBXFileReference"][`${assetRefUuid}_comment`] = "Assets.xcassets";
    console.log(`[Watch] Created PBXFileReference for Assets.xcassets (${assetRefUuid})`);
  }

  // ── 2. Find Watch target's Resources build phase ──────────────────────────
  const resourcesSection = objects["PBXResourcesBuildPhase"] || {};
  const buildPhases = watchTarget.buildPhases || [];
  const buildFileSection = objects["PBXBuildFile"] || {};

  let resourcesPhaseUuid = null;
  for (const phase of buildPhases) {
    const uuid = typeof phase === "object" ? phase.value : phase;
    if (resourcesSection[uuid]) {
      resourcesPhaseUuid = uuid;
      break;
    }
  }
  if (!resourcesPhaseUuid) {
    console.warn("[Watch] addWatchAssetCatalogToResources: Resources phase not found on Watch target");
    return;
  }

  const resourcesPhase = resourcesSection[resourcesPhaseUuid];
  if (!resourcesPhase.files) resourcesPhase.files = [];

  // ── 3. Idempotency — skip if already present ──────────────────────────────
  const alreadyInResources = resourcesPhase.files.some((ref) => {
    const bfUuid = typeof ref === "object" ? ref.value : ref;
    if (!bfUuid || bfUuid.endsWith("_comment")) return false;
    const bf = buildFileSection[bfUuid];
    if (!bf) return false;
    const fileRef = typeof bf.fileRef === "object" ? bf.fileRef.value : bf.fileRef;
    return fileRef === assetRefUuid;
  });
  if (alreadyInResources) {
    console.log("[Watch] Assets.xcassets already in Watch Resources phase — skipping");
    return;
  }

  // ── 4. Create PBXBuildFile and add to Resources phase ─────────────────────
  if (!objects["PBXBuildFile"]) objects["PBXBuildFile"] = {};
  const buildFileUuid = project.generateUuid();
  objects["PBXBuildFile"][buildFileUuid] = {
    isa: "PBXBuildFile",
    fileRef: assetRefUuid,
  };
  objects["PBXBuildFile"][`${buildFileUuid}_comment`] = "Assets.xcassets in Resources";
  resourcesPhase.files.push({ value: buildFileUuid, comment: "Assets.xcassets in Resources" });
  console.log(`[Watch] Added Assets.xcassets to Watch Resources phase (buildFile=${buildFileUuid})`);
}

/**
 * Returns the UUID of the main iOS app (iphoneos) target.
 *
 * After we fix the Watch target's productType to "com.apple.product-type.application"
 * (required for modern standalone watchOS apps), BOTH targets share the same
 * productType string. This helper disambiguates by excluding any target whose
 * name matches WATCH_TARGET_NAME.
 */
function findMainAppTargetUuid(nts) {
  return Object.keys(nts).find((key) => {
    if (key.endsWith("_comment")) return false;
    const t = nts[key];
    if (!t || typeof t !== "object") return false;
    const isApp =
      t.productType === '"com.apple.product-type.application"' ||
      t.productType === "com.apple.product-type.application";
    if (!isApp) return false;
    const name = t.name === `"${WATCH_TARGET_NAME}"` || t.name === WATCH_TARGET_NAME;
    return !name; // exclude the Watch target itself
  });
}

/**
 * Removes all PBXTargetDependency + PBXContainerItemProxy entries that point
 * from the main iOS app target to the Watch target. Idempotent.
 *
 * addTarget("watch2_app") auto-creates one such dep. Having it alongside the
 * scheme BuildActionEntry (buildForArchiving=YES) causes the Watch to be
 * scheduled twice → "Multiple commands produce ...watchos/PregnancyWatchApp.app".
 */
function removeWatchTargetDependency(project, watchTargetUuid) {
  const nts = project.pbxNativeTargetSection();
  const objects = project.hash.project.objects;

  const mainTargetUuid = findMainAppTargetUuid(nts);
  if (!mainTargetUuid) return;

  const mainTarget = nts[mainTargetUuid];
  if (!mainTarget.dependencies) return;

  const depSection = objects["PBXTargetDependency"] || {};
  const proxySection = objects["PBXContainerItemProxy"] || {};

  const toRemove = [];
  mainTarget.dependencies = mainTarget.dependencies.filter((ref) => {
    const depUuid = typeof ref === "object" ? ref.value : ref;
    const depObj = depSection[depUuid];
    if (!depObj) return true;
    const remote =
      typeof depObj.target === "object" ? depObj.target.value : depObj.target;
    if (remote !== watchTargetUuid) return true;
    toRemove.push({ depUuid, proxyUuid: depObj.targetProxy });
    return false; // remove from dependencies list
  });

  for (const { depUuid, proxyUuid } of toRemove) {
    delete depSection[depUuid];
    delete depSection[`${depUuid}_comment`];
    if (proxyUuid) {
      const proxyKey =
        typeof proxyUuid === "object" ? proxyUuid.value : proxyUuid;
      delete proxySection[proxyKey];
      delete proxySection[`${proxyKey}_comment`];
    }
    console.log(`[Watch] Removed PBXTargetDependency (${depUuid}) → Watch`);
  }
  if (toRemove.length === 0) {
    console.log("[Watch] No PBXTargetDependency to Watch found — nothing to remove");
  }
}

/**
 * Adds PBXContainerItemProxy + PBXTargetDependency from the main iOS app
 * target to the Watch app target. Idempotent — skips if already present.
 *
 * Must be called unconditionally (even when the Watch target already exists)
 * because addTarget() is skipped on subsequent prebuild runs.
 */
function _ensureWatchTargetDependency(project, watchTargetUuid) {
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
 * Removes the auto-created Watch embed PBXCopyFilesBuildPhase from the iOS
 * app target. addTarget("watch2_app") auto-creates this phase, but:
 *  - its name varies: "Embed Watch Content" (older xcode lib) or
 *    "Embed PregnancyWatchApp" (xcode lib using target product name on EAS)
 *  - it looks in BUILT_PRODUCTS_DIR (Release-iphoneos/) which is wrong;
 *    Watch builds to UninstalledProducts/watchos/ with SKIP_INSTALL=YES
 *
 * Detection strategy: look for any PBXCopyFilesBuildPhase on the iOS app
 * target with dstSubfolderSpec = 16 (Xcode's "Watch Content" destination).
 * This is name-independent and matches both naming conventions.
 *
 * Idempotent — safe to call multiple times.
 */
function removeEmbedWatchPhase(project) {
  const nts = project.pbxNativeTargetSection();
  const objects = project.hash.project.objects;

  const mainTargetUuid = findMainAppTargetUuid(nts);
  if (!mainTargetUuid) return;

  const mainTarget = nts[mainTargetUuid];
  if (!mainTarget.buildPhases) return;

  const copySection = objects["PBXCopyFilesBuildPhase"] || {};

  // dstSubfolderSpec = 16 is Xcode's "Watch Content" destination — the only
  // PBXCopyFilesBuildPhase that addTarget("watch2_app") creates on the iOS
  // app target. This detects "Embed Watch Content" AND "Embed PregnancyWatchApp"
  // regardless of xcode library version or target name.
  const watchPhaseRefs = mainTarget.buildPhases.filter((ref) => {
    const uuid = typeof ref === "object" ? ref.value : ref;
    const phase = copySection[uuid];
    if (!phase) return false;
    const spec = phase.dstSubfolderSpec;
    return spec === 16 || spec === "16";
  });

  if (watchPhaseRefs.length === 0) {
    console.log("[Watch] No Watch-content copy phase (dstSubfolderSpec=16) found — nothing to remove");
    return;
  }

  for (const phaseRef of watchPhaseRefs) {
    const phaseUuid = typeof phaseRef === "object" ? phaseRef.value : phaseRef;
    const phaseName = (copySection[phaseUuid] || {}).name || phaseUuid;

    mainTarget.buildPhases = mainTarget.buildPhases.filter((ref) => {
      const uuid = typeof ref === "object" ? ref.value : ref;
      return uuid !== phaseUuid;
    });

    delete copySection[phaseUuid];
    delete copySection[`${phaseUuid}_comment`];

    console.log(`[Watch] Removed Watch embed copy phase ${phaseName} (${phaseUuid})`);
  }
}

/**
 * Adds a PBXShellScriptBuildPhase to the iOS app target that embeds the Watch
 * app from the correct watchos build products path.
 *
 * addTarget's auto-created "Embed Watch Content" PBXCopyFilesBuildPhase always
 * looks in $(BUILT_PRODUCTS_DIR) = Release-iphoneos/, but the Watch (with
 * SKIP_INSTALL=YES) lands in $(OBJROOT)/UninstalledProducts/watchos/ during an
 * archive build. This script finds and copies it from the correct location.
 *
 * Idempotent — skips if a phase with the same name already exists.
 */
function addEmbedWatchShellScript(project) {
  const nts = project.pbxNativeTargetSection();
  const objects = project.hash.project.objects;

  const mainTargetUuid = findMainAppTargetUuid(nts);
  if (!mainTargetUuid) return;

  const mainTarget = nts[mainTargetUuid];
  if (!mainTarget.buildPhases) mainTarget.buildPhases = [];

  const scriptSection = objects["PBXShellScriptBuildPhase"] || {};

  // Idempotency: skip if already present
  const alreadyAdded = mainTarget.buildPhases.some((ref) => {
    const uuid = typeof ref === "object" ? ref.value : ref;
    const phase = scriptSection[uuid];
    if (!phase) return false;
    const name = phase.name || "";
    return name === '"Embed Watch App"' || name === "Embed Watch App";
  });
  if (alreadyAdded) {
    // Remove the stale phase so we can re-add it with the current script content.
    const staleRef = mainTarget.buildPhases.find((ref) => {
      const uuid = typeof ref === "object" ? ref.value : ref;
      const phase = scriptSection[uuid];
      if (!phase) return false;
      const name = phase.name || "";
      return name === '"Embed Watch App"' || name === "Embed Watch App";
    });
    if (staleRef) {
      const staleUuid = typeof staleRef === "object" ? staleRef.value : staleRef;
      mainTarget.buildPhases = mainTarget.buildPhases.filter((ref) => {
        const uuid = typeof ref === "object" ? ref.value : ref;
        return uuid !== staleUuid;
      });
      delete scriptSection[staleUuid];
      delete scriptSection[`${staleUuid}_comment`];
      console.log("[Watch] Replaced stale 'Embed Watch App' shell script phase");
    }
  }

  const phaseUuid = project.generateUuid();

  // The shell script — intentionally avoids double-quotes in the script body
  // to prevent escaping issues in the pbxproj string format. Bash variables
  // expand correctly without surrounding quotes for path components.
  //
  // SKIP_INSTALL=YES (standard for Watch extensions) means the Watch app lands
  // in $OBJROOT/UninstalledProducts/watchos/ during an archive build, not in
  // the normal BUILT_PRODUCTS_DIR. Falls back to find(1) if the path changes.
  const scriptLines = [
    "#!/bin/bash",
    "set -e",
    "WATCH_APP_NAME=PregnancyWatchApp",
    "WATCH_DEST=${BUILT_PRODUCTS_DIR}/${WRAPPER_NAME}/Watch",
    "WATCH_SRC=${OBJROOT}/UninstalledProducts/watchos/${WATCH_APP_NAME}.app",
    "if [ ! -d ${WATCH_SRC} ]; then",
    "  WATCH_SRC=$(find $(dirname ${OBJROOT}) -maxdepth 6 -name ${WATCH_APP_NAME}.app -not -path '*/${WRAPPER_NAME}/*' 2>/dev/null | head -1)",
    "fi",
    "if [ -z ${WATCH_SRC} ] || [ ! -d ${WATCH_SRC} ]; then",
    "  echo error: Cannot locate ${WATCH_APP_NAME}.app to embed >&2",
    "  exit 1",
    "fi",
    "echo note: Embedding ${WATCH_APP_NAME}.app from ${WATCH_SRC}",
    "mkdir -p ${WATCH_DEST}",
    "cp -R ${WATCH_SRC} ${WATCH_DEST}/",
    // Inject icon PNGs directly into the embedded Watch bundle.
    // Apple ITMS-90391 validator checks for actual PNG files listed in
    // CFBundleIconFiles — it does NOT inspect Assets.car for icons.
    // The Xcode CopyBundleResources phase may not run for the Watch target
    // (watchOS + SKIP_INSTALL interaction), so we inject here instead.
    // $SRCROOT/PregnancyWatchApp/ is where withWatchFiles copies them at prebuild.
    "ICON_SRC=${SRCROOT}/PregnancyWatchApp",
    "ICON_DEST=${WATCH_DEST}/${WATCH_APP_NAME}.app",
    "for ICON in AppIcon-58.png AppIcon-80.png AppIcon-87.png AppIcon-88.png AppIcon-100.png AppIcon-102.png AppIcon-108.png AppIcon-172.png AppIcon-196.png AppIcon-216.png AppIcon-234.png AppIcon-1024.png; do",
    "  if [ -f ${ICON_SRC}/${ICON} ]; then",
    "    cp ${ICON_SRC}/${ICON} ${ICON_DEST}/",
    "    echo note: Injected ${ICON} into Watch bundle",
    "  else",
    "    echo warning: Watch icon not found: ${ICON_SRC}/${ICON} >&2",
    "  fi",
    "done",
  ];
  // Join with \n (2-char sequence) — the pbxproj string format uses \n for newlines.
  const shellScriptContent = scriptLines.join("\\n");
  // Wrap in pbxproj string quotes. No " inside the script body so no escaping needed.
  const shellScriptValue = `"${shellScriptContent}"`;

  if (!objects["PBXShellScriptBuildPhase"]) objects["PBXShellScriptBuildPhase"] = {};
  objects["PBXShellScriptBuildPhase"][phaseUuid] = {
    isa: "PBXShellScriptBuildPhase",
    alwaysOutOfDate: 1,
    buildActionMask: 2147483647,
    files: [],
    inputFileListPaths: [],
    inputPaths: [],
    outputFileListPaths: [],
    outputPaths: ['"$(BUILT_PRODUCTS_DIR)/$(WRAPPER_NAME)/Watch/PregnancyWatchApp.app"'],
    runOnlyForDeploymentPostprocessing: 0,
    shellPath: "/bin/bash",
    shellScript: shellScriptValue,
    showEnvVarsInLog: 0,
    name: '"Embed Watch App"',
  };
  objects["PBXShellScriptBuildPhase"][`${phaseUuid}_comment`] = "Embed Watch App";

  mainTarget.buildPhases.push({ value: phaseUuid, comment: "Embed Watch App" });
  console.log(`[Watch] Added 'Embed Watch App' shell script phase (${phaseUuid})`);
}

/**
 * Adds both phone-side bridge Swift files (PhoneWatchBridge.swift and
 * WatchConnectivityModule.swift) to the main iOS app target's Sources build
 * phase, and links WatchConnectivity.framework to its Frameworks phase.
 *
 * Uses phase-aware idempotency: checks whether the PBXBuildFile is already
 * listed in the phase (not just whether a global file reference exists).
 * project.addFile() with a null group would crash the xcode library, so all
 * insertions are done manually into the pbxproj object graph.
 */
/**
 * Ensures every file in WATCH_SWIFT_SOURCES is present in the Watch target's
 * Sources build phase. Idempotent and phase-aware (checks PBXBuildFile
 * membership in the phase, not just global file references), mirroring
 * addPhoneBridgeToMainTarget. Must run unconditionally — the addBuildPhase()
 * bulk registration only happens when the target is first created, so sources
 * added to WATCH_SWIFT_SOURCES later are otherwise skipped on re-runs.
 */
function ensureWatchSourcesInWatchTarget(project, watchTargetUuid) {
  const objects = project.hash.project.objects;
  const nts = project.pbxNativeTargetSection();
  const watchTarget = nts[watchTargetUuid];
  if (!watchTarget) return;

  const sourcesSection = objects["PBXSourcesBuildPhase"] || {};
  const buildFileSection = objects["PBXBuildFile"] || {};
  if (!objects["PBXBuildFile"]) objects["PBXBuildFile"] = {};
  if (!objects["PBXFileReference"]) objects["PBXFileReference"] = {};
  const frs = project.pbxFileReferenceSection();

  // Locate the Watch target's Sources phase.
  let sourcesPhaseUuid = null;
  for (const phase of watchTarget.buildPhases || []) {
    const uuid = typeof phase === "object" ? phase.value : phase;
    if (sourcesSection[uuid]) { sourcesPhaseUuid = uuid; break; }
  }
  if (!sourcesPhaseUuid) {
    console.warn("[Watch] ensureWatchSourcesInWatchTarget: Sources phase not found");
    return;
  }
  const sourcesPhase = sourcesSection[sourcesPhaseUuid];
  if (!sourcesPhase.files) sourcesPhase.files = [];

  for (const fileName of WATCH_SWIFT_SOURCES) {
    const filePath = `${WATCH_TARGET_NAME}/${fileName}`;

    // Find existing file reference (bare name or watch-relative path).
    let fileRefUuid = null;
    for (const [k, v] of Object.entries(frs)) {
      if (k.endsWith("_comment")) continue;
      if (!v || typeof v !== "object") continue;
      const p = v.path || v.name || "";
      if (
        p === `"${fileName}"` ||
        p === fileName ||
        p === `"${filePath}"` ||
        p === filePath
      ) {
        fileRefUuid = k;
        break;
      }
    }

    if (fileRefUuid) {
      // Phase-aware idempotency: skip when a build file for this ref is
      // already in the Watch Sources phase.
      const inPhase = sourcesPhase.files.some((bf) => {
        const bfUuid = typeof bf === "object" ? bf.value : bf;
        if (!bfUuid || bfUuid.endsWith("_comment")) return false;
        const bfObj = buildFileSection[bfUuid];
        if (!bfObj) return false;
        const refVal =
          typeof bfObj.fileRef === "object" ? bfObj.fileRef.value : bfObj.fileRef;
        return refVal === fileRefUuid;
      });
      if (inPhase) continue;
    } else {
      fileRefUuid = project.generateUuid();
      objects["PBXFileReference"][fileRefUuid] = {
        isa: "PBXFileReference",
        lastKnownFileType: "sourcecode.swift",
        name: `"${fileName}"`,
        path: `"${filePath}"`,
        sourceTree: '"<group>"',
      };
      objects["PBXFileReference"][`${fileRefUuid}_comment`] = fileName;
      console.log(`[Watch] Created PBXFileReference for ${fileName} (${fileRefUuid})`);
    }

    const buildFileUuid = project.generateUuid();
    objects["PBXBuildFile"][buildFileUuid] = {
      isa: "PBXBuildFile",
      fileRef: fileRefUuid,
    };
    objects["PBXBuildFile"][`${buildFileUuid}_comment`] = `${fileName} in Sources`;
    sourcesPhase.files.push({ value: buildFileUuid, comment: `${fileName} in Sources` });
    console.log(`[Watch] Added ${fileName} to Watch target Sources (buildFile=${buildFileUuid})`);
  }
}

function addPhoneBridgeToMainTarget(project, appName) {
  const nts = project.pbxNativeTargetSection();
  const objects = project.hash.project.objects;

  const mainTargetUuid = findMainAppTargetUuid(nts);
  if (!mainTargetUuid) {
    console.warn("[Watch] addPhoneBridgeToMainTarget: main app target not found");
    return;
  }

  const mainTarget = nts[mainTargetUuid];
  const buildPhases = mainTarget.buildPhases || [];

  // ── Locate Sources and Frameworks phases by comment ────────────────────────
  let sourcesPhaseUuid = null;
  let frameworksPhaseUuid = null;
  for (const phase of buildPhases) {
    const uuid = typeof phase === "object" ? phase.value : phase;
    const comment = typeof phase === "object" ? (phase.comment || "") : "";
    if (comment === "Sources") sourcesPhaseUuid = uuid;
    if (comment === "Frameworks") frameworksPhaseUuid = uuid;
  }

  const sourcesSection = objects["PBXSourcesBuildPhase"] || {};
  const frameworksSection = objects["PBXFrameworksBuildPhase"] || {};

  // Fallback: find by ISA only within phases listed in the main target,
  // to avoid accidentally picking the Watch target's Sources/Frameworks phase.
  const mainTargetPhaseUuids = new Set(
    buildPhases.map((p) => (typeof p === "object" ? p.value : p)),
  );
  if (!sourcesPhaseUuid) {
    sourcesPhaseUuid = Object.keys(sourcesSection).find(
      (k) => !k.endsWith("_comment") && sourcesSection[k] && mainTargetPhaseUuids.has(k),
    ) || null;
  }
  if (!frameworksPhaseUuid) {
    frameworksPhaseUuid = Object.keys(frameworksSection).find(
      (k) => !k.endsWith("_comment") && frameworksSection[k] && mainTargetPhaseUuids.has(k),
    ) || null;
  }

  const sourcesPhase = sourcesPhaseUuid ? sourcesSection[sourcesPhaseUuid] : null;
  const frameworksPhase = frameworksPhaseUuid ? frameworksSection[frameworksPhaseUuid] : null;

  if (!sourcesPhase) {
    console.warn("[Watch] addPhoneBridgeToMainTarget: Sources phase not found on main target");
    return;
  }
  if (!sourcesPhase.files) sourcesPhase.files = [];

  const frs = project.pbxFileReferenceSection();
  const buildFileSection = objects["PBXBuildFile"] || {};
  if (!objects["PBXBuildFile"]) objects["PBXBuildFile"] = {};
  if (!objects["PBXFileReference"]) objects["PBXFileReference"] = {};

  // ── Add Swift bridge files to Sources (phase-aware idempotency) ────────────
  for (const fileName of PHONE_BRIDGE_SOURCES) {
    const filePath = `${appName}/${fileName}`;

    // Phase-aware idempotency: find existing file reference (if any), then
    // check if a PBXBuildFile pointing to it is already in the Sources phase.
    let fileRefUuid = null;
    for (const [k, v] of Object.entries(frs)) {
      if (k.endsWith("_comment")) continue;
      if (!v || typeof v !== "object") continue;
      const p = v.path || v.name || "";
      // Match either bare file name OR app-relative path (what we write on creation)
      if (
        p === `"${fileName}"` ||
        p === fileName ||
        p === `"${filePath}"` ||
        p === filePath
      ) {
        fileRefUuid = k;
        break;
      }
    }

    if (fileRefUuid) {
      // Check if a build file for this ref is already in Sources phase.
      // PBX objects store references as either a plain UUID string OR an
      // object { value: uuid, comment: "..." }. Normalize before comparing.
      const inPhase = sourcesPhase.files.some((bf) => {
        const bfUuid = typeof bf === "object" ? bf.value : bf;
        if (!bfUuid || bfUuid.endsWith("_comment")) return false;
        const bfObj = buildFileSection[bfUuid];
        if (!bfObj) return false;
        const refVal =
          typeof bfObj.fileRef === "object"
            ? bfObj.fileRef.value
            : bfObj.fileRef;
        return refVal === fileRefUuid;
      });
      if (inPhase) {
        console.log(`[Watch] ${fileName} already in main target Sources — skipping`);
        continue;
      }
    } else {
      // Create the PBXFileReference
      fileRefUuid = project.generateUuid();
      objects["PBXFileReference"][fileRefUuid] = {
        isa: "PBXFileReference",
        lastKnownFileType: "sourcecode.swift",
        name: `"${fileName}"`,
        path: `"${filePath}"`,
        sourceTree: '"<group>"',
      };
      objects["PBXFileReference"][`${fileRefUuid}_comment`] = fileName;
      console.log(`[Watch] Created PBXFileReference for ${fileName} (${fileRefUuid})`);
    }

    // Create PBXBuildFile and add to Sources phase
    const buildFileUuid = project.generateUuid();
    objects["PBXBuildFile"][buildFileUuid] = {
      isa: "PBXBuildFile",
      fileRef: fileRefUuid,
    };
    objects["PBXBuildFile"][`${buildFileUuid}_comment`] = `${fileName} in Sources`;
    sourcesPhase.files.push({ value: buildFileUuid, comment: `${fileName} in Sources` });
    console.log(`[Watch] Added ${fileName} to main target Sources (buildFile=${buildFileUuid})`);
  }

  // ── Add WatchConnectivity.framework to main target Frameworks ──────────────
  if (!frameworksPhase) {
    console.warn("[Watch] addPhoneBridgeToMainTarget: Frameworks phase not found — skipping WatchConnectivity");
    return;
  }
  if (!frameworksPhase.files) frameworksPhase.files = [];

  const WC_FRAMEWORK = "WatchConnectivity.framework";
  const WC_PATH = `System/Library/Frameworks/${WC_FRAMEWORK}`;

  // Check if already in Frameworks phase.
  // Normalize fileRef: PBX may store it as a UUID string or { value, comment }.
  // Normalize PBX path/name: the xcode library wraps values in double quotes
  // (e.g. '"WatchConnectivity.framework"'), so strip surrounding quotes before
  // comparing, and also accept a full path ending in the framework basename.
  const stripQuotes = (s) => (typeof s === "string" ? s.replace(/^"(.*)"$/, "$1") : s);
  const wcAlreadyLinked = frameworksPhase.files.some((bf) => {
    const bfUuid = typeof bf === "object" ? bf.value : bf;
    if (!bfUuid || bfUuid.endsWith("_comment")) return false;
    const bfObj = buildFileSection[bfUuid];
    if (!bfObj) return false;
    const ref =
      typeof bfObj.fileRef === "object" ? bfObj.fileRef.value : bfObj.fileRef;
    const refObj = frs[ref];
    if (!refObj) return false;
    const pNorm = stripQuotes(refObj.path || refObj.name || "");
    return pNorm === WC_FRAMEWORK || pNorm.endsWith(`/${WC_FRAMEWORK}`);
  });

  if (wcAlreadyLinked) {
    console.log("[Watch] WatchConnectivity.framework already in main Frameworks — skipping");
    return;
  }

  // Find or create file reference for WatchConnectivity.framework
  let wcRefUuid = Object.keys(frs).find((k) => {
    if (k.endsWith("_comment")) return false;
    const v = frs[k];
    if (!v || typeof v !== "object") return false;
    const pNorm = stripQuotes(v.path || v.name || "");
    return pNorm === WC_FRAMEWORK || pNorm.endsWith(`/${WC_FRAMEWORK}`);
  });

  if (!wcRefUuid) {
    wcRefUuid = project.generateUuid();
    objects["PBXFileReference"][wcRefUuid] = {
      isa: "PBXFileReference",
      lastKnownFileType: "wrapper.framework",
      name: `"${WC_FRAMEWORK}"`,
      path: `"${WC_PATH}"`,
      sourceTree: '"SDKROOT"',
    };
    objects["PBXFileReference"][`${wcRefUuid}_comment`] = WC_FRAMEWORK;
    console.log(`[Watch] Created PBXFileReference for ${WC_FRAMEWORK} (${wcRefUuid})`);
  }

  const wcBuildFileUuid = project.generateUuid();
  objects["PBXBuildFile"][wcBuildFileUuid] = {
    isa: "PBXBuildFile",
    fileRef: wcRefUuid,
    settings: { ATTRIBUTES: ["Required"] },
  };
  objects["PBXBuildFile"][`${wcBuildFileUuid}_comment`] = `${WC_FRAMEWORK} in Frameworks`;
  frameworksPhase.files.push({
    value: wcBuildFileUuid,
    comment: `${WC_FRAMEWORK} in Frameworks`,
  });
  console.log(`[Watch] Linked ${WC_FRAMEWORK} to main target Frameworks (buildFile=${wcBuildFileUuid})`);
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

  const mainTargetUuid = findMainAppTargetUuid(nts);
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
      // Asset catalog icon — required for App Store submission (ITMS-90391/90713)
      ASSETCATALOG_COMPILER_APPICON_NAME: "AppIcon",
    });
    console.log(`[Watch] patched buildSettings for config ${cfgUuid}`);
  });
}
/**
 * Creates (idempotently) the watchOS unit-test bundle target
 * `PregnancyWatchAppTests`. The bundle compiles the XCTest suites copied into
 * ios/PregnancyWatchAppTests/ plus the non-UI production sources
 * (WATCH_TEST_PRODUCTION_SOURCES) from ios/PregnancyWatchApp/, so the tests
 * exercise the REAL implementations (no TEST_HOST needed — logic-style bundle).
 *
 * Hand-rolled (no project.addTarget) so no stray dependency / embed phase is
 * created on the main target and all build settings are fully controlled.
 */
function ensureWatchTestTarget(project) {
  const objects = project.hash.project.objects;
  const nts = project.pbxNativeTargetSection();

  // Idempotency: skip if the target already exists.
  const existing = Object.keys(nts).find((k) => {
    if (k.endsWith("_comment")) return false;
    const t = nts[k];
    return t && typeof t === "object" &&
      (t.name === WATCH_TEST_TARGET_NAME || t.name === `"${WATCH_TEST_TARGET_NAME}"`);
  });
  if (existing) {
    console.log(`[Watch/Tests] ${WATCH_TEST_TARGET_NAME} already present — ensuring frameworks and sources`);
    ensureWatchTestTargetFrameworks(project, existing);
    ensureWatchTestTargetSources(project, existing);
    return existing;
  }

  for (const section of [
    "PBXNativeTarget", "PBXFileReference", "PBXBuildFile",
    "PBXSourcesBuildPhase", "XCBuildConfiguration", "XCConfigurationList",
  ]) {
    if (!objects[section]) objects[section] = {};
  }
  const frs = project.pbxFileReferenceSection();

  // Deployment target: mirror the Watch app target when available.
  let watchosDeploymentTarget = "9.0";
  for (const [k, cfg] of Object.entries(objects["XCBuildConfiguration"])) {
    if (k.endsWith("_comment") || !cfg || typeof cfg !== "object") continue;
    const bs = cfg.buildSettings || {};
    if (bs.WATCHOS_DEPLOYMENT_TARGET &&
        String(bs.SDKROOT || "").includes("watchos")) {
      watchosDeploymentTarget = String(bs.WATCHOS_DEPLOYMENT_TARGET).replace(/"/g, "");
      break;
    }
  }

  // ── Product file reference (.xctest bundle) ────────────────────────────────
  const productRefUuid = project.generateUuid();
  objects["PBXFileReference"][productRefUuid] = {
    isa: "PBXFileReference",
    explicitFileType: "wrapper.cfbundle",
    includeInIndex: 0,
    path: `"${WATCH_TEST_TARGET_NAME}.xctest"`,
    sourceTree: "BUILT_PRODUCTS_DIR",
  };
  objects["PBXFileReference"][`${productRefUuid}_comment`] =
    `${WATCH_TEST_TARGET_NAME}.xctest`;

  // ── Sources build phase ─────────────────────────────────────────────────────
  const sourcesPhaseUuid = project.generateUuid();
  const sourcesFiles = [];

  const addSource = (fileName, filePath) => {
    // Reuse an existing file reference when one exists (production sources are
    // already referenced by the Watch app target).
    let fileRefUuid = null;
    for (const [k, v] of Object.entries(frs)) {
      if (k.endsWith("_comment") || !v || typeof v !== "object") continue;
      const p = v.path || v.name || "";
      if (p === `"${filePath}"` || p === filePath) { fileRefUuid = k; break; }
    }
    if (!fileRefUuid) {
      fileRefUuid = project.generateUuid();
      objects["PBXFileReference"][fileRefUuid] = {
        isa: "PBXFileReference",
        lastKnownFileType: "sourcecode.swift",
        name: `"${fileName}"`,
        path: `"${filePath}"`,
        sourceTree: '"<group>"',
      };
      objects["PBXFileReference"][`${fileRefUuid}_comment`] = fileName;
    }
    const buildFileUuid = project.generateUuid();
    objects["PBXBuildFile"][buildFileUuid] = { isa: "PBXBuildFile", fileRef: fileRefUuid };
    objects["PBXBuildFile"][`${buildFileUuid}_comment`] = `${fileName} in Sources`;
    sourcesFiles.push({ value: buildFileUuid, comment: `${fileName} in Sources` });
  };

  for (const f of WATCH_TEST_SOURCES) {
    addSource(f, `${WATCH_TEST_TARGET_NAME}/${f}`);
  }
  for (const f of WATCH_TEST_PRODUCTION_SOURCES) {
    addSource(f, `${WATCH_TARGET_NAME}/${f}`);
  }
  for (const f of PHONE_TEST_PRODUCTION_SOURCES) {
    addSource(f, `${PHONE_APP_DIR}/${f}`);
  }

  objects["PBXSourcesBuildPhase"][sourcesPhaseUuid] = {
    isa: "PBXSourcesBuildPhase",
    buildActionMask: 2147483647,
    files: sourcesFiles,
    runOnlyForDeploymentPostprocessing: 0,
  };
  objects["PBXSourcesBuildPhase"][`${sourcesPhaseUuid}_comment`] = "Sources";

  // ── Build configurations ────────────────────────────────────────────────────
  const buildSettings = {
    CODE_SIGN_STYLE: "Automatic",
    CURRENT_PROJECT_VERSION: 1,
    GENERATE_INFOPLIST_FILE: "YES",
    MARKETING_VERSION: "1.0",
    PRODUCT_BUNDLE_IDENTIFIER: `"${WATCH_BUNDLE_ID}.tests"`,
    PRODUCT_NAME: '"$(TARGET_NAME)"',
    SDKROOT: "watchos",
    SKIP_INSTALL: "YES",
    SWIFT_EMIT_LOC_STRINGS: "NO",
    SWIFT_VERSION: "5.0",
    TARGETED_DEVICE_FAMILY: '"1,2"',
    WATCHOS_DEPLOYMENT_TARGET: watchosDeploymentTarget,
  };

  const debugCfgUuid = project.generateUuid();
  objects["XCBuildConfiguration"][debugCfgUuid] = {
    isa: "XCBuildConfiguration",
    buildSettings: { ...buildSettings, DEBUG_INFORMATION_FORMAT: "dwarf" },
    name: "Debug",
  };
  objects["XCBuildConfiguration"][`${debugCfgUuid}_comment`] = "Debug";

  const releaseCfgUuid = project.generateUuid();
  objects["XCBuildConfiguration"][releaseCfgUuid] = {
    isa: "XCBuildConfiguration",
    buildSettings: { ...buildSettings },
    name: "Release",
  };
  objects["XCBuildConfiguration"][`${releaseCfgUuid}_comment`] = "Release";

  const cfgListUuid = project.generateUuid();
  objects["XCConfigurationList"][cfgListUuid] = {
    isa: "XCConfigurationList",
    buildConfigurations: [
      { value: debugCfgUuid, comment: "Debug" },
      { value: releaseCfgUuid, comment: "Release" },
    ],
    defaultConfigurationIsVisible: 0,
    defaultConfigurationName: "Release",
  };
  objects["XCConfigurationList"][`${cfgListUuid}_comment`] =
    `Build configuration list for PBXNativeTarget "${WATCH_TEST_TARGET_NAME}"`;

  // ── Native target ───────────────────────────────────────────────────────────
  const targetUuid = project.generateUuid();
  objects["PBXNativeTarget"][targetUuid] = {
    isa: "PBXNativeTarget",
    buildConfigurationList: cfgListUuid,
    buildConfigurationList_comment:
      `Build configuration list for PBXNativeTarget "${WATCH_TEST_TARGET_NAME}"`,
    buildPhases: [{ value: sourcesPhaseUuid, comment: "Sources" }],
    buildRules: [],
    dependencies: [],
    name: WATCH_TEST_TARGET_NAME,
    productName: WATCH_TEST_TARGET_NAME,
    productReference: productRefUuid,
    productReference_comment: `${WATCH_TEST_TARGET_NAME}.xctest`,
    productType: '"com.apple.product-type.bundle.unit-test"',
  };
  objects["PBXNativeTarget"][`${targetUuid}_comment`] = WATCH_TEST_TARGET_NAME;

  // ── Register in PBXProject targets ─────────────────────────────────────────
  const pbxProjectSection = objects["PBXProject"];
  const projKey = Object.keys(pbxProjectSection).find(
    (k) => !k.endsWith("_comment") && pbxProjectSection[k] &&
      typeof pbxProjectSection[k] === "object",
  );
  const projObj = pbxProjectSection[projKey];
  projObj.targets = projObj.targets || [];
  projObj.targets.push({ value: targetUuid, comment: WATCH_TEST_TARGET_NAME });

  // TargetAttributes: mark as a test target (no TestTargetID — logic tests).
  projObj.attributes = projObj.attributes || {};
  projObj.attributes.TargetAttributes = projObj.attributes.TargetAttributes || {};
  projObj.attributes.TargetAttributes[targetUuid] = { CreatedOnToolsVersion: "15.0" };

  // ── Add product to the Products group so Xcode shows it ────────────────────
  const groups = objects["PBXGroup"] || {};
  for (const [k, g] of Object.entries(groups)) {
    if (k.endsWith("_comment") || !g || typeof g !== "object") continue;
    const gName = (g.name || "").replace(/"/g, "");
    if (gName === "Products") {
      g.children = g.children || [];
      g.children.push({ value: productRefUuid, comment: `${WATCH_TEST_TARGET_NAME}.xctest` });
      break;
    }
  }

  console.log(`[Watch/Tests] Created ${WATCH_TEST_TARGET_NAME} target (${targetUuid})`);

  // Link WatchConnectivity.framework — compiling WatchSessionManager.swift into
  // the test bundle requires the framework to be linked explicitly (a separate
  // target does not inherit the Watch app's Frameworks phase).
  ensureWatchTestTargetFrameworks(project, targetUuid);

  return targetUuid;
}

/**
 * Ensures every WATCH_TEST_SOURCES / WATCH_TEST_PRODUCTION_SOURCES file is
 * compiled into the (already existing) test target's Sources phase.
 * Idempotent — skips files already present. Without this, a test suite added
 * after the target was first created would be copied to disk but never
 * compiled, silently skipping its assertions.
 */
function ensureWatchTestTargetSources(project, targetUuid) {
  const objects = project.hash.project.objects;
  const nts = project.pbxNativeTargetSection();
  const target = nts[targetUuid];
  if (!target) return;

  for (const section of ["PBXSourcesBuildPhase", "PBXFileReference", "PBXBuildFile"]) {
    if (!objects[section]) objects[section] = {};
  }
  const sourcesSection = objects["PBXSourcesBuildPhase"];
  const frs = project.pbxFileReferenceSection();

  // Locate the target's Sources phase.
  target.buildPhases = target.buildPhases || [];
  let sourcesPhaseUuid = null;
  for (const phase of target.buildPhases) {
    const uuid = typeof phase === "object" ? phase.value : phase;
    if (sourcesSection[uuid]) { sourcesPhaseUuid = uuid; break; }
  }
  if (!sourcesPhaseUuid) {
    sourcesPhaseUuid = project.generateUuid();
    sourcesSection[sourcesPhaseUuid] = {
      isa: "PBXSourcesBuildPhase",
      buildActionMask: 2147483647,
      files: [],
      runOnlyForDeploymentPostprocessing: 0,
    };
    sourcesSection[`${sourcesPhaseUuid}_comment`] = "Sources";
    target.buildPhases.push({ value: sourcesPhaseUuid, comment: "Sources" });
    console.log("[Watch/Tests] Created Sources build phase for test target");
  }
  const sourcesPhase = sourcesSection[sourcesPhaseUuid];
  if (!sourcesPhase.files) sourcesPhase.files = [];

  // Set of file-reference UUIDs already compiled by this phase.
  const compiledFileRefs = new Set();
  for (const entry of sourcesPhase.files) {
    const buildFileUuid = typeof entry === "object" ? entry.value : entry;
    const bf = objects["PBXBuildFile"][buildFileUuid];
    if (bf && bf.fileRef) compiledFileRefs.add(bf.fileRef);
  }

  const ensureSource = (fileName, filePath) => {
    // Find (or create) the file reference for this path.
    let fileRefUuid = null;
    for (const [k, v] of Object.entries(frs)) {
      if (k.endsWith("_comment") || !v || typeof v !== "object") continue;
      const p = v.path || v.name || "";
      if (p === `"${filePath}"` || p === filePath) { fileRefUuid = k; break; }
    }
    if (fileRefUuid && compiledFileRefs.has(fileRefUuid)) return; // already compiled
    if (!fileRefUuid) {
      fileRefUuid = project.generateUuid();
      objects["PBXFileReference"][fileRefUuid] = {
        isa: "PBXFileReference",
        lastKnownFileType: "sourcecode.swift",
        name: `"${fileName}"`,
        path: `"${filePath}"`,
        sourceTree: '"<group>"',
      };
      objects["PBXFileReference"][`${fileRefUuid}_comment`] = fileName;
    }
    const buildFileUuid = project.generateUuid();
    objects["PBXBuildFile"][buildFileUuid] = { isa: "PBXBuildFile", fileRef: fileRefUuid };
    objects["PBXBuildFile"][`${buildFileUuid}_comment`] = `${fileName} in Sources`;
    sourcesPhase.files.push({ value: buildFileUuid, comment: `${fileName} in Sources` });
    compiledFileRefs.add(fileRefUuid);
    console.log(`[Watch/Tests] Added ${fileName} to test target Sources`);
  };

  for (const f of WATCH_TEST_SOURCES) {
    ensureSource(f, `${WATCH_TEST_TARGET_NAME}/${f}`);
  }
  for (const f of WATCH_TEST_PRODUCTION_SOURCES) {
    ensureSource(f, `${WATCH_TARGET_NAME}/${f}`);
  }
  for (const f of PHONE_TEST_PRODUCTION_SOURCES) {
    ensureSource(f, `${PHONE_APP_DIR}/${f}`);
  }
}

/**
 * Ensures the test target has a Frameworks build phase linking the watchOS
 * WatchConnectivity.framework (SDKROOT-relative). Idempotent.
 */
function ensureWatchTestTargetFrameworks(project, targetUuid) {
  const objects = project.hash.project.objects;
  const nts = project.pbxNativeTargetSection();
  const target = nts[targetUuid];
  if (!target) return;

  for (const section of ["PBXFrameworksBuildPhase", "PBXFileReference", "PBXBuildFile"]) {
    if (!objects[section]) objects[section] = {};
  }
  const frameworksSection = objects["PBXFrameworksBuildPhase"];
  const buildFileSection = objects["PBXBuildFile"];
  const frs = project.pbxFileReferenceSection();

  // Locate (or create) the target's Frameworks phase.
  target.buildPhases = target.buildPhases || [];
  let frameworksPhaseUuid = null;
  for (const phase of target.buildPhases) {
    const uuid = typeof phase === "object" ? phase.value : phase;
    if (frameworksSection[uuid]) { frameworksPhaseUuid = uuid; break; }
  }
  if (!frameworksPhaseUuid) {
    frameworksPhaseUuid = project.generateUuid();
    frameworksSection[frameworksPhaseUuid] = {
      isa: "PBXFrameworksBuildPhase",
      buildActionMask: 2147483647,
      files: [],
      runOnlyForDeploymentPostprocessing: 0,
    };
    frameworksSection[`${frameworksPhaseUuid}_comment`] = "Frameworks";
    target.buildPhases.push({ value: frameworksPhaseUuid, comment: "Frameworks" });
    console.log("[Watch/Tests] Created Frameworks build phase for test target");
  }
  const frameworksPhase = frameworksSection[frameworksPhaseUuid];
  if (!frameworksPhase.files) frameworksPhase.files = [];

  const fwName = "WatchConnectivity.framework";
  const fwPath = "System/Library/Frameworks/WatchConnectivity.framework";

  // Reuse an existing SDKROOT-relative file reference when present.
  let fileRefUuid = null;
  for (const [k, v] of Object.entries(frs)) {
    if (k.endsWith("_comment") || !v || typeof v !== "object") continue;
    const p = (v.path || "").replace(/"/g, "");
    const st = (v.sourceTree || "").replace(/"/g, "");
    if (p === fwPath && st === "SDKROOT") { fileRefUuid = k; break; }
  }
  if (fileRefUuid) {
    // Idempotency: skip when already linked in this phase.
    const inPhase = frameworksPhase.files.some((ref) => {
      const bfUuid = typeof ref === "object" ? ref.value : ref;
      if (!bfUuid || bfUuid.endsWith("_comment")) return false;
      const bf = buildFileSection[bfUuid];
      if (!bf) return false;
      const fr = typeof bf.fileRef === "object" ? bf.fileRef.value : bf.fileRef;
      return fr === fileRefUuid;
    });
    if (inPhase) {
      console.log(`[Watch/Tests] ${fwName} already linked — skipping`);
      return;
    }
  } else {
    fileRefUuid = project.generateUuid();
    objects["PBXFileReference"][fileRefUuid] = {
      isa: "PBXFileReference",
      lastKnownFileType: "wrapper.framework",
      name: `"${fwName}"`,
      path: `"${fwPath}"`,
      sourceTree: "SDKROOT",
    };
    objects["PBXFileReference"][`${fileRefUuid}_comment`] = fwName;
  }

  const buildFileUuid = project.generateUuid();
  buildFileSection[buildFileUuid] = { isa: "PBXBuildFile", fileRef: fileRefUuid };
  buildFileSection[`${buildFileUuid}_comment`] = `${fwName} in Frameworks`;
  frameworksPhase.files.push({ value: buildFileUuid, comment: `${fwName} in Frameworks` });
  console.log(`[Watch/Tests] Linked ${fwName} to ${WATCH_TEST_TARGET_NAME}`);
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
      // Match any BuildActionEntry block (across multiple lines) that references
      // the Watch target by BlueprintName. The opening tag spans multiple lines
      // (attribute-per-line format), so [^>]* would not match; use [\s\S]*? instead.
      const watchEntryRegex =
        /[ \t]*<BuildActionEntry[\s\S]*?BlueprintName\s*=\s*"PregnancyWatchApp"[\s\S]*?<\/BuildActionEntry>\n?/g;
      const before = schemeXml;
      schemeXml = schemeXml.replace(watchEntryRegex, "");
      if (schemeXml !== before) {
        console.log("[Watch/Scheme] Removed stale Watch BuildActionEntry");
      }

      // 3. Inject the Watch entry as the FIRST item in BuildActionEntries.
      //    Without a PBXTargetDependency, Xcode builds scheme entries in the
      //    order they appear. Watch must be first so it compiles before the
      //    iOS app's "Embed Watch App" shell script runs.
      //    buildForArchiving = YES ensures it compiles during `xcodebuild archive`.
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

      if (!schemeXml.includes("<BuildActionEntries>")) {
        console.warn("[Watch/Scheme] <BuildActionEntries> marker not found — scheme may be malformed");
        return config;
      }

      // Insert Watch BEFORE the first existing BuildActionEntry (after the
      // opening <BuildActionEntries> tag) so it is first in the build order.
      schemeXml = schemeXml.replace(
        /(<BuildActionEntries>\s*\n)/,
        `$1${watchEntry}`,
      );

      // 4. Register the watch unit-test bundle in the TestAction so
      //    `xcodebuild test -scheme <app>` builds and runs it.
      const testTargetUuid = Object.keys(nts).find((key) => {
        if (key.endsWith("_comment")) return false;
        const t = nts[key];
        return t && typeof t === "object" &&
          (t.name === WATCH_TEST_TARGET_NAME || t.name === `"${WATCH_TEST_TARGET_NAME}"`);
      });
      if (testTargetUuid) {
        // Strip any stale entry (idempotency).
        const testableRegex =
          /[ \t]*<TestableReference[\s\S]*?BlueprintName\s*=\s*"PregnancyWatchAppTests"[\s\S]*?<\/TestableReference>\n?/g;
        schemeXml = schemeXml.replace(testableRegex, "");

        const testableEntry =
          `      <TestableReference\n` +
          `         skipped = "NO">\n` +
          `         <BuildableReference\n` +
          `            BuildableIdentifier = "primary"\n` +
          `            BlueprintIdentifier = "${testTargetUuid}"\n` +
          `            BuildableName = "${WATCH_TEST_TARGET_NAME}.xctest"\n` +
          `            BlueprintName = "${WATCH_TEST_TARGET_NAME}"\n` +
          `            ReferencedContainer = "container:${projectName}.xcodeproj">\n` +
          `         </BuildableReference>\n` +
          `      </TestableReference>\n`;

        if (schemeXml.includes("<Testables>")) {
          schemeXml = schemeXml.replace(/(<Testables>\s*\n)/, `$1${testableEntry}`);
        } else if (schemeXml.includes("<Testables/>")) {
          schemeXml = schemeXml.replace(
            "<Testables/>",
            `<Testables>\n${testableEntry}   </Testables>`,
          );
        } else {
          console.warn("[Watch/Scheme] No <Testables> section found — test action not wired");
        }
        console.log(`[Watch/Scheme] Registered ${WATCH_TEST_TARGET_NAME} in TestAction Testables`);
      } else {
        console.warn("[Watch/Scheme] Test target not found — skipping Testables entry");
      }

      fs.writeFileSync(schemePath, schemeXml, "utf8");
      console.log(
        `[Watch/Scheme] Inserted Watch BuildActionEntry FIRST (UUID: ${watchTargetUuid}, buildForArchiving=YES)`,
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
//
// Scheme-only scheduling + shell script embed:
//   1. addTarget("watch2_app") auto-creates: dep + scheme entry + embed copy phase
//   2. withWatchXcodeTarget strips the dep and copy phase, adds shell script embed
//   3. withWatchScheme strips any auto-added Watch scheme entry and re-injects it
//      FIRST in BuildActionEntries (so Watch builds before the iOS app)
//
// LIFO execution order (last applied = first executed):
//   withWatchXcodeTarget → runs first:  creates Watch, strips dep + copy phase, adds shell script
//   withWatchScheme      → runs second: strips auto-added Watch entry, re-injects it first
//   withWatchFiles       → runs third:  copies Swift source files
module.exports = (config) => {
  config = withWatchFiles(config);
  config = withWatchScheme(config);      // applied second → executes second
  config = withWatchXcodeTarget(config); // applied last   → executes first
  return config;
};

// Exposed for scripts/tests that need to apply the same pbxproj mutations
// outside the expo prebuild pipeline (e.g. syncing the committed ios/ project).
module.exports._internals = {
  ensureWatchTestTarget,
  ensureWatchSourcesInWatchTarget,
  addPhoneBridgeToMainTarget,
  WATCH_TEST_TARGET_NAME,
  WATCH_TEST_SOURCES,
  WATCH_TEST_PRODUCTION_SOURCES,
  PHONE_BRIDGE_SOURCES,
  PHONE_APP_DIR,
  WATCH_TARGET_NAME,
};
