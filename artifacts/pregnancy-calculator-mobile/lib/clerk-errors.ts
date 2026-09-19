/**
 * Making a refused Clerk call say something.
 *
 * `signIn.password()` and its siblings return `{ error }` rather than
 * throwing, and every auth screen here handled that with `if (error) return;`.
 * What the user saw then depended entirely on where Clerk had filed the
 * error: the screens render `errors.fields.identifier`, `.password` and
 * `.code`, so a wrong password produced a message, and everything else
 * produced nothing at all. No message, no spinner, no log — a button that
 * appears not to work.
 *
 * `session_exists` is the one to know: Clerk refuses a sign-in while a session
 * is already active, and files it under `global`. Signing in with Apple and
 * then trying email is enough to hit it, and the screen stays blank.
 */

/** Never let diagnostics throw: a circular payload must not break a catch. */
function safeSerialize(err: unknown): string {
  try {
    return JSON.stringify(err) ?? String(err);
  } catch {
    return String(err);
  }
}

/**
 * The most specific message Clerk gave, whatever shape it arrived in.
 *
 * `longMessage` first because it is the one written for a person to read
 * ("You're already signed in" rather than "session_exists").
 */
export function clerkErrorMessage(err: unknown, fallback: string): string {
  if (!err) return fallback;
  if (typeof err === "string") return err || fallback;

  const e = err as {
    errors?: Array<{ longMessage?: unknown; message?: unknown } | undefined>;
    longMessage?: unknown;
    message?: unknown;
  };

  const first = Array.isArray(e.errors) ? e.errors[0] : undefined;
  const candidates = [
    first?.longMessage,
    first?.message,
    e.longMessage,
    e.message,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate;
  }
  return fallback;
}

/**
 * Records a refusal, always.
 *
 * Whether the user sees anything is a separate decision from whether it is
 * written down — the same rule as `logAuthFailure` in lib/auth-cancel.ts, and
 * for the same reason: the silent ones cost the most to find.
 */
export function logClerkFailure(context: string, err: unknown): void {
  console.error(
    `${context} failed:`,
    clerkErrorMessage(err, "(no message)"),
    safeSerialize(err),
  );
}

/**
 * The first global error's message, for screens that render `errors.fields.*`
 * and would otherwise drop everything Clerk did not attach to a field.
 */
export function globalClerkErrorText(errors: {
  global?: Array<{ message?: unknown }> | null;
}): string | null {
  const first = errors.global?.[0];
  const message = first?.message;
  return typeof message === "string" && message.trim() ? message : null;
}
