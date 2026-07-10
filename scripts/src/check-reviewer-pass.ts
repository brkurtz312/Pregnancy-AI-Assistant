/**
 * Health check: verifies that the reviewer sign-in system is fully operational.
 *
 * Since each reviewer sign-in now creates a unique isolated Clerk account,
 * there is no single "demo user" to monitor. Instead this script checks the
 * three things that must be true for a reviewer to sign in successfully:
 *
 *   1. A reviewer access code is configured (DB app_config or env var)
 *   2. CLERK_SECRET_KEY is present
 *   3. The Clerk API is reachable with that key
 *
 * If any check fails the script exits non-zero so the calling workflow's
 * console shows a visible failure. Configure alert channels with:
 *
 *   alert_slack_webhook_url (app_config row) or ALERT_SLACK_WEBHOOK_URL (env)
 *   alert_resend_api_key + alert_email (app_config rows) or
 *     RESEND_API_KEY + ALERT_EMAIL (env)
 *
 * Meant to be called on a schedule (e.g. every hour from the
 * "Reviewer Pass Health Check" workflow). Also safe to run manually:
 *
 *   pnpm --filter @workspace/scripts run check-reviewer-pass
 *
 * Requires:
 *   DATABASE_URL     — provided automatically by Replit
 *   CLERK_SECRET_KEY — must be set for reviewer sign-in to work
 */

import { db, appConfigTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const CLERK_API = "https://api.clerk.com/v1";

async function getConfig(key: string): Promise<string | null> {
  const [row] = await db
    .select()
    .from(appConfigTable)
    .where(eq(appConfigTable.key, key));
  return row?.value ?? null;
}

interface AlertPayload {
  timestamp: string;
  reason: "no_access_code" | "no_clerk_key" | "clerk_unreachable";
}

export async function sendAlert(payload: AlertPayload): Promise<void> {
  const { timestamp, reason } = payload;

  const title =
    reason === "no_access_code"
      ? "❌ Reviewer access code not configured"
      : reason === "no_clerk_key"
        ? "❌ CLERK_SECRET_KEY missing — reviewer sign-in will fail"
        : "❌ Clerk API unreachable — reviewer sign-in will fail";

  const body = [
    title,
    `UTC timestamp : ${timestamp}`,
    `Reason        : ${reason}`,
    `Impact        : Reviewers and developers cannot sign in with the access code.`,
    `Next steps    : Check Clerk configuration and environment secrets.`,
  ].join("\n");

  const slackWebhookUrl =
    (await getConfig("alert_slack_webhook_url")) ??
    process.env.ALERT_SLACK_WEBHOOK_URL;
  const resendApiKey =
    (await getConfig("alert_resend_api_key")) ?? process.env.RESEND_API_KEY;
  const alertEmail =
    (await getConfig("alert_email")) ?? process.env.ALERT_EMAIL;
  const fromEmail =
    (await getConfig("alert_from_email")) ??
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
                `• *UTC timestamp:* ${timestamp}`,
                `• *Reason:* \`${reason}\``,
                `• *Impact:* Reviewers and developers cannot sign in with the access code.`,
                `• *Next steps:* Check Clerk configuration and environment secrets.`,
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
        "   ⚠️  No alert channel configured. Set alert_slack_webhook_url in",
      );
      console.error(
        "       app_config (via set-alert-config script) or set the env var",
      );
      console.error(
        "       ALERT_SLACK_WEBHOOK_URL, or set alert_resend_api_key +",
      );
      console.error(
        "       alert_email in app_config (or RESEND_API_KEY + ALERT_EMAIL).",
      );
    }
  }
}

export async function main() {
  const timestamp = new Date().toISOString();
  console.log(`\n[${timestamp}] ── Reviewer pass health check ──`);

  // 1. Verify access code is configured
  const dbCode = await getConfig("reviewer_access_code");
  const accessCode =
    dbCode ?? process.env.REVIEWER_ACCESS_CODE ?? process.env.DEV_ACCESS_CODE;

  if (!accessCode) {
    console.error(
      "\n❌ ALERT: No reviewer access code configured (checked app_config.reviewer_access_code,",
    );
    console.error(
      "   REVIEWER_ACCESS_CODE, and DEV_ACCESS_CODE). Reviewers cannot sign in.",
    );
    await sendAlert({ timestamp, reason: "no_access_code" });
    process.exit(1);
  }

  console.log("   ✅ Access code configured.");

  // 2. Verify Clerk secret key is present
  const clerkKey = process.env.CLERK_SECRET_KEY;
  if (!clerkKey) {
    console.error(
      "\n❌ ALERT: CLERK_SECRET_KEY is not set. Reviewer sign-in will fail.",
    );
    await sendAlert({ timestamp, reason: "no_clerk_key" });
    process.exit(1);
  }

  console.log("   ✅ Clerk secret key present.");

  // 3. Verify Clerk API is reachable (lightweight read — no user creation)
  try {
    const res = await fetch(`${CLERK_API}/users?limit=1`, {
      headers: { Authorization: `Bearer ${clerkKey}` },
    });

    if (!res.ok) {
      console.error(
        `\n❌ ALERT: Clerk API returned ${res.status}. Reviewer sign-in will fail.`,
      );
      await sendAlert({ timestamp, reason: "clerk_unreachable" });
      process.exit(1);
    }
  } catch (err) {
    console.error(
      `\n❌ ALERT: Clerk API unreachable: ${(err as Error).message}`,
    );
    await sendAlert({ timestamp, reason: "clerk_unreachable" });
    process.exit(1);
  }

  console.log("   ✅ Clerk API reachable — reviewer sign-in should work.");
  console.log(
    "   ℹ️  Each sign-in creates a unique isolated account (no shared demo user).\n",
  );
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
