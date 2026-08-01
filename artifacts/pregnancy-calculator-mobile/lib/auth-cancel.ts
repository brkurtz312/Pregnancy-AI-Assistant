/**
 * Returns true when `err` signals that the user deliberately cancelled an
 * SSO flow — Google consent screen dismissed (browser back / swipe-down) or
 * Apple Sign-In sheet dismissed (ERR_CANCELED).
 *
 * Used in sign-in and sign-up screens to suppress error messages for
 * intentional dismissals.
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
  // "user_cancel" in the error message string.
  const msg =
    err instanceof Error
      ? err.message
      : typeof err === "object"
        ? JSON.stringify(err)
        : String(err);
  return /cancel|dismiss|user_cancel/i.test(msg);
}
