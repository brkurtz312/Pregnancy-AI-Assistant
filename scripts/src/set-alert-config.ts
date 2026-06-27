/**
 * Admin script: set or clear alert channel configuration in app_config.
 *
 * Stores alert destinations in the database so the team can update them
 * without changing env vars or redeploying.  Values set here take precedence
 * over the corresponding env vars read by check-reviewer-pass.ts.
 *
 * Supported keys:
 *   alert_slack_webhook_url  — Slack incoming-webhook URL
 *   alert_resend_api_key     — Resend API key for email alerts
 *   alert_email              — recipient email address
 *   alert_from_email         — sender email address (optional)
 *
 * Usage — set a value:
 *   pnpm --filter @workspace/scripts run set-alert-config -- <key> <value>
 *
 * Usage — clear a value (falls back to env var):
 *   pnpm --filter @workspace/scripts run set-alert-config -- --clear <key>
 *
 * Usage — show current config:
 *   pnpm --filter @workspace/scripts run set-alert-config
 *
 * Examples:
 *   pnpm --filter @workspace/scripts run set-alert-config -- alert_email ops@example.com
 *   pnpm --filter @workspace/scripts run set-alert-config -- alert_slack_webhook_url https://hooks.slack.com/...
 *   pnpm --filter @workspace/scripts run set-alert-config -- --clear alert_email
 *
 * Requires:
 *   DATABASE_URL  — provided automatically by Replit
 */

import { db, appConfigTable } from "@workspace/db";
import { eq, inArray, sql } from "drizzle-orm";

const ALERT_KEYS = [
  "alert_slack_webhook_url",
  "alert_resend_api_key",
  "alert_email",
  "alert_from_email",
] as const;

type AlertKey = (typeof ALERT_KEYS)[number];

function isAlertKey(key: string): key is AlertKey {
  return (ALERT_KEYS as readonly string[]).includes(key);
}

function maskValue(key: AlertKey, value: string): string {
  if (key === "alert_resend_api_key" || key === "alert_slack_webhook_url") {
    return value.slice(0, 8) + "…" + value.slice(-4);
  }
  return value;
}

async function showConfig(): Promise<void> {
  console.log("\n── Alert channel config (app_config) ──\n");

  const rows = await db
    .select()
    .from(appConfigTable)
    .where(inArray(appConfigTable.key, [...ALERT_KEYS]));

  const byKey = new Map(rows.map((r) => [r.key, r]));

  for (const key of ALERT_KEYS) {
    const row = byKey.get(key);
    if (row) {
      const display = maskValue(key, row.value);
      console.log(
        `  ${key.padEnd(26)} = ${display}  (updated ${row.updatedAt.toISOString()})`,
      );
    } else {
      const envFallback = envFallbackFor(key);
      if (envFallback) {
        console.log(
          `  ${key.padEnd(26)}   (not in DB — falling back to env var)`,
        );
      } else {
        console.log(`  ${key.padEnd(26)}   (not set)`);
      }
    }
  }

  console.log(
    "\nTo set a value:   pnpm --filter @workspace/scripts run set-alert-config -- <key> <value>",
  );
  console.log(
    "To clear a value: pnpm --filter @workspace/scripts run set-alert-config -- --clear <key>\n",
  );
}

function envFallbackFor(key: AlertKey): string | undefined {
  const map: Record<AlertKey, string | undefined> = {
    alert_slack_webhook_url: process.env.ALERT_SLACK_WEBHOOK_URL,
    alert_resend_api_key: process.env.RESEND_API_KEY,
    alert_email: process.env.ALERT_EMAIL,
    alert_from_email: process.env.ALERT_FROM_EMAIL,
  };
  return map[key];
}

async function upsert(key: AlertKey, value: string): Promise<void> {
  await db
    .insert(appConfigTable)
    .values({ key, value })
    .onConflictDoUpdate({
      target: appConfigTable.key,
      set: { value, updatedAt: sql`now()` },
    });
}

async function clear(key: AlertKey): Promise<void> {
  await db.delete(appConfigTable).where(eq(appConfigTable.key, key));
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    await showConfig();
    process.exit(0);
  }

  if (args[0] === "--clear") {
    const key = args[1];
    if (!key) {
      console.error("Usage: set-alert-config -- --clear <key>");
      process.exit(1);
    }
    if (!isAlertKey(key)) {
      console.error(`Unknown key: ${key}`);
      console.error(`Valid keys: ${ALERT_KEYS.join(", ")}`);
      process.exit(1);
    }
    await clear(key);
    console.log(
      `\n✅ Cleared ${key} from app_config (env var fallback active if set).\n`,
    );
    process.exit(0);
  }

  const [key, value] = args;

  if (!key || !value) {
    console.error("Usage: set-alert-config -- <key> <value>");
    console.error(`Valid keys: ${ALERT_KEYS.join(", ")}`);
    process.exit(1);
  }

  if (!isAlertKey(key)) {
    console.error(`Unknown key: ${key}`);
    console.error(`Valid keys: ${ALERT_KEYS.join(", ")}`);
    process.exit(1);
  }

  await upsert(key, value);

  const display = maskValue(key, value);
  console.log(`\n✅ Saved ${key} = ${display} to app_config.\n`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", (err as Error).message);
  process.exit(1);
});
