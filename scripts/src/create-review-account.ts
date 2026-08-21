/**
 * Displays the current reviewer pass-unlock configuration status.
 *
 * The reviewer access code is not a sign-in password. It unlocks the pass
 * after a reviewer has signed in to their own Production Clerk account.
 *
 * What this script does now:
 *   - Checks whether a reviewer access code is configured
 *   - Confirms the Clerk secret key is present
 *   - Prints setup instructions if anything is missing
 *
 * To set or rotate the access code, run:
 *   pnpm --filter @workspace/scripts run rotate-reviewer-code
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run create-review-account
 *
 * Requires:
 *   DATABASE_URL      — provided automatically by Replit
 *   CLERK_SECRET_KEY  — must be set for reviewer pass redemption to work
 */

import { db } from "@workspace/db";
import { appConfigTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

async function getConfig(key: string): Promise<string | null> {
  try {
    const [row] = await db
      .select()
      .from(appConfigTable)
      .where(eq(appConfigTable.key, key));
    return row?.value ?? null;
  } catch {
    return null;
  }
}

async function main() {
  console.log(`\n── Reviewer Pass-Unlock System Status ──\n`);
  console.log(
    "A reviewer must sign in first, then redeem the access code to unlock the pass.",
  );
  console.log(
    "Use a separate verified Production Clerk demo account for App Review.\n",
  );

  // Check access code
  const dbCode = await getConfig("reviewer_access_code");
  const accessCode =
    dbCode ?? process.env.REVIEWER_ACCESS_CODE ?? process.env.DEV_ACCESS_CODE;

  if (accessCode) {
    const source = dbCode
      ? "app_config (database)"
      : process.env.REVIEWER_ACCESS_CODE
        ? "REVIEWER_ACCESS_CODE env var"
        : "DEV_ACCESS_CODE env var";
    console.log(`✅ Access code:   configured (source: ${source})`);
  } else {
    console.log(`❌ Access code:   NOT configured`);
    console.log(
      `   Fix: pnpm --filter @workspace/scripts run rotate-reviewer-code`,
    );
  }

  // Check Clerk key
  if (process.env.CLERK_SECRET_KEY) {
    console.log(`✅ Clerk key:     present`);
  } else {
    console.log(`❌ Clerk key:     CLERK_SECRET_KEY is not set`);
  }

  console.log();

  if (accessCode && process.env.CLERK_SECRET_KEY) {
    console.log(
      "✅ Reviewer pass unlock is ready. Share the access code only after sign-in.",
    );
    console.log(
      "   Do not use it as an App Store Connect demo-account password.",
    );
  } else {
    console.log("⚠️  Resolve the issues above before distributing the code.");
  }

  console.log();
  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
