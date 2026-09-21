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

  it("reports the stage reached rather than going silent", () => {
    // Returning null here was a real mistake: a build where the drain never
    // ran looked identical to not being on the new build at all.
    expect(watchBridgeSummary(getWatchBridgeCounts())).toBe(
      "Watch records: no drain yet (effect ran 0, registered 0)",
    );
  });

  it("shows where the chain stalled when the drain never completes", () => {
    countWatchBridge({ effectRuns: 1, listenerStrategy: "module" });
    // registered stays 0: setActiveWatchUser never resolved.
    expect(watchBridgeSummary(getWatchBridgeCounts())).toBe(
      "Watch records: no drain yet (effect ran 1, registered 0, events via module)",
    );
  });

  it("distinguishes a stalled register from a drain that found nothing", () => {
    countWatchBridge({ effectRuns: 1, registered: 1, drains: 1, returned: 0 });
    expect(watchBridgeSummary(getWatchBridgeCounts())).toBe(
      "Watch records: 0 found, 0 saved",
    );
  });

  it("reports an effect that keeps being skipped as already drained", () => {
    countWatchBridge({ effectRuns: 1, alreadyDrained: 3 });
    expect(watchBridgeSummary(getWatchBridgeCounts())).toContain("skipped 3");
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

describe("the register stall that broke Watch sync", () => {
  beforeEach(() => {
    __resetWatchBridgeCountsForTests();
  });

  it("reports a register that never resolved", () => {
    // The real reading from a device on 20 Sep 2026: the effect ran once,
    // setActiveWatchUser never settled, and all 28 later effect runs hit the
    // already-drained guard. The drain never ran in any session.
    countWatchBridge({ effectRuns: 1, alreadyDrained: 28 });
    countWatchBridge({ listenerStrategy: "emitter" });
    expect(watchBridgeSummary(getWatchBridgeCounts())).toBe(
      "Watch records: no drain yet (effect ran 1, registered 0, skipped 28, events via emitter)",
    );
  });

  it("reports when the timeout let the drain go ahead anyway", () => {
    countWatchBridge({ effectRuns: 1, registerTimeouts: 1 });
    expect(watchBridgeSummary(getWatchBridgeCounts())).toContain(
      "register timeouts 1",
    );
  });

  it("a timed-out register still reaches the drain", () => {
    // The point of the timeout: the chain continues, so found/saved replaces
    // "no drain yet" entirely.
    countWatchBridge({ effectRuns: 1, registerTimeouts: 1 });
    countWatchBridge({ drains: 1, returned: 2, dispatched: 2, saved: 2 });
    expect(watchBridgeSummary(getWatchBridgeCounts())).toBe(
      "Watch records: 2 found, 2 saved",
    );
  });
});

describe("the generation token that killed every drain", () => {
  beforeEach(() => {
    __resetWatchBridgeCountsForTests();
  });

  it("reports a chain abandoned by a generation bump", () => {
    // The device reading on 1.0.18: effect ran once, 18 do-nothing re-runs
    // each bumped the generation token, and the one real chain abandoned
    // itself at its first check — before any counter, which made it look like
    // the register promise had never settled.
    countWatchBridge({ effectRuns: 1, alreadyDrained: 18 });
    countWatchBridge({ generationAbandoned: 1 });
    countWatchBridge({ listenerStrategy: "module" });
    expect(watchBridgeSummary(getWatchBridgeCounts())).toBe(
      "Watch records: no drain yet (effect ran 1, registered 0, skipped 18, abandoned 1, events via module)",
    );
  });

  it("distinguishes an abandoned chain from a stalled register", () => {
    // Both read as "registered 0". Only one of them is a promise problem.
    countWatchBridge({ effectRuns: 1, generationAbandoned: 1 });
    const abandoned = watchBridgeSummary(getWatchBridgeCounts());

    __resetWatchBridgeCountsForTests();
    countWatchBridge({ effectRuns: 1, registerTimeouts: 1 });
    const stalled = watchBridgeSummary(getWatchBridgeCounts());

    expect(abandoned).toContain("abandoned 1");
    expect(abandoned).not.toContain("register timeouts");
    expect(stalled).toContain("register timeouts 1");
    expect(stalled).not.toContain("abandoned");
  });
});
