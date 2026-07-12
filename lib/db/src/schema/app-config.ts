import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Generic key-value config store for runtime-mutable server settings.
 *
 * Current keys:
 *   reviewer_access_code          — the code the Apple reviewer enters to sign in
 *   reviewer_demo_user_id         — the Clerk user id of the demo account
 *
 * Reviewer pass health check status (written after each scheduled run so
 * the status survives server restarts):
 *   reviewer_check_last_run_at    — ISO-8601 timestamp of the most recent run
 *   reviewer_check_last_result    — "ok" | "fail"
 *   reviewer_check_last_reason    — reason code when result is "fail", otherwise absent
 *
 * Alert channel config (managed via `set-alert-config` script):
 *   alert_slack_webhook_url   — Slack incoming-webhook URL (overrides ALERT_SLACK_WEBHOOK_URL env)
 *   alert_resend_api_key      — Resend API key (overrides RESEND_API_KEY env)
 *   alert_email               — recipient address for email alerts (overrides ALERT_EMAIL env)
 *   alert_from_email          — sender address for email alerts (overrides ALERT_FROM_EMAIL env)
 */
export const appConfigTable = pgTable("app_config", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type AppConfig = typeof appConfigTable.$inferSelect;
