#!/usr/bin/env node
/**
 * verify-eas-archive.js
 *
 * Downloads the latest successful EAS iOS *production* build and inspects its
 * .ipa to confirm PregnancyWatchApp.app is present at the expected path.
 *
 * Used by the Watch embed-script test suite (withWatchExtension-embedScript.test.ts)
 * when EXPO_TOKEN is available, and can be run standalone in the release pipeline:
 *
 *   node scripts/verify-eas-archive.js
 *   node scripts/verify-eas-archive.js --build-id <uuid>   # exact build
 *   node scripts/verify-eas-archive.js --ipa /path/to/app.ipa
 *
 * Exit codes:
 *   0 — Watch app confirmed at expected path
 *   1 — Watch app missing or verification failed
 *   2 — No credentials and no local IPA (skipped)
 */

"use strict";

const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");

// ─── Constants ───────────────────────────────────────────────────────────────

const WATCH_APP_NAME = "PregnancyWatchApp";
const IOS_APP_NAME = "PregnancyAIAssistant";
const EXPECTED_WATCH_PATH = `Payload/${IOS_APP_NAME}.app/Watch/${WATCH_APP_NAME}.app/`;
const EXPECTED_BINARY = `Payload/${IOS_APP_NAME}.app/Watch/${WATCH_APP_NAME}.app/${WATCH_APP_NAME}`;
const EXPECTED_BUILD_PROFILE = "production";
const EXPECTED_DISTRIBUTION = "STORE";

const ICON_FILES = [
  "AppIcon-58.png",
  "AppIcon-80.png",
  "AppIcon-87.png",
  "AppIcon-88.png",
  "AppIcon-100.png",
  "AppIcon-102.png",
  "AppIcon-108.png",
  "AppIcon-172.png",
  "AppIcon-196.png",
  "AppIcon-216.png",
  "AppIcon-234.png",
  "AppIcon-1024.png",
];

// ─── CLI args ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const buildIdFlagIdx = args.indexOf("--build-id");
const ipaFlagIdx = args.indexOf("--ipa");

