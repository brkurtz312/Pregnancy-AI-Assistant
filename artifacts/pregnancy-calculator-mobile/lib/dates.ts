/**
 * Calendar-date helpers for the `YYYY-MM-DD` values the API stores as
 * `sessionDate` (contractions, symptoms, kick sessions).
 *
 * Both functions exist because JavaScript treats a date-only string as UTC in
 * one direction and local time in the other, which silently shifts a session
 * to the wrong day for anyone west of UTC:
 *
 *   new Date().toISOString().slice(0, 10)   // 9:30pm Aug 13 in New York → "2026-08-14"
 *   new Date("2026-08-13")                  // → Aug 12, 8pm local → renders "Aug 12"
 *
 * A contraction belongs to the day the person was awake for, not to whatever
 * day it happened to be in Greenwich.
 */

/**
 * Today's calendar date where the device is, as `YYYY-MM-DD`.
 *
 * Takes an optional date so callers and tests can pin an instant; defaults to
 * now. Uses the local getters rather than `toISOString`, which would report
 * the UTC day and file an evening session under tomorrow.
 */
export function localDateString(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Matches a bare calendar date with no time or zone attached. */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parses an API date string into a Date positioned in local time.
 *
 * A date-only string is built from its parts, so `2026-08-13` is local
 * midnight on the 13th rather than UTC midnight — which renders as the 12th in
 * the Americas. Anything carrying a time (a full ISO timestamp such as
 * `startedAt`) is already an unambiguous instant and is parsed as-is.
 */
export function parseApiDate(value: string): Date {
  if (DATE_ONLY.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day);
  }
  return new Date(value);
}
