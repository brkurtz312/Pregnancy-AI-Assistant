/**
 * Alert dispatch — sends failure notifications via Slack and/or Resend email.
 *
 * Configuration is read from app_config DB rows (taking priority) with env
 * var fallbacks so existing deployments continue to work without a DB row:
 *
 *   alert_slack_webhook_url  →  ALERT_SLACK_WEBHOOK_URL
 *   alert_resend_api_key     →  ALERT_RESEND_API_KEY
 *   alert_email              →  ALERT_EMAIL
 *   alert_from_email         →  ALERT_FROM_EMAIL
 *
 * Dispatches to every configured channel in parallel; a failure on one
 * channel does not suppress the other.
 */

import { db, appConfigTable } from "@workspace/db";
import { inArray } from "drizzle-orm";
import { logger } from "./logger";

export interface AlertPayload {
  subject: string;
  body: string;
}

// ---------------------------------------------------------------------------
// Config resolution
// ---------------------------------------------------------------------------

interface AlertConfig {
  slackWebhookUrl: string | null;
  resendApiKey: string | null;
  alertEmail: string | null;
  alertFromEmail: string | null;
}

async function resolveAlertConfig(): Promise<AlertConfig> {
  const ALERT_KEYS = [
    "alert_slack_webhook_url",
    "alert_resend_api_key",
    "alert_email",
    "alert_from_email",
  ] as const;

  let byKey: Map<string, string> = new Map();

  try {
    const rows = await db
      .select()
      .from(appConfigTable)
      .where(inArray(appConfigTable.key, [...ALERT_KEYS]));
    byKey = new Map(rows.map((r) => [r.key, r.value]));
  } catch {
    // DB unavailable — fall back to env vars only
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

// ---------------------------------------------------------------------------
// Channel senders
// ---------------------------------------------------------------------------

async function sendSlack(
  webhookUrl: string,
  payload: AlertPayload,
): Promise<void> {
  const body = JSON.stringify({
    text: `*${payload.subject}*\n${payload.body}`,
  });

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

  if (!res.ok) {
    throw new Error(`Slack webhook responded with ${res.status}`);
  }
}

async function sendResend(
  apiKey: string,
  to: string,
  from: string,
  payload: AlertPayload,
): Promise<void> {
  const body = JSON.stringify({
    from,
    to: [to],
    subject: payload.subject,
    text: payload.body,
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
    throw new Error(`Resend API responded with ${res.status}`);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Dispatches an alert to every configured channel (Slack, Resend email).
 * Resolves when all channel attempts have settled. A failure on one channel
 * is logged but does not suppress dispatches to the remaining channels.
 */
export async function dispatchAlert(payload: AlertPayload): Promise<void> {
  const config = await resolveAlertConfig();

  const dispatches: Promise<void>[] = [];

  if (config.slackWebhookUrl) {
    dispatches.push(
      sendSlack(config.slackWebhookUrl, payload).catch((err) => {
        logger.error({ err }, "Failed to dispatch Slack alert");
      }),
    );
  }

  if (config.resendApiKey && config.alertEmail) {
    const from =
      config.alertFromEmail ?? `alerts@${config.alertEmail.split("@")[1]}`;
    dispatches.push(
      sendResend(config.resendApiKey, config.alertEmail, from, payload).catch(
        (err) => {
          logger.error({ err }, "Failed to dispatch Resend email alert");
        },
      ),
    );
  }

  if (dispatches.length === 0) {
    logger.warn(
      { subject: payload.subject },
      "Alert has no configured channels (set ALERT_SLACK_WEBHOOK_URL or ALERT_RESEND_API_KEY + ALERT_EMAIL)",
    );
    return;
  }

  await Promise.all(dispatches);
}
