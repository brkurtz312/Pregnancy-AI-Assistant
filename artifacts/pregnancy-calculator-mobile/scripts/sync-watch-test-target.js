#!/usr/bin/env node
// Syncs the committed ios/ Xcode project with the Watch unit-test target that
// plugins/withWatchExtension.js creates at prebuild time. Run after adding or
// renaming Watch test suites so the checked-in project stays buildable:
//
//   node scripts/sync-watch-test-target.js
//
// It (1) copies watchapp Swift sources into ios/PregnancyWatchApp and the
// XCTest suites into ios/PregnancyWatchAppTests, (2) registers the
// PregnancyWatchAppTests unit-test bundle in project.pbxproj, and (3) wires it
// into the shared scheme's TestAction.

const fs = require("fs");
const path = require("path");

const projectRoot = path.join(__dirname, "..");
const iosRoot = path.join(projectRoot, "ios");
const APP_NAME = "PregnancyAIAssistant";

// Resolve the xcode lib through @expo/config-plugins (pnpm strict isolation).
const configPluginsDir = path.dirname(
  require.resolve("@expo/config-plugins/package.json", {
    paths: [projectRoot],
  }),
);
const xcode = require(require.resolve("xcode", { paths: [configPluginsDir] }));

const {
  ensureWatchTestTarget,
  ensureWatchSourcesInWatchTarget,
  addPhoneBridgeToMainTarget,
  WATCH_TEST_TARGET_NAME,
  WATCH_TEST_SOURCES,
  PHONE_BRIDGE_SOURCES,
  PHONE_APP_DIR,
  WATCH_TARGET_NAME,
} = require(
  path.join(projectRoot, "plugins", "withWatchExtension.js"),
)._internals;

const sourceDir = path.join(projectRoot, "watchapp");

// ── 1. Copy sources ──────────────────────────────────────────────────────────
const watchDir = path.join(iosRoot, WATCH_TARGET_NAME);
for (const file of fs.readdirSync(watchDir)) {
  const src = path.join(sourceDir, file);
  if (file.endsWith(".swift") && fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(watchDir, file));
    console.log(`copied ${file} → ios/${WATCH_TARGET_NAME}`);
  }
}
// New production files not yet present in ios/ (e.g. WatchSessionPersistence.swift)
for (const file of ["WatchSessionPersistence.swift"]) {
  const src = path.join(sourceDir, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(watchDir, file));
    console.log(`copied ${file} → ios/${WATCH_TARGET_NAME}`);
  }
}

const testDir = path.join(iosRoot, WATCH_TEST_TARGET_NAME);
fs.mkdirSync(testDir, { recursive: true });
for (const file of WATCH_TEST_SOURCES) {
  const src = path.join(sourceDir, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(testDir, file));
    console.log(`copied ${file} → ios/${WATCH_TEST_TARGET_NAME}`);
  } else {
    console.warn(`MISSING test source: ${src}`);
  }
}

// ── 2. pbxproj: watch sources + test target ─────────────────────────────────
const pbxPath = path.join(iosRoot, `${APP_NAME}.xcodeproj`, "project.pbxproj");
const project = xcode.project(pbxPath);
project.parseSync();

// Ensure new production sources (WatchSessionPersistence.swift) are compiled
// into the Watch app target.
const nts = project.pbxNativeTargetSection();
const watchUuid = Object.keys(nts).find((k) => {
  if (k.endsWith("_comment")) return false;
  const t = nts[k];
  return (
    t &&
    typeof t === "object" &&
    (t.name === WATCH_TARGET_NAME || t.name === `"${WATCH_TARGET_NAME}"`)
  );
});
if (watchUuid) {
  ensureWatchSourcesInWatchTarget(project, watchUuid);
} else {
  console.warn("Watch app target not found — skipped source registration");
}

// Ensure phone-side bridge sources (incl. PhoneWatchMessageDispatcher.swift)
// are copied and compiled into the main iOS app target so the committed
// project builds without waiting for an Expo prebuild.
const phoneDir = path.join(iosRoot, PHONE_APP_DIR);
for (const file of PHONE_BRIDGE_SOURCES) {
  const src = path.join(sourceDir, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(phoneDir, file));
    console.log(`copied ${file} → ios/${PHONE_APP_DIR}`);
  }
}
addPhoneBridgeToMainTarget(project, PHONE_APP_DIR);

const testTargetUuid = ensureWatchTestTarget(project);
fs.writeFileSync(pbxPath, project.writeSync(), "utf8");
console.log(`wrote ${pbxPath}`);

// ── 3. Scheme: TestAction Testables entry ────────────────────────────────────
const schemePath = path.join(
  iosRoot,
  `${APP_NAME}.xcodeproj`,
  "xcshareddata",
  "xcschemes",
  `${APP_NAME}.xcscheme`,
);
if (fs.existsSync(schemePath) && testTargetUuid) {
  let schemeXml = fs.readFileSync(schemePath, "utf8");
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
    `            ReferencedContainer = "container:${APP_NAME}.xcodeproj">\n` +
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
    console.warn("No <Testables> section in scheme");
  }
  fs.writeFileSync(schemePath, schemeXml, "utf8");
  console.log(`wrote ${schemePath}`);
}
console.log("done");
