#!/usr/bin/env node
// Guards against Watch source drift: the canonical Swift sources live in
// watchapp/ but must be byte-identical copies in ios/ to be compiled by Xcode.
// If a developer edits watchapp/ and forgets to sync ios/, the built app
// silently ships the old behavior — no compile error, no test failure.
//
// Usage:
//   node scripts/check-watch-sync.js          # verify (CI mode, exits 1 on drift)
//   node scripts/check-watch-sync.js --fix    # copy watchapp/ → ios/ counterparts
//
// This runs as part of `pnpm run typecheck` for this package so it cannot be
// skipped. After --fix, also run `node scripts/sync-watch-test-target.js` if
// you added/renamed test suites (it registers them in project.pbxproj).

const fs = require("fs");
const path = require("path");

const projectRoot = path.join(__dirname, "..");
const watchappDir = path.join(projectRoot, "watchapp");
const iosRoot = path.join(projectRoot, "ios");

const APP_DIR = "PregnancyAIAssistant";
const WATCH_DIR = "PregnancyWatchApp";
const TEST_DIR = "PregnancyWatchAppTests";

// Files compiled into the *phone* app target rather than the Watch target.
const PHONE_SIDE_FILES = new Set([
  "PhoneWatchBridge.swift",
  "PhoneWatchMessageDispatcher.swift",
  "WatchConnectivityModule.swift",
]);

/** Maps a canonical watchapp/ Swift file to its ios/ counterpart path. */
function iosCounterpart(basename) {
  if (PHONE_SIDE_FILES.has(basename)) {
    return path.join(iosRoot, APP_DIR, basename);
  }
  if (basename.endsWith("Tests.swift")) {
    return path.join(iosRoot, TEST_DIR, basename);
  }
  return path.join(iosRoot, WATCH_DIR, basename);
}

const fix = process.argv.includes("--fix");

// ios/ is a gitignored `expo prebuild` artifact, so it is absent on every
// clean checkout — including CI. There is no drift to detect when there are no
// copies to drift from, so skip rather than fail. `--fix` still runs: that is
// how the copies get created in the first place.
if (!fix && !fs.existsSync(iosRoot)) {
  console.log(
    `watch-sync skipped: ${path.relative(projectRoot, iosRoot)} is absent ` +
      "(run `expo prebuild` to generate it). Nothing to compare against.",
  );
  process.exit(0);
}

const swiftFiles = fs
  .readdirSync(watchappDir)
  .filter((f) => f.endsWith(".swift"))
  .sort();

if (swiftFiles.length === 0) {
  console.error(`No Swift sources found in ${watchappDir} — aborting.`);
  process.exit(1);
}

const problems = [];

for (const file of swiftFiles) {
  const src = path.join(watchappDir, file);
  const dest = iosCounterpart(file);
  const rel = path.relative(projectRoot, dest);

  const destExists = fs.existsSync(dest);
  const inSync =
    destExists &&
    fs.readFileSync(src, "utf8") === fs.readFileSync(dest, "utf8");

  if (inSync) continue;

  if (fix) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    console.log(`synced watchapp/${file} → ${rel}`);
  } else {
    problems.push(destExists ? `OUT OF SYNC: ${rel}` : `MISSING COPY:  ${rel}`);
  }
}

// Also flag ios/ Swift files that have no canonical source in watchapp/ —
// an edit made directly in ios/PregnancyWatchApp or ios/PregnancyWatchAppTests
// would be overwritten by the next sync, so it must be moved to watchapp/.
for (const dir of [WATCH_DIR, TEST_DIR]) {
  const abs = path.join(iosRoot, dir);
  if (!fs.existsSync(abs)) continue;
  for (const file of fs.readdirSync(abs)) {
    if (!file.endsWith(".swift")) continue;
    if (!fs.existsSync(path.join(watchappDir, file))) {
      problems.push(
        `ORPHAN COPY:   ios/${dir}/${file} has no canonical source in watchapp/ — ` +
          `move it to watchapp/ (it would be lost on the next sync)`,
      );
    }
  }
}

if (problems.length > 0) {
  console.error(
    "\nWatch source drift detected — ios/ copies differ from canonical watchapp/ sources:\n",
  );
  for (const p of problems) console.error(`  ${p}`);
  console.error(
    "\nFix with:\n" +
      "  cd artifacts/pregnancy-calculator-mobile\n" +
      "  node scripts/check-watch-sync.js --fix\n" +
      "  node scripts/sync-watch-test-target.js   # only if test suites were added/renamed\n",
  );
  process.exit(1);
}

console.log(
  `watch-sync OK: ${swiftFiles.length} canonical Swift files match their ios/ copies`,
);
