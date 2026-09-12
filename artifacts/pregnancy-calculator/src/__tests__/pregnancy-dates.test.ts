import { describe, it, expect } from "vitest";
import {
  calculateByDueDate,
  calculateByLMP,
  PREGNANCY_DURATION_DAYS,
} from "@/lib/pregnancy-math";
import { parseApiDate, localDateString } from "@/lib/dates";

// A due date is a calendar day, not an instant. These assertions compare local
// calendar fields rather than fixed strings, so they hold in any timezone —
// which matters because the bug they guard is invisible in UTC, where CI runs.

/** Local calendar fields of a Date, for timezone-independent comparison. */
function ymd(date: Date): [number, number, number] {
  return [date.getFullYear(), date.getMonth(), date.getDate()];
}

describe("date-only handling", () => {
  it("parses a due date as the day it names", () => {
    // new Date("2026-08-13") is UTC midnight — the 12th, 8pm, in New York.
    expect(ymd(parseApiDate("2026-08-13"))).toEqual([2026, 7, 13]);
  });

  it("stores a local date as the day it falls on", () => {
    // toISOString() would report the 12th anywhere east of Greenwich.
    expect(localDateString(new Date(2026, 7, 13))).toBe("2026-08-13");
  });

  it("round-trips a due date unchanged", () => {
    expect(localDateString(parseApiDate("2026-08-13"))).toBe("2026-08-13");
  });
});

describe("calculateByDueDate", () => {
  it("keeps the EDD on the day the user entered", () => {
    const results = calculateByDueDate("2026-08-13");
    expect(results).not.toBeNull();
    expect(ymd(results!.edd)).toEqual([2026, 7, 13]);
  });

  it("derives an LMP exactly 280 days before that day", () => {
    const results = calculateByDueDate("2026-08-13")!;
    const expected = new Date(2026, 7, 13);
    expected.setDate(expected.getDate() - PREGNANCY_DURATION_DAYS);
    expect(ymd(results.lmp)).toEqual(ymd(expected));
  });

  it("agrees with the LMP route — the same pregnancy either way round", () => {
    const fromDueDate = calculateByDueDate("2026-08-13")!;
    const lmpString = localDateString(fromDueDate.lmp);
    const fromLmp = calculateByLMP(lmpString)!;

    expect(ymd(fromLmp.edd)).toEqual(ymd(fromDueDate.edd));
    expect(fromLmp.currentGestationalAgeDays).toBe(
      fromDueDate.currentGestationalAgeDays,
    );
  });
});
