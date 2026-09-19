import { localDateString, parseApiDate } from "@/lib/dates";

// These assertions are written to hold in any timezone: each one compares
// against the local calendar fields of a Date built from local parts, rather
// than against a hardcoded string. The bug they guard was invisible precisely
// because CI runs in UTC, where both directions of the UTC/local mix-up cancel
// out and the old code looked correct.

describe("localDateString", () => {
  it("reports the local calendar day, not the UTC one", () => {
    // 9:30pm on 13 Aug. In any timezone west of UTC, the UTC day is already
    // the 14th — which is what toISOString() would have returned.
    const evening = new Date(2026, 7, 13, 21, 30);
    expect(localDateString(evening)).toBe("2026-08-13");
  });

  it("pads single-digit months and days", () => {
    expect(localDateString(new Date(2026, 0, 5, 12, 0))).toBe("2026-01-05");
  });

  it("does not roll over just before midnight", () => {
    const almostMidnight = new Date(2026, 7, 13, 23, 59, 59);
    expect(localDateString(almostMidnight)).toBe("2026-08-13");
  });

  it("agrees with the Date it was given, whatever the zone", () => {
    const now = new Date();
    const [year, month, day] = localDateString(now).split("-").map(Number);
    expect([year, month - 1, day]).toEqual([
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    ]);
  });
});

describe("parseApiDate", () => {
  it("reads a bare calendar date as that local day", () => {
    // new Date("2026-08-13") is UTC midnight, which is 12 Aug in the Americas.
    const parsed = parseApiDate("2026-08-13");
    expect([parsed.getFullYear(), parsed.getMonth(), parsed.getDate()]).toEqual(
      [2026, 7, 13],
    );
  });

  it("renders that date as the same day it names", () => {
    const label = parseApiDate("2026-08-13").toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    expect(label).toBe("Aug 13");
  });

  it("round-trips through localDateString", () => {
    expect(localDateString(parseApiDate("2026-03-01"))).toBe("2026-03-01");
  });

  it("leaves a full timestamp alone — it is already an instant", () => {
    const iso = "2026-08-13T09:10:00.000Z";
    expect(parseApiDate(iso).getTime()).toBe(new Date(iso).getTime());
  });
});
