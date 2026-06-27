/**
 * check-whats-new
 *
 * Validates that the version declared in the mobile app's app.json has a
 * matching entry in constants/whatsNew.ts. Run this before every release to
 * catch the "forgot to add What's New copy" mistake early.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run check-whats-new
 *
 * Exit codes:
 *   0 — version is covered, all good
 *   1 — version is missing from WHATS_NEW (release is blocked)
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");

// ── Core validation (exported for tests) ─────────────────────────────────────

export interface CheckResult {
  ok: boolean;
  message: string;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Pure validation logic — accepts file contents as strings so tests can pass
 * fixture data without touching the filesystem.
 */
export function checkWhatsNew(
  appJsonContent: string,
  whatsNewContent: string,
): CheckResult {
  let appVersion: string;
  try {
    const json = JSON.parse(appJsonContent) as { expo?: { version?: string } };
    appVersion = json?.expo?.version ?? "";
  } catch {
    return { ok: false, message: "❌  app.json is not valid JSON" };
  }

  if (!appVersion) {
    return {
      ok: false,
      message: "❌  expo.version is missing or empty in app.json",
    };
  }

  // Match   "1.0.2":   or   '1.0.2':   as an object key in the WHATS_NEW map.
  // This intentionally avoids executing the TS file so the script stays fast and
  // dependency-free. It is resilient to minor formatting changes.
  const keyPattern = new RegExp(
    `(['"])\\s*${escapeRegex(appVersion)}\\s*\\1\\s*:`,
  );

  if (!keyPattern.test(whatsNewContent)) {
    return {
      ok: false,
      message: `
❌  What's New entry missing for version ${appVersion}

  app.json declares version "${appVersion}" but constants/whatsNew.ts has no
  matching key. Users who upgrade to this build will see nothing.

  To fix:
    1. Open artifacts/pregnancy-calculator-mobile/constants/whatsNew.ts
    2. Add an entry for "${appVersion}" to the WHATS_NEW object:

       "${appVersion}": {
         headline: "What's new in this update",
         items: [
           {
             icon: "sparkles-outline",
             title: "Your change title here",
             body: "Short description of what changed and why it matters.",
           },
         ],
       },

    3. Re-run this check to confirm: pnpm --filter @workspace/scripts run check-whats-new
`,
    };
  }

  return {
    ok: true,
    message: `✅  What's New entry found for version ${appVersion} — good to ship.`,
  };
}

// ── CLI entry point ───────────────────────────────────────────────────────────

function runCli(): void {
  // Allow tests (and CI) to override the file paths via env vars so the script
  // can be exercised against fixture files without touching real repo artifacts.
  const appJsonPath =
    process.env.CHECK_WHATS_NEW_APP_JSON_PATH ??
    path.join(REPO_ROOT, "artifacts/pregnancy-calculator-mobile/app.json");

  let appJsonContent: string;
  try {
    appJsonContent = fs.readFileSync(appJsonPath, "utf8");
  } catch (err) {
    console.error(`❌  Could not read app.json at ${appJsonPath}:`, err);
    process.exit(1);
  }

  const whatsNewPath =
    process.env.CHECK_WHATS_NEW_WHATS_NEW_PATH ??
    path.join(
      REPO_ROOT,
      "artifacts/pregnancy-calculator-mobile/constants/whatsNew.ts",
    );

  let whatsNewContent: string;
  try {
    whatsNewContent = fs.readFileSync(whatsNewPath, "utf8");
  } catch (err) {
    console.error(`❌  Could not read whatsNew.ts at ${whatsNewPath}:`, err);
    process.exit(1);
  }

  const result = checkWhatsNew(appJsonContent, whatsNewContent);
  if (result.ok) {
    console.log(result.message);
    process.exit(0);
  } else {
    console.error(result.message);
    process.exit(1);
  }
}

// Only run when this file is the entry point, not when imported by tests.
const isMain =
  process.argv[1] != null &&
  path.resolve(process.argv[1]) ===
    path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  runCli();
}
