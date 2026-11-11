import Constants from "expo-constants";
import { Platform } from "react-native";

/**
 * Anonymous purchase-funnel counting. Posts one event to POST /api/events.
 *
 * Rules every call site relies on:
 *   - `track()` returns nothing. It is never awaited, so it can never hold up
 *     navigation or a purchase.
 *   - It never throws, synchronously or asynchronously, whatever the input or
 *     the network does.
 *   - A failed send is dropped silently. No retry, no queue, no logging: a
 *     missing count is harmless, a crash or a stall in the purchase flow is not.
 *
 * Nothing identifying is sent — no user id, email or device id. The server
 * refuses any such field outright.
 *
 * The event and source names must match the allowlist in
 * artifacts/api-server/src/routes/events.ts, or the server answers 400.
 */

export type FunnelSource =
  | "ai_limit"
  | "home"
  | "settings"
  | "onboarding"
  | "after_answer"
  | "other";

type SourcedEvent = "paywall_viewed" | "pass_cta_tapped";
type ErrorEvent = "offerings_load_failed" | "purchase_failed";
type PlainEvent =
  | "purchase_started"
  | "purchase_completed"
  | "purchase_cancelled"
  | "restore_tapped"
  | "signin_required_for_purchase"
  | "ai_limit_reached";

export type FunnelEvent = SourcedEvent | ErrorEvent | PlainEvent;

/** Props per event, so a missing source or a stray errorCode is a type error. */
export type TrackProps<E extends FunnelEvent> = E extends SourcedEvent
  ? { signedIn: boolean; source: FunnelSource }
  : E extends ErrorEvent
    ? { signedIn: boolean; errorCode: string }
    : { signedIn: boolean };

/** Same rule as the server: a short code, never a free-text message. */
const ERROR_CODE_PATTERN = /^[A-Za-z0-9_.:-]{1,64}$/;

/** Long enough for a slow network, short enough that nothing lingers. */
const SEND_TIMEOUT_MS = 5_000;

function eventsUrl(): string | null {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (domain) return `https://${domain}/api/events`;
  // The web build is served from the API's own origin.
  if (Platform.OS === "web") return "/api/events";
  return null;
}

function appVersion(): string {
  const version = Constants.expoConfig?.version;
  return typeof version === "string" && /^[0-9A-Za-z.+-]{1,32}$/.test(version)
    ? version
    : "unknown";
}

/**
 * Turns whatever a failure handed us into a code the server will accept.
 *
 * RevenueCat errors carry a readable code (e.g. NETWORK_ERROR) in
 * `userInfo.readableErrorCode`, with the older top-level `readableErrorCode`
 * and a numeric `code` as fallbacks. A plain string is taken as an
 * app-defined code. Anything else, or anything that does not look like a
 * code, becomes "unknown".
 */
export function toErrorCode(err: unknown): string {
  try {
    let candidate: unknown;
    if (typeof err === "string") {
      candidate = err;
    } else if (typeof err === "object" && err !== null) {
      const e = err as {
        userInfo?: { readableErrorCode?: unknown };
        readableErrorCode?: unknown;
        code?: unknown;
      };
      candidate =
        e.userInfo?.readableErrorCode ?? e.readableErrorCode ?? e.code;
    }
    if (typeof candidate === "number") candidate = String(candidate);
    return typeof candidate === "string" && ERROR_CODE_PATTERN.test(candidate)
      ? candidate
      : "unknown";
  } catch {
    return "unknown";
  }
}

export function track<E extends FunnelEvent>(
  event: E,
  props: TrackProps<E>,
): void {
  try {
    const url = eventsUrl();
    if (!url || typeof fetch !== "function") return;

    const platform = Platform.OS;
    if (platform !== "ios" && platform !== "android" && platform !== "web") {
      return;
    }

    const p = props as {
      signedIn: boolean;
      source?: FunnelSource;
      errorCode?: string;
    };
    const body: Record<string, unknown> = {
      event,
      signedIn: p.signedIn === true,
      platform,
      appVersion: appVersion(),
    };
    if (p.source) body.source = p.source;
    if (p.errorCode !== undefined) body.errorCode = toErrorCode(p.errorCode);

    const controller =
      typeof AbortController === "function" ? new AbortController() : null;
    const timer = controller
      ? setTimeout(() => controller.abort(), SEND_TIMEOUT_MS)
      : null;

    Promise.resolve()
      .then(() =>
        fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller?.signal,
        }),
      )
      .catch(() => undefined)
      .finally(() => {
        if (timer) clearTimeout(timer);
      })
      .catch(() => undefined);
  } catch {
    // Never let analytics surface as an app error.
  }
}
