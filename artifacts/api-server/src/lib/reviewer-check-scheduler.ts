/**
 * Reviewer pass health check background scheduler.
 *
 * Calls `runReviewerPassCheck` on a configurable interval. When the check
 * returns `ok: false` (or throws), an alert is dispatched via the configured
 * channels (Slack / Resend). A cooldown window prevents re-alerting on every
 * tick when Clerk is down for an extended period.
 *
 * Interval and cooldown are driven by environment variables so they can be
 * overridden in tests or tuned in production:
 *
 *   REVIEWER_CHECK_INTERVAL_MS   — how often to run the check (default: 1 h)
 *   REVIEWER_CHECK_COOLDOWN_MS   — minimum gap between repeated alerts
 *                                  (default: 4 h)
 *
 * Set REVIEWER_CHECK_INTERVAL_MS=0 to disable the scheduler entirely.
 */

import { logger } from "./logger";
import { runReviewerPassCheck } from "./reviewer-check";
import { dispatchAlert } from "./alert";
import type { ReviewerCheckResult } from "./reviewer-check";

// ---------------------------------------------------------------------------
// Interval / cooldown resolution
// ---------------------------------------------------------------------------

export const DEFAULT_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
export const DEFAULT_COOLDOWN_MS = 4 * 60 * 60 * 1000; // 4 hours

function parseEnvMs(key: string, defaultMs: number): number {
  const raw = process.env[key];
  if (raw === undefined) return defaultMs;
  const n = Number(raw);
  return Number.isNaN(n) || n < 0 ? defaultMs : n;
}

// ---------------------------------------------------------------------------
// Scheduler state (module-level so it persists across interval ticks)
// ---------------------------------------------------------------------------

// NOTE: intentional restart behaviour — the cooldown does NOT survive a server
// restart. Because `lastAlertSentAt` is module-level state, it is reset to
// null whenever the Node process exits and restarts (e.g. a deploy or crash
// recovery). This means an alert will fire on the very first failing check
// after a restart, even if one was sent shortly before the process went down.
// This is the desired behaviour: a restart is treated as a fresh start so that
// a failure which caused the restart is never silently swallowed by a stale
// cooldown from the previous process lifetime.
let lastAlertSentAt: number | null = null;

/** Resets the cooldown state — used in tests to isolate runs. */
export function resetSchedulerState(): void {
  lastAlertSentAt = null;
}

// ---------------------------------------------------------------------------
// Core run logic (exported so tests can exercise it directly)
// ---------------------------------------------------------------------------

export interface RunCheckOptions {
  cooldownMs?: number;
  /** Injected for unit tests; defaults to the real implementations. */
  _runCheck?: () => Promise<ReviewerCheckResult>;
  _dispatch?: (payload: { subject: string; body: string }) => Promise<void>;
}

/**
 * Executes a single reviewer pass check tick:
 *   1. Calls runReviewerPassCheck (or the injected `_runCheck`).
 *   2. If the check fails and the cooldown has elapsed, dispatches an alert.
 *
 * Returns the check result (or null if the check threw).
 */
export async function runScheduledCheck(
  options: RunCheckOptions = {},
): Promise<ReviewerCheckResult | null> {
  const cooldownMs =
    options.cooldownMs ??
    parseEnvMs("REVIEWER_CHECK_COOLDOWN_MS", DEFAULT_COOLDOWN_MS);
  const doRun = options._runCheck ?? runReviewerPassCheck;
  const doDispatch = options._dispatch ?? dispatchAlert;

  let result: ReviewerCheckResult | null = null;

  try {
    result = await doRun();
  } catch (err) {
    logger.error({ err }, "Scheduled reviewer pass check crashed");

    // A crash is treated as a failure for alerting purposes.
    await maybeDispatchAlert(
      {
        subject: "Reviewer pass check crashed",
        body: `The scheduled reviewer pass check threw an unexpected error: ${String(err)}`,
      },
      cooldownMs,
      doDispatch,
    );

    return null;
  }

  if (!result.ok) {
    logger.warn(
      { reason: result.reason },
      "Scheduled reviewer pass check failed",
    );

    await maybeDispatchAlert(
      {
        subject: "Reviewer pass check failed",
        body:
          `The reviewer demo account pass check failed.\n` +
          `Reason: ${result.reason ?? "unknown"}\n` +
          `Timestamp: ${result.timestamp}`,
      },
      cooldownMs,
      doDispatch,
    );
  }

  return result;
}

async function maybeDispatchAlert(
  payload: { subject: string; body: string },
  cooldownMs: number,
  dispatch: (p: { subject: string; body: string }) => Promise<void>,
): Promise<void> {
  const now = Date.now();

  if (lastAlertSentAt !== null && now - lastAlertSentAt < cooldownMs) {
    const remainingMinutes = Math.ceil(
      (cooldownMs - (now - lastAlertSentAt)) / 60_000,
    );
    logger.info(
      { remainingMinutes },
      "Reviewer pass check alert suppressed — cooldown active",
    );
    return;
  }

  lastAlertSentAt = now;

  try {
    await dispatch(payload);
    logger.info(
      { subject: payload.subject },
      "Reviewer pass check alert dispatched",
    );
  } catch (err) {
    logger.error({ err }, "Failed to dispatch reviewer pass check alert");
  }
}

// ---------------------------------------------------------------------------
// Scheduler entry point
// ---------------------------------------------------------------------------

/**
 * Starts the background scheduler using `setInterval` / `setTimeout`.
 * Safe to call once at server startup. Returns a cleanup function that
 * cancels both timers (useful in tests).
 *
 * Pass `intervalMs` to override the env-var default; useful in tests.
 */
export function startReviewerCheckScheduler(
  opts: {
    intervalMs?: number;
    cooldownMs?: number;
    _runCheck?: () => Promise<ReviewerCheckResult>;
    _dispatch?: (payload: { subject: string; body: string }) => Promise<void>;
  } = {},
): () => void {
  const intervalMs =
    opts.intervalMs ??
    parseEnvMs("REVIEWER_CHECK_INTERVAL_MS", DEFAULT_INTERVAL_MS);
  const cooldownMs =
    opts.cooldownMs ??
    parseEnvMs("REVIEWER_CHECK_COOLDOWN_MS", DEFAULT_COOLDOWN_MS);

  if (intervalMs === 0) {
    logger.info("Reviewer pass health check scheduler disabled (intervalMs=0)");
    return () => {};
  }

  const runOptions: RunCheckOptions = {
    cooldownMs,
    _runCheck: opts._runCheck,
    _dispatch: opts._dispatch,
  };

  // Run once 30 s after boot (so the server is fully ready), then start the
  // recurring interval. Chaining the interval after the first run means the
  // interval never fires before the boot delay, which keeps the timing
  // straightforward to reason about and test.
  let recurringTimer: ReturnType<typeof setInterval> | null = null;
  let stopped = false;

  const initialTimer = setTimeout(() => {
    if (stopped) return;
    void runScheduledCheck(runOptions).finally(() => {
      if (stopped) return;
      recurringTimer = setInterval(
        () => void runScheduledCheck(runOptions),
        intervalMs,
      );
    });
  }, 30_000);

  logger.info(
    { intervalMs, cooldownMs },
    "Reviewer pass health check scheduler started",
  );

  return () => {
    stopped = true;
    clearTimeout(initialTimer);
    if (recurringTimer !== null) clearInterval(recurringTimer);
  };
}
