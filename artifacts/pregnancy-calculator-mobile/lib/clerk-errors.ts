/**
 * Extract a human-friendly message from a Clerk error.
 *
 * Clerk throws errors shaped like `{ errors: [{ message, longMessage }] }`.
 * In strict mode the catch variable is `unknown`, so we narrow defensively
 * and fall back to a caller-provided message when the shape doesn't match.
 */
export function clerkErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === "object" && "errors" in err) {
    const errors = (
      err as { errors?: Array<{ message?: string; longMessage?: string }> }
    ).errors;
    const first = errors?.[0];
    if (first) return first.longMessage ?? first.message ?? fallback;
  }
  return fallback;
}
