/**
 * The counters exist because failure logging was not enough: a drain that
 * returns records and saves none reports no error at all, which is the shape
 * the Watch -> phone defect actually had on 20 Sep 2026.
 */
import {
  countWatchBridge,
  getWatchBridgeCounts,
  watchBridgeSummary,
  __resetWatchBridgeCountsForTests,
} from "@/lib/watch-bridge-log";

describe("watch bridge counters", () => {
  beforeEach(() => {
    __resetWatchBridgeCountsForTests();
  });

  it("says nothing before anything has happened", () => {
    expect(watchBridgeSummary(getWatchBridgeCounts())).toBeNull();
  });

  it("accumulates rather than replaces", () => {
    countWatchBridge({ drains: 1, returned: 2 });
    countWatchBridge({ drains: 1, returned: 3 });
    const c = getWatchBridgeCounts();
    expect(c.drains).toBe(2);
    expect(c.returned).toBe(5);
  });

  it("reports the diagnosis: records found, none saved", () => {
    countWatchBridge({ drains: 1, returned: 3 });
    expect(watchBridgeSummary(getWatchBridgeCounts())).toBe(
      "Watch records: 3 found, 0 saved",
    );
  });

  it("names the reason records were skipped", () => {
    countWatchBridge({ drains: 1, returned: 2 });
    countWatchBridge({ skipped: 2, lastSkipReason: "no end time" });
    expect(watchBridgeSummary(getWatchBridgeCounts())).toContain(
      "2 skipped (no end time)",
    );
  });

  it("reports records dropped because JS thought it was signed out", () => {
    countWatchBridge({ drains: 1, returned: 1 });
    countWatchBridge({ droppedSignedOut: 1 });
    expect(watchBridgeSummary(getWatchBridgeCounts())).toContain(
      "1 dropped, signed out",
    );
  });

  it("distinguishes a save from an offline queue entry", () => {
    countWatchBridge({ drains: 1, returned: 2, saved: 1, queued: 1 });
    const summary = watchBridgeSummary(getWatchBridgeCounts());
    expect(summary).toContain("2 found, 1 saved");
    expect(summary).toContain("1 queued offline");
  });

  it("a dead live listener outranks every other line", () => {
    countWatchBridge({ drains: 1, returned: 5, saved: 5 });
    countWatchBridge({ listenerFailed: true });
    expect(watchBridgeSummary(getWatchBridgeCounts())).toBe(
      "Watch live updates unavailable (listener failed)",
    );
  });

  it("counts live events separately from drained ones", () => {
    countWatchBridge({ live: 1, dispatched: 1 });
    expect(watchBridgeSummary(getWatchBridgeCounts())).toContain("1 live");
  });
});
