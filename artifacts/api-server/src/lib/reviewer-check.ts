import { db, appConfigTable, usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logger } from "./logger";

const FALLBACK_DEMO_USER_ID = "user_3FbMbELUGoggA6nXU8lht1GWJOJ";

export type ReviewerCheckReason = "user_missing" | "pass_revoked";

export interface ReviewerCheckResult {
  ok: boolean;
  demoUserId: string;
  reason?: ReviewerCheckReason;
  healed: boolean;
  timestamp: string;
}

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

async function sendAlert(payload: {
  demoUserId: string;
  timestamp: string;
  reason: ReviewerCheckReason;
}): Promise<void> {
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
    `                Check the DB row for ${demoUserId} and server logs for context.`,
  ].join("\n");

  const slackWebhookUrl = process.env.ALERT_SLACK_WEBHOOK_URL;
  const resendApiKey = process.env.RESEND_API_KEY;
  const alertEmail = process.env.ALERT_EMAIL;
  const fromEmail =
    process.env.ALERT_FROM_EMAIL ??
    "alerts@notifications.pregnancyassistant.app";

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
        logger.warn({ status: res.status, body: text }, "Slack alert failed");
      } else {
        logger.info("Reviewer pass alert sent via Slack");
      }
    } catch (err) {
      logger.warn({ err }, "Slack alert threw");
    }
  }

  if (resendApiKey && !alertEmail) {
    logger.warn("RESEND_API_KEY set but ALERT_EMAIL missing — email skipped");
  }

  if (!resendApiKey && alertEmail) {
    logger.warn("ALERT_EMAIL set but RESEND_API_KEY missing — email skipped");
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
        logger.warn({ status: res.status, body: text }, "Resend alert failed");
      } else {
        logger.info({ to: alertEmail }, "Reviewer pass alert sent via email");
      }
    } catch (err) {
      logger.warn({ err }, "Resend alert threw");
    }
  }

  if (!slackWebhookUrl && !resendApiKey) {
    logger.warn(
      "No alert channel configured — set ALERT_SLACK_WEBHOOK_URL or RESEND_API_KEY + ALERT_EMAIL",
    );
  }
}

/**
 * Verifies the Apple reviewer demo account has the Full Pregnancy Pass.
 * If the pass is missing, auto-heals it and sends an alert.
 * Meant to be called from the /api/admin/reviewer-check endpoint so it runs
 * against whichever DATABASE_URL the server is connected to (prod in production).
 */
export async function runReviewerPassCheck(): Promise<ReviewerCheckResult> {
  const timestamp = new Date().toISOString();

  const dbUserId = await getConfig("reviewer_demo_user_id");
  const demoUserId =
    dbUserId ?? process.env.REVIEWER_DEMO_USER_ID ?? FALLBACK_DEMO_USER_ID;

  if (!dbUserId && !process.env.REVIEWER_DEMO_USER_ID) {
    logger.warn(
      "reviewer_demo_user_id not found in DB or env — using hardcoded fallback",
    );
  }

  const [user] = await db
    .select({ hasPass: usersTable.hasPass })
    .from(usersTable)
    .where(eq(usersTable.id, demoUserId));

  if (!user) {
    logger.error(
      { demoUserId },
      "Reviewer demo account missing from users table — auto-healing",
    );

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

    await sendAlert({ demoUserId, timestamp, reason: "user_missing" });

    return {
      ok: false,
      demoUserId,
      reason: "user_missing",
      healed: true,
      timestamp,
    };
  }

  if (!user.hasPass) {
    logger.error(
      { demoUserId },
      "Reviewer demo account has hasPass = false — auto-healing",
    );

    await db
      .update(usersTable)
      .set({
        hasPass: true,
        passPurchasedAt: sql`COALESCE(${usersTable.passPurchasedAt}, now())`,
        updatedAt: sql`now()`,
      })
      .where(eq(usersTable.id, demoUserId));

    await sendAlert({ demoUserId, timestamp, reason: "pass_revoked" });

    return {
      ok: false,
      demoUserId,
      reason: "pass_revoked",
      healed: true,
      timestamp,
    };
  }

  logger.info({ demoUserId }, "Reviewer pass check passed");
  return { ok: true, demoUserId, healed: false, timestamp };
}
