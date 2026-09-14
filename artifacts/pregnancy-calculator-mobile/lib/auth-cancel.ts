/**
 * Telling a deliberate dismissal apart from a failed SSO flow — and making
 * sure the second one is never thrown away.
 *
 * `WebBrowser` reports a dismissal whenever the browser closes without the
 * redirect completing, so a genuine configuration failure arrives shaped
 * exactly like the user swiping the sheet away. Staying quiet on screen is the
 * right call either way; staying quiet in the log is not, and cost an evening
 * of a Google sign-in that failed with nothing written anywhere.
 */

/**
 * The text a cancellation is matched against.
 *
 * Strict on purpose: only a real message counts, and an error carrying none
 * yields nothing to match. Reading a JSON dump of the whole error instead let
 * a Clerk failure be classified as a dismissal because "cancel" or "dismiss"
 * appeared in a `longMessage`, a provider detail or a flag like
 * `dismissable: true`. Silence needs positive evidence; without it, the error
 * is real and the user hears about it.
 */
function cancelText(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (typeof err === "object" && err !== null) {
    const e = err as {
      message?: unknown;
      errors?: Array<{ message?: unknown } | undefined>;
    };
    if (typeof e.message === "string") return e.message;
    const first = Array.isArray(e.errors) ? e.errors[0] : undefined;
    if (first && typeof first.message === "string") return first.message;
    return "";
  }
  return String(err);
}

/** The human-readable half of a log line; unlike `cancelText`, never empty. */
function errorMessage(err: unknown): string {
  return cancelText(err) || safeSerialize(err);
}

/**
 * Returns true when `err` signals that the user deliberately cancelled an
 * SSO flow — Google consent screen dismissed (browser back / swipe-down) or
 * Apple Sign-In sheet dismissed (ERR_CANCELED).
 *
 * Used in sign-in and sign-up screens to suppress error messages for
 * intentional dismissals. It decides what the user sees, never whether the
 * failure is recorded — see `logAuthFailure`.
 */
export function isCancelError(err: unknown): boolean {
  if (!err) return false;

  // Apple Sign-In fires an error object with code === "ERR_CANCELED".
  if (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: unknown }).code === "ERR_CANCELED"
  ) {
    return true;
  }

  // Google / WebBrowser dismissal surfaces "cancel", "dismiss", or
  // "user_cancel" in the message.
  return /cancel|dismiss|user_cancel/i.test(cancelText(err));
}

/**
 * Records every auth failure, including the ones classified as a cancellation.
 *
 * Call this before deciding whether to show the user anything. A dismissal that
 * is really a broken redirect URI, an unallowlisted scheme or a linking step
 * the app has no screen for is indistinguishable on screen — the log line is
 * the only place the difference survives.
 */
export function logAuthFailure(context: string, err: unknown): void {
  const cancelled = isCancelError(err);
  console.error(
    `${context} failed${cancelled ? " (treated as user cancellation)" : ""}:`,
    errorMessage(err),
    safeSerialize(err),
  );
}

/** Never let diagnostics throw: a circular payload must not break the catch. */
function safeSerialize(err: unknown): string {
  try {
    return JSON.stringify(err, null, 2) ?? String(err);
  } catch {
    return String(err);
  }
}
