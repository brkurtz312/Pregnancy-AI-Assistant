import {
  clearWatchBridgeFailure,
  getWatchBridgeFailure,
  recordWatchBridgeFailure,
  subscribeWatchBridgeFailure,
  watchBridgeMessage,
  __resetWatchBridgeFailureForTests,
} from "../lib/watch-bridge-log";

beforeEach(() => {
  __resetWatchBridgeFailureForTests();
});

describe("watchBridgeMessage", () => {
  it("names the stage and the underlying reason", () => {
    expect(watchBridgeMessage("register", new Error("bridge offline"))).toBe(
      "Watch link setup failed: bridge offline",
    );
  });

  it("reads a message or code out of a native error object", () => {
    expect(watchBridgeMessage("drain", { message: "no such key" })).toBe(
      "Watch records could not be read: no such key",
    );
    expect(watchBridgeMessage("drain", { code: "ERR_UNAVAILABLE" })).toBe(
      "Watch records could not be read: ERR_UNAVAILABLE",
    );
  });

  // The module-missing case has no error to report; the stage alone is the
  // whole message and must not read "... : null".
  it("falls back to the stage label when there is no detail", () => {
    expect(watchBridgeMessage("module", null)).toBe("Watch module unavailable");
    expect(watchBridgeMessage("module", undefined)).toBe(
      "Watch module unavailable",
    );
  });
});

describe("failure store", () => {
  it("starts empty", () => {
    expect(getWatchBridgeFailure()).toBeNull();
  });

  it("records and exposes the last failure", () => {
    recordWatchBridgeFailure("register", new Error("boom"));
    expect(getWatchBridgeFailure()?.stage).toBe("register");
    expect(getWatchBridgeFailure()?.message).toContain("boom");
  });

  // A stale error left on screen after the bridge recovers would send the next
  // person hunting a problem that is already gone.
  it("clears on a successful registration", () => {
    recordWatchBridgeFailure("register", new Error("boom"));
    clearWatchBridgeFailure();
    expect(getWatchBridgeFailure()).toBeNull();
  });

  it("notifies subscribers on record and on clear", () => {
    const seen: Array<string | null> = [];
    const unsubscribe = subscribeWatchBridgeFailure((f) =>
      seen.push(f?.stage ?? null),
    );
    recordWatchBridgeFailure("drain", new Error("x"));
    clearWatchBridgeFailure();
    expect(seen).toEqual(["drain", null]);
    unsubscribe();
    recordWatchBridgeFailure("register", new Error("y"));
    expect(seen).toEqual(["drain", null]);
  });

  it("does not notify when clearing an already-empty store", () => {
    const seen: unknown[] = [];
    subscribeWatchBridgeFailure((f) => seen.push(f));
    clearWatchBridgeFailure();
    expect(seen).toEqual([]);
  });
});
