/**
 * Smoke test: verifies that the configured alert channels actually deliver.
 *
 * Reads alert_slack_webhook_url and/or alert_resend_api_key + alert_email
 * from app_config (falling back to env vars), sends a clearly-labelled test
 * message to every configured channel, and exits non-zero if any channel
 * returns a non-200 response or throws.
 *
 * Run before an incident to confirm the on-call channel is wired correctly:
 *
 *   pnpm --filter @workspace/scripts run smoke-test-alert
 *
 * Requires:
 *   DATABASE_URL — provided automatically by Replit
 *
 * Optional (used if no app_config rows are set):
 *   ALERT_SLACK_WEBHOOK_URL
 *   ALERT_RESEND_API_KEY
 *   ALERT_EMAIL
 *   ALERT_FROM_EMAIL
 */

import { db, appConfigTable } from "@workspace/db";
import { inArray } from "drizzle-orm";

const ALERT_KEYS = [
  "alert_slack_webhook_url",
  "alert_resend_api_key",
  "alert_email",
  "alert_from_email",
] as const;

async function resolveConfig(): Promise<{
  slackWebhookUrl: string | null;
  resendApiKey: string | null;
  alertEmail: string | null;
  alertFromEmail: string | null;
}> {
  let byKey: Map<string, string> = new Map();

  try {
    const rows = await db
      .select()
      .from(appConfigTable)
      .where(inArray(appConfigTable.key, [...ALERT_KEYS]));
    byKey = new Map(rows.map((r) => [r.key, r.value]));
  } catch (err) {
    console.warn(
      `  ⚠️  Could not read app_config (${(err as Error).message}) — falling back to env vars only.`,
    );
  }

  return {
    slackWebhookUrl:
      byKey.get("alert_slack_webhook_url") ??
      process.env.ALERT_SLACK_WEBHOOK_URL ??
      null,
    resendApiKey:
      byKey.get("alert_resend_api_key") ??
      process.env.ALERT_RESEND_API_KEY ??
      null,
    alertEmail: byKey.get("alert_email") ?? process.env.ALERT_EMAIL ?? null,
    alertFromEmail:
      byKey.get("alert_from_email") ?? process.env.ALERT_FROM_EMAIL ?? null,
  };
}

async function testSlack(webhookUrl: string): Promise<boolean> {
  const timestamp = new Date().toISOString();
  const body = JSON.stringify({
    text: `🧪 *[SMOKE TEST] Alert channel check — ${timestamp}*\nThis is a test message sent by the \`smoke-test-alert\` script. No action required.`,
  });

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "(unreadable body)");
    console.error(`  ❌ Slack webhook returned ${res.status}: ${text}`);
    return false;
  }

  console.log("  ✅ Slack: 200 OK — test message delivered.");
  return true;
}

async function testResend(
  apiKey: string,
  to: string,
  from: string,
): Promise<boolean> {
  const timestamp = new Date().toISOString();
  const body = JSON.stringify({
    from,
    to: [to],
    subject: `[SMOKE TEST] Alert channel check — ${timestamp}`,
    text: `This is a test message sent by the smoke-test-alert script at ${timestamp}.\n\nNo action required — this confirms the email alert channel is working.`,
  });

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "(unreadable body)");
    console.error(`  ❌ Resend API returned ${res.status}: ${text}`);
    return false;
  }

  console.log(`  ✅ Resend: 200 OK — test email queued to ${to}.`);
  return true;
}

async function main(): Promise<void> {
  const timestamp = new Date().toISOString();
  console.log(`\n[${timestamp}] ── Alert channel smoke test ──\n`);

  const config = await resolveConfig();

  let channelCount = 0;
  let failCount = 0;

  if (config.slackWebhookUrl) {
    channelCount++;
    console.log("Testing Slack webhook…");
    try {
      const ok = await testSlack(config.slackWebhookUrl);
      if (!ok) failCount++;
    } catch (err) {
      console.error(`  ❌ Slack webhook threw: ${(err as Error).message}`);
      failCount++;
    }
  } else {
    console.log(
      "  — Slack: not configured (set alert_slack_webhook_url in app_config or ALERT_SLACK_WEBHOOK_URL env var).",
    );
  }

  if (config.resendApiKey && config.alertEmail) {
    channelCount++;
    const from =
      config.alertFromEmail ??
      `alerts@${config.alertEmail.split("@")[1]}`;
    console.log(`Testing Resend email (→ ${config.alertEmail})…`);
    try {
      const ok = await testResend(config.resendApiKey, config.alertEmail, from);
      if (!ok) failCount++;
    } catch (err) {
      console.error(`  ❌ Resend threw: ${(err as Error).message}`);
      failCount++;
    }
  } else if (config.resendApiKey && !config.alertEmail) {
    console.log(
      "  — Resend: API key is set but alert_email is missing — skipped.",
    );
  } else if (!config.resendApiKey && config.alertEmail) {
    console.log(
      "  — Resend: alert_email is set but API key is missing — skipped.",
    );
  } else {
    console.log(
      "  — Resend: not configured (set alert_resend_api_key + alert_email).",
    );
  }

  console.log();

  if (channelCount === 0) {
    console.error(
      "❌ No alert channels are configured. Set at least one of:\n" +
        "   alert_slack_webhook_url (app_config or ALERT_SLACK_WEBHOOK_URL)\n" +
        "   alert_resend_api_key + alert_email (app_config or env vars)\n",
    );
    process.exit(1);
  }

  if (failCount > 0) {
    console.error(
      `❌ ${failCount} of ${channelCount} channel(s) failed — see errors above.\n`,
    );
    process.exit(1);
  }

  console.log(
    `✅ All ${channelCount} channel(s) delivered successfully. Alert pipeline is healthy.\n`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(`\n❌ smoke-test-alert crashed: ${(err as Error).message}`);
  process.exit(1);
});
