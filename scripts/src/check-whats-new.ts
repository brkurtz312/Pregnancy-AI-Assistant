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

// ── 1. Read the current app version from app.json ───────────────────────────

const appJsonPath = path.join(
  REPO_ROOT,
  "artifacts/pregnancy-calculator-mobile/app.json",
);

let appVersion: string;
try {
  const raw = fs.readFileSync(appJsonPath, "utf8");
  const json = JSON.parse(raw) as { expo?: { version?: string } };
  appVersion = json?.expo?.version ?? "";
} catch (err) {
  console.error(`❌  Could not read app.json at ${appJsonPath}:`, err);
  process.exit(1);
}

if (!appVersion) {
  console.error("❌  expo.version is missing or empty in app.json");
  process.exit(1);
}

// ── 2. Check that WHATS_NEW has a key for this version ──────────────────────

const whatsNewPath = path.join(
  REPO_ROOT,
  "artifacts/pregnancy-calculator-mobile/constants/whatsNew.ts",
);

let whatsNewSource: string;
try {
  whatsNewSource = fs.readFileSync(whatsNewPath, "utf8");
} catch (err) {
  console.error(`❌  Could not read whatsNew.ts at ${whatsNewPath}:`, err);
  process.exit(1);
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Match   "1.0.2":   or   '1.0.2':   as an object key in the WHATS_NEW map.
// This intentionally avoids executing the TS file so the script stays fast and
// dependency-free. It is resilient to minor formatting changes.
const keyPattern = new RegExp(
  `(['"])\\s*${escapeRegex(appVersion)}\\s*\\1\\s*:`,
);

if (!keyPattern.test(whatsNewSource)) {
  console.error(`
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
`);
  process.exit(1);
}

console.log(
  `✅  What's New entry found for version ${appVersion} — good to ship.`,
);
process.exit(0);
