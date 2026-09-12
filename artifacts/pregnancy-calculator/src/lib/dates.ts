/**
 * Calendar-date helpers for the `YYYY-MM-DD` values the API stores and the
 * date inputs the calculator reads.
 *
 * JavaScript treats a date-only string as UTC in one direction and local time
 * in the other, so a due date shifts by a day depending on which side of
 * Greenwich the browser is:
 *
 *   new Date("2026-08-13")          // UTC midnight → Aug 12, 8pm in New York
 *   localMidnight.toISOString()     // → "2026-08-12" in Berlin, Tokyo, Sydney
 *
 * An estimated due date is a calendar day, not an instant, and it drives every
 * gestational-age number in the app.
 *
 * The mobile app has its own copy at
 * artifacts/pregnancy-calculator-mobile/lib/dates.ts — separate package, and
 * neither depends on the other.
 */

/** Matches a bare calendar date with no time or zone attached. */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parses a date string into a Date positioned in local time.
 *
 * A date-only string is built from its parts, so `2026-08-13` is local
 * midnight on the 13th rather than UTC midnight — which is the 12th for
 * anyone in the Americas. Strings carrying a time are already unambiguous
 * instants and are parsed as-is.
 */
export function parseApiDate(value: string): Date {
  if (DATE_ONLY.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day);
  }
  return new Date(value);
}

/**
 * Formats a Date as the `YYYY-MM-DD` calendar day it falls on locally.
 *
 * Not `toISOString().slice(0, 10)`, which reports the UTC day and stores local
 * midnight as the previous date everywhere east of Greenwich.
 */
export function localDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
