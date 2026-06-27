/**
 * Resets the Apple reviewer demo account to a known-good state:
 *   - Looks up the demo user id from the database (set by create-review-account)
 *   - Ensures hasPass = true in the database
 *
 * Run this whenever the demo account ends up in a bad state (e.g. the pass
 * was consumed, expired, or accidentally revoked during testing).
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run reset-reviewer-pass
 *
 * Requires:
 *   DATABASE_URL  — provided automatically by Replit
 */

import { db, appConfigTable, usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

const FALLBACK_DEMO_USER_ID = "user_3FbMbELUGoggA6nXU8lht1GWJOJ";

async function getConfig(key: string): Promise<string | null> {
  const [row] = await db
    .select()
    .from(appConfigTable)
    .where(eq(appConfigTable.key, key));
  return row?.value ?? null;
}

async function main() {
  const dbUserId = await getConfig("reviewer_demo_user_id");
  const demoUserId =
    dbUserId ?? process.env.REVIEWER_DEMO_USER_ID ?? FALLBACK_DEMO_USER_ID;

  console.log(`\n── Resetting reviewer demo account pass ──`);
  console.log(`Demo user ID: ${demoUserId}\n`);

  if (!dbUserId && !process.env.REVIEWER_DEMO_USER_ID) {
    console.warn(
      "⚠️  No reviewer_demo_user_id found in database or env. Using hardcoded fallback.",
    );
    console.warn(
      "   Run create-review-account to register the demo user id properly.\n",
    );
  }

  await db
    .insert(usersTable)
    .values({ id: demoUserId, hasPass: true })
    .onConflictDoUpdate({
      target: usersTable.id,
      set: {
        hasPass: true,
        passPurchasedAt: sql`COALESCE(${usersTable.passPurchasedAt}, now())`,
        updatedAt: sql`now()`,
      },
    });

  console.log("✅ Full Pregnancy Pass restored for demo account.\n");

  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
