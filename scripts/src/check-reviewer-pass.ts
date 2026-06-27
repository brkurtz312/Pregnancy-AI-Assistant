/**
 * Health check: verifies the Apple reviewer demo account always holds the Full
 * Pregnancy Pass. If the pass flag is missing, the script auto-heals by
 * re-granting it and exits with a non-zero code so the failure is visible in
 * logs and the calling workflow's console.
 *
 * When a failure is detected the script also sends an outbound alert so the
 * team is notified immediately. Configure at least one of:
 *
 *   ALERT_SLACK_WEBHOOK_URL  — Incoming-webhook URL; receives a Slack message
 *   RESEND_API_KEY + ALERT_EMAIL — sends an email via Resend
 *
 * ALERT_EMAIL sets the recipient address for email notifications.
 * ALERT_FROM_EMAIL optionally overrides the sender address
 * (defaults to "alerts@notifications.pregnancyassistant.app").
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

interface AlertPayload {
  demoUserId: string;
  timestamp: string;
  reason: "user_missing" | "pass_revoked";
}

export async function sendAlert(payload: AlertPayload): Promise<void> {
  const { demoUserId, timestamp, reason } = payload;

  const title =
    reason === "user_missing"
      ? "❌ Reviewer demo account missing from DB"
      : "❌ Reviewer pass revoked (hasPass = false)";

  const body = [
    title,
    `Demo user ID : ${demoUserId}`,
    `UTC timestamp : ${timestamp}`,
    `Action taken  : Pass auto-healed (hasPass set to true)`,
    `Next steps    : Investigate why the pass was cleared (Stripe webhook? DB migration? test script?).`,
    `                Check the DB row for ${demoUserId} and the workflow console for context.`,
  ].join("\n");

  const slackWebhookUrl = process.env.ALERT_SLACK_WEBHOOK_URL;
  const resendApiKey = process.env.RESEND_API_KEY;
  const alertEmail = process.env.ALERT_EMAIL;
  const fromEmail =
    process.env.ALERT_FROM_EMAIL ??
    "alerts@notifications.pregnancyassistant.app";

  let sent = false;

  if (slackWebhookUrl) {
    try {
      const slackBody = {
        text: title,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: [
                `*${title}*`,
                `• *Demo user ID:* \`${demoUserId}\``,
                `• *UTC timestamp:* ${timestamp}`,
                `• *Action:* Pass auto-healed (\`hasPass\` set to \`true\`)`,
                `• *Next steps:* Investigate why the pass was cleared (Stripe webhook? DB migration? test script?).`,
              ].join("\n"),
            },
          },
        ],
      };

      const res = await fetch(slackWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(slackBody),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error(`   ⚠️  Slack alert failed (${res.status}): ${text}`);
      } else {
        console.error("   📣 Slack alert sent.");
        sent = true;
      }
    } catch (err) {
      console.error(`   ⚠️  Slack alert threw: ${(err as Error).message}`);
    }
  }

  if (resendApiKey && !alertEmail) {
    console.error(
      "   ⚠️  RESEND_API_KEY is set but ALERT_EMAIL is missing — email alert skipped.",
    );
  }

  if (!resendApiKey && alertEmail) {
    console.error(
      "   ⚠️  ALERT_EMAIL is set but RESEND_API_KEY is missing — email alert skipped.",
    );
  }

  if (resendApiKey && alertEmail) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [alertEmail],
          subject: title,
          text: body,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error(`   ⚠️  Resend alert failed (${res.status}): ${text}`);
      } else {
        console.error(`   📣 Email alert sent to ${alertEmail}.`);
        sent = true;
      }
    } catch (err) {
      console.error(`   ⚠️  Resend alert threw: ${(err as Error).message}`);
    }
  }

  if (!sent) {
    if (!slackWebhookUrl && !resendApiKey) {
      console.error(
        "   ⚠️  No alert channel configured. Set ALERT_SLACK_WEBHOOK_URL",
      );
      console.error(
        "       or RESEND_API_KEY + ALERT_EMAIL to receive notifications.",
      );
    }
  }
}

export async function main() {
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
    await sendAlert({ demoUserId, timestamp, reason: "user_missing" });
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
    await sendAlert({ demoUserId, timestamp, reason: "pass_revoked" });
    process.exit(1);
  }

  console.log(`   ✅ hasPass = true — reviewer account looks good.\n`);
  process.exit(0);
}

// Only auto-run when executed directly (not when imported by tests)
const isMain =
  typeof process !== "undefined" &&
  process.argv[1]?.endsWith("check-reviewer-pass.ts");

if (isMain) {
  main().catch((err) => {
    console.error(`\n❌ check-reviewer-pass crashed: ${err.message}`);
    process.exit(1);
  });
}
