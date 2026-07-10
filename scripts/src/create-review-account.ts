/**
 * Displays the current reviewer sign-in configuration status.
 *
 * The reviewer system no longer uses a single shared demo account. Each
 * time a reviewer or developer enters the access code, the API creates a
 * unique isolated Clerk account for that session — so every person sees
 * their own data and changes don't bleed across sessions.
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
 *   CLERK_SECRET_KEY  — must be set for reviewer sign-in to work
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
  console.log(`\n── Reviewer Sign-In System Status ──\n`);
  console.log(
    "Each sign-in now creates a unique isolated Clerk account per session.",
  );
  console.log(
    "Reviewers and developers each see their own data — nothing is shared.\n",
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
      "✅ Reviewer sign-in is ready. Share the access code with reviewers.",
    );
    console.log(
      "   Each person who enters the code gets their own isolated account.",
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
