/**
 * Generates a new reviewer access code and stores it in the database.
 * The API server reads the code from the database at request time, so this
 * rotation takes effect immediately — no redeployment required.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run rotate-reviewer-code
 *
 * After running:
 *   1. Copy the printed code.
 *   2. Save it in Replit Secrets as REVIEWER_ACCESS_CODE — this is the
 *      authoritative record and the safe location outside the codebase.
 *      (Tools → Secrets in the Replit workspace sidebar.)
 *   3. Give the code only as a post-sign-in Full Pregnancy Pass unlock code.
 *      It is not a Clerk password and must not be entered in App Store Connect
 *      as a demo-account password.
 *
 * Requires:
 *   DATABASE_URL  — provided automatically by Replit
 */

import { randomBytes } from "node:crypto";
import { db, appConfigTable } from "@workspace/db";
import { sql } from "drizzle-orm";

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
  console.log(`   New code: ${newCode}\n`);
  console.log("   ── Next steps (required) ────────────────────────────────");
  console.log(
    "   1. Save this code in Replit Secrets as REVIEWER_ACCESS_CODE.",
  );
  console.log(
    "      This is the authoritative record and keeps the code out of the codebase.",
  );
  console.log(
    "      Open the workspace sidebar → Tools → Secrets → add REVIEWER_ACCESS_CODE.",
  );
  console.log(
    "   2. Never use this as an App Store Connect demo-account password.",
  );
  console.log(
    "      A reviewer must first sign in with the separate Production demo account,",
  );
  console.log(
    "      then enter this code from Profile → Redeem access code to unlock the pass.",
  );
  console.log("   ─────────────────────────────────────────────────────────\n");

  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
