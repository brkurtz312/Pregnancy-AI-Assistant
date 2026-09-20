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
      "Watch live updates unavailable (no working event API)",
    );
  });

  it("counts live events separately from drained ones", () => {
    countWatchBridge({ live: 1, dispatched: 1 });
    expect(watchBridgeSummary(getWatchBridgeCounts())).toContain("1 live");
  });
});

describe("the silent exits that hid the Watch defect", () => {
  beforeEach(() => {
    __resetWatchBridgeCountsForTests();
  });

  it("names a failed sign-in token rather than saying nothing", () => {
    // `await getToken()` sat outside the try block: a rejection threw out of
    // the handler with no save, no toast and no error, leaving the native
    // receipt unacknowledged so it replayed and failed the same way forever.
    countWatchBridge({ drains: 1, returned: 2, dispatched: 2 });
    countWatchBridge({ tokenFailed: 2 });
    expect(watchBridgeSummary(getWatchBridgeCounts())).toContain(
      "2 failed, no sign-in token",
    );
  });

  it("names an account change rather than saying nothing", () => {
    countWatchBridge({ drains: 1, returned: 1, dispatched: 1 });
    countWatchBridge({ droppedGeneration: 1 });
    expect(watchBridgeSummary(getWatchBridgeCounts())).toContain(
      "1 dropped, account changed",
    );
  });

  it("distinguishes found-but-unsaved from never-found", () => {
    // The two states the phone could not tell apart on 20 Sep 2026.
    countWatchBridge({ drains: 1, returned: 0 });
    expect(watchBridgeSummary(getWatchBridgeCounts())).toBe(
      "Watch records: 0 found, 0 saved",
    );

    __resetWatchBridgeCountsForTests();
    countWatchBridge({ drains: 1, returned: 3, dispatched: 3, tokenFailed: 3 });
    expect(watchBridgeSummary(getWatchBridgeCounts())).toBe(
      "Watch records: 3 found, 0 saved, 3 failed, no sign-in token",
    );
  });
});

describe("which event API attached", () => {
  beforeEach(() => {
    __resetWatchBridgeCountsForTests();
  });

  it("names the event API while no live event has arrived", () => {
    // Function calls bridge fine under both APIs, so a dead event path is
    // invisible from every other symptom — worth saying out loud.
    countWatchBridge({ listenerStrategy: "emitter" });
    countWatchBridge({ drains: 1, returned: 1 });
    expect(watchBridgeSummary(getWatchBridgeCounts())).toContain(
      "events via emitter",
    );
  });

  it("stops mentioning it once a live event has proved it works", () => {
    countWatchBridge({ listenerStrategy: "module" });
    countWatchBridge({ drains: 1, returned: 1, live: 1, dispatched: 1 });
    expect(watchBridgeSummary(getWatchBridgeCounts())).not.toContain(
      "events via",
    );
  });
});
