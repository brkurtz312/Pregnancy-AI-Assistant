/**
 * Generates a new reviewer access code and stores it in the database.
 *
 * The API server reads app_config.reviewer_access_code at request time, so this
 * rotation takes effect immediately — no redeployment required.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run rotate-reviewer-code
 *
 * After running:
 *   1. Copy the printed code into the App Store Connect review notes, in the
 *      "Access Code" step — not the demo-account password field. It is a
 *      post-sign-in Full Pregnancy Pass unlock code, not a Clerk password.
 *   2. Do not also set REVIEWER_ACCESS_CODE or DEV_ACCESS_CODE to it. Those are
 *      the fallbacks the server uses when no row is stored; leaving a stale one
 *      behind means two answers to "what is the code" and no sign of which the
 *      server picked.
 *   3. Verify with `check-reviewer-pass`, which resolves the same chain.
 *
 * Requires:
 *   DATABASE_URL — must point at the *production* database. The Replit
 *   workspace Shell's DATABASE_URL is the development one, so a run from there
 *   updates the wrong app_config and reports success. The host is printed
 *   below; check it before trusting the result.
 */

import { randomBytes } from "node:crypto";
import { db, appConfigTable } from "@workspace/db";
import { sql } from "drizzle-orm";

/** Host only — the URL carries credentials. */
function databaseHost(): string {
  try {
    return new URL(process.env.DATABASE_URL ?? "").host || "unknown";
  } catch {
    return "unknown";
  }
}

async function main() {
  const newCode = randomBytes(16).toString("hex"); // 32-char hex string

  await db
    .insert(appConfigTable)
    .values({ key: "reviewer_access_code", value: newCode })
    .onConflictDoUpdate({
      target: appConfigTable.key,
      set: { value: newCode, updatedAt: sql`now()` },
    });

  console.log("\n✅ Reviewer access code rotated — effective immediately.\n");
  console.log(`   New code: ${newCode}`);
  console.log(
    `   Written to: app_config.reviewer_access_code on ${databaseHost()}\n`,
  );
  console.log("   ── Next steps (required) ────────────────────────────────");
  console.log(
    "   1. Put this code in the App Store Connect review notes, in the",
  );
  console.log(
    "      'Access Code' step. It is NOT the demo-account password: a reviewer",
  );
  console.log(
    "      signs in with the Clerk credentials first, then redeems this from",
  );
  console.log("      Profile → Access Code to unlock the pass.");
  console.log(
    "   2. Do NOT also set REVIEWER_ACCESS_CODE or DEV_ACCESS_CODE to it.",
  );
  console.log(
    "      The stored row wins; a stale env var is a second answer nobody reads.",
  );
  console.log(
    "   3. Confirm the host above is the production database, then run",
  );
  console.log("      check-reviewer-pass to verify.");
  console.log("   ─────────────────────────────────────────────────────────\n");

  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