const explicitBuildId = buildIdFlagIdx !== -1 ? args[buildIdFlagIdx + 1] : null;
const explicitIpa = ipaFlagIdx !== -1 ? args[ipaFlagIdx + 1] : null;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function log(msg) {
  process.stdout.write(`[verify-eas-archive] ${msg}\n`);
}
function warn(msg) {
  process.stderr.write(`[verify-eas-archive] WARN: ${msg}\n`);
}
function err(msg) {
  process.stderr.write(`[verify-eas-archive] ERROR: ${msg}\n`);
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    let redirects = 0;
    function follow(u) {
      if (redirects > 10) {
        reject(new Error("Too many redirects"));
        return;
      }
      const proto = u.startsWith("https") ? https : http;
      proto
        .get(u, (res) => {
          // Follow all 3xx redirects
          if (
            res.statusCode >= 300 &&
            res.statusCode < 400 &&
            res.headers.location
          ) {
            redirects++;
            res.resume(); // discard redirect body so socket is released
            follow(res.headers.location);
            return;
          }
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode} for ${u}`));
            return;
          }
          res.pipe(file);
          file.on("finish", () => file.close(resolve));
          file.on("error", reject);
        })
        .on("error", reject);
    }
    follow(url);
  });
}

function listIpaEntries(ipaPath) {
  const output = execFileSync("unzip", ["-l", ipaPath], {
    stdio: "pipe",
  }).toString();
  return output
    .split("\n")
    .map((l) => {
      const parts = l.trim().split(/\s+/);
      return parts[parts.length - 1] ?? "";
    })
    .filter(Boolean);
}

/**
 * Retrieve build metadata from EAS.
 *
 * When explicitBuildId is provided, uses `eas build:view <id>` to fetch that
 * exact build. Otherwise lists recent production builds and picks the most
 * recent FINISHED one.
 *
 * eas build:view returns a single object; eas build:list returns an array.
 */
function getBuildInfo() {
  const scriptDir = path.dirname(__filename);
  const projectRoot = path.resolve(scriptDir, "..");

  let raw;

  if (explicitBuildId) {
    // Exact-build retrieval: eas build:view <BUILD_ID> --json
    // Positional argument — eas-cli 21.x does not support a --build-id flag.
    raw = execFileSync("eas", ["build:view", explicitBuildId, "--json"], {
      cwd: projectRoot,
      stdio: "pipe",
      env: { ...process.env },
    }).toString();

    // build:view output may include version warnings before the JSON object
    const jsonStart = raw.indexOf("{");
    if (jsonStart === -1) throw new Error("eas build:view returned no JSON");
    const buildObj = JSON.parse(raw.slice(jsonStart));
    return buildObj;
  }

  // List mode: filter to production profile explicitly so we never inspect a
  // dev/preview archive by mistake.
  raw = execFileSync(
    "eas",
    [
      "build:list",
      "--platform",
      "ios",
      "--build-profile",
      EXPECTED_BUILD_PROFILE,
      "--limit",
      "5",
      "--non-interactive",
      "--json",
    ],
    {
      cwd: projectRoot,
      stdio: "pipe",
      env: { ...process.env },
    },
  ).toString();

  const jsonStart = raw.indexOf("[");
  if (jsonStart === -1) throw new Error("eas build:list returned no JSON");
  const builds = JSON.parse(raw.slice(jsonStart));
  const finished = builds.find((b) => b.status === "FINISHED");
  if (!finished) {
    throw new Error(
      "No FINISHED iOS production build found in the last 5 builds",
    );
  }
  return finished;
}

/** Assert the build is a production store archive before downloading it. */
function assertBuildMetadata(buildInfo) {
  const profile = buildInfo.buildProfile ?? "";
  const distribution = buildInfo.distribution ?? "";
  const status = buildInfo.status ?? "";

  if (status !== "FINISHED") {
    throw new Error(`Build status is '${status}', expected FINISHED`);
  }
  if (
    profile.toLowerCase() !== EXPECTED_BUILD_PROFILE &&
    // eas build:view may return null for buildProfile on older builds
    profile !== ""
  ) {
    throw new Error(
      `Build profile is '${profile}', expected '${EXPECTED_BUILD_PROFILE}'`,
    );
  }
  if (
    distribution.toUpperCase() !== EXPECTED_DISTRIBUTION &&
    distribution !== ""
  ) {
    throw new Error(
      `Build distribution is '${distribution}', expected '${EXPECTED_DISTRIBUTION}'`,
    );
  }

  log(
    `Build metadata OK — id: ${buildInfo.id}, profile: ${profile || "(unset)"}, distribution: ${distribution || "(unset)"}, status: ${status}`,
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  let ipaPath = explicitIpa;
  let buildInfo = null;

  // ── Step 1: resolve the IPA ───────────────────────────────────────────────

  if (!ipaPath) {
    const hasToken = !!process.env.EXPO_TOKEN;
    const cachedIpa = "/tmp/eas-verify-app.ipa";

    if (!hasToken) {
      // Try cached path from a previous download
      if (fs.existsSync(cachedIpa)) {
        ipaPath = cachedIpa;
        log(`Using cached IPA: ${ipaPath}`);
      } else {
        warn("EXPO_TOKEN not set and no cached IPA — verification skipped");
        warn("Set EXPO_TOKEN or provide --ipa <path> to enable verification");
        process.exit(2);
      }
    } else {
      // Authenticated: get production build and download its IPA
      log("Fetching latest EAS iOS production build…");
      buildInfo = getBuildInfo();

      // Assert metadata before downloading — fail fast on wrong profile/dist
      assertBuildMetadata(buildInfo);

      const ipaUrl =
        buildInfo.artifacts?.buildUrl ||
        buildInfo.artifacts?.applicationArchiveUrl;
      if (!ipaUrl) throw new Error("Build has no IPA artifact URL");

      log(
        `Build: ${buildInfo.id} (${buildInfo.status}, ${buildInfo.appVersion}/${buildInfo.appBuildVersion})`,
      );
      log(`Commit: ${buildInfo.gitCommitHash}`);
      log(`Downloading IPA…`);

      ipaPath = cachedIpa;
      await downloadFile(ipaUrl, ipaPath);
      const sizeMb = (fs.statSync(ipaPath).size / 1048576).toFixed(1);
      log(`Downloaded ${sizeMb} MB → ${ipaPath}`);
    }
  }

  // ── Step 2: inspect the IPA ───────────────────────────────────────────────

  log(`Inspecting IPA: ${ipaPath}`);
  const entries = listIpaEntries(ipaPath);

  let failed = false;

  // Watch app directory
  if (entries.includes(EXPECTED_WATCH_PATH)) {
    log(`✓ Watch app directory: ${EXPECTED_WATCH_PATH}`);
  } else {
    err(`✗ Watch app directory NOT FOUND: ${EXPECTED_WATCH_PATH}`);
    failed = true;
  }

  // Watch binary
  if (entries.includes(EXPECTED_BINARY)) {
    log(`✓ Watch binary: ${WATCH_APP_NAME}`);
  } else {
    err(`✗ Watch binary NOT FOUND: ${EXPECTED_BINARY}`);
    failed = true;
  }

  // Code signature
  const hasSig = entries.some((e) =>
    e.startsWith(
      `Payload/${IOS_APP_NAME}.app/Watch/${WATCH_APP_NAME}.app/_CodeSignature/`,
    ),
  );
  if (hasSig) {
    log("✓ _CodeSignature present (Watch bundle is code-signed)");
  } else {
    err("✗ _CodeSignature missing from Watch bundle");
    failed = true;
  }

  // Icon PNGs
  const base = `Payload/${IOS_APP_NAME}.app/Watch/${WATCH_APP_NAME}.app/`;
  const missingIcons = ICON_FILES.filter((f) => !entries.includes(base + f));
  if (missingIcons.length === 0) {
    log(
      `✓ All ${ICON_FILES.length} AppIcon-*.png files present in Watch bundle`,
    );
  } else {
    warn(`Missing icon PNGs in Watch bundle: ${missingIcons.join(", ")}`);
    // Warn but don't fail — icons may be injected differently by Apple
  }

  if (failed) {
    err("IPA verification FAILED — Watch app not embedded correctly");
    process.exit(1);
  }

  log("IPA verification PASSED — Watch app embedded at correct path");
  if (buildInfo) {
    log(`Build: ${buildInfo.id} | ${buildInfo.createdAt}`);
  }
  process.exit(0);
}

main().catch((e) => {
  err(e.message ?? String(e));
  process.exit(1);
});
