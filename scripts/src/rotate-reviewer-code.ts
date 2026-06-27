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
 *   3. Update App Store Connect → Your App → App Review Information →
 *      Demo Account Password with this code.
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
    "   2. Update App Store Connect → Your App → App Review Information →",
  );
  console.log(
    "      Demo Account Password with this code so the reviewer can sign in.",
  );
  console.log("   ─────────────────────────────────────────────────────────\n");

  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
