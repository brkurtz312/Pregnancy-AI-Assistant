/**
 * Health check: verifies the Apple reviewer demo account always holds the Full
 * Pregnancy Pass. If the pass flag is missing, the script auto-heals by
 * re-granting it and exits with a non-zero code so the failure is visible in
 * logs and the calling workflow's console.
 *
 * Meant to be called on a schedule (e.g. every hour from the
 * "Reviewer Pass Health Check" workflow). It is also safe to run manually:
 *
 *   pnpm --filter @workspace/scripts run check-reviewer-pass
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
  const timestamp = new Date().toISOString();
  console.log(`\n[${timestamp}] ── Reviewer pass health check ──`);

  const dbUserId = await getConfig("reviewer_demo_user_id");
  const demoUserId =
    dbUserId ?? process.env.REVIEWER_DEMO_USER_ID ?? FALLBACK_DEMO_USER_ID;

  if (!dbUserId && !process.env.REVIEWER_DEMO_USER_ID) {
    console.warn(
      "⚠️  reviewer_demo_user_id not found in DB or env — using hardcoded fallback.",
    );
    console.warn(
      "   Run: pnpm --filter @workspace/scripts run create-review-account\n",
    );
  }

  console.log(`   Demo user ID: ${demoUserId}`);

  const [user] = await db
    .select({ hasPass: usersTable.hasPass })
    .from(usersTable)
    .where(eq(usersTable.id, demoUserId));

  if (!user) {
    console.error(
      `\n❌ ALERT: Demo user ${demoUserId} not found in users table.`,
    );
    console.error("   Auto-healing: creating user row with hasPass = true ...");
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
    console.error("   ✅ Auto-heal complete. Review your DB and Clerk setup.");
    process.exit(1);
  }

  if (!user.hasPass) {
    console.error(
      `\n❌ ALERT: Reviewer demo account (${demoUserId}) has hasPass = false!`,
    );
    console.error(
      "   This means the Apple reviewer will see a free-tier experience.",
    );
    console.error("   Auto-healing: re-granting Full Pregnancy Pass ...");

    await db
      .update(usersTable)
      .set({
        hasPass: true,
        passPurchasedAt: sql`COALESCE(${usersTable.passPurchasedAt}, now())`,
        updatedAt: sql`now()`,
      })
      .where(eq(usersTable.id, demoUserId));

    console.error(
      "   ✅ Pass re-granted. Investigate why it was cleared (Stripe webhook? DB migration? test script?).",
    );
    process.exit(1);
  }

  console.log(`   ✅ hasPass = true — reviewer account looks good.\n`);
  process.exit(0);
}

main().catch((err) => {
  console.error(`\n❌ check-reviewer-pass crashed: ${err.message}`);
  process.exit(1);
});
