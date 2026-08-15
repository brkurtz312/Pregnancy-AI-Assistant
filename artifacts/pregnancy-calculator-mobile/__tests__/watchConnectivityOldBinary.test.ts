/**
 * Simulates an OLDER installed binary running a NEWER OTA JS bundle: the
 * native WatchConnectivity module exists but is missing methods that were
 * added in later binary versions.
 *
 * Every wrapper method must degrade to an async no-op (or stub value) instead
 * of throwing synchronously — a sync throw bypasses callers' `.catch()` and
 * crashes the app (this happened at startup with `signOut()`).
 */

// Native module present, but with NO methods at all — the worst case of an
// old binary. addListener support comes from the EventEmitter; simulate an
// old emitter that throws when subscribing to an unknown event.
jest.mock("expo-modules-core", () => ({
  NativeModulesProxy: {
    WatchConnectivity: {}, // module exists, every method missing
  },
  EventEmitter: class {
    addListener() {
      throw new Error("Unsupported event on old binary");
    }
  },
}));

import WatchConnectivity from "../modules/WatchConnectivity";

describe("WatchConnectivity on an older binary (native methods missing)", () => {
  it("sendTips resolves without throwing", async () => {
    await expect(
      WatchConnectivity.sendTips([{ id: 1 }]),
    ).resolves.toBeUndefined();
  });

  it("sendGestationalWeek resolves without throwing", async () => {
    await expect(
      WatchConnectivity.sendGestationalWeek(20),
    ).resolves.toBeUndefined();
  });

  it("sendWeekAndTips resolves without throwing", async () => {
    await expect(
      WatchConnectivity.sendWeekAndTips(20, [{ id: 1 }]),
    ).resolves.toBeUndefined();
  });

  it("signOut resolves without throwing (the original crash)", async () => {
    await expect(WatchConnectivity.signOut()).resolves.toBeUndefined();
  });

  it("does not throw synchronously even without awaiting", () => {
    // The exact failure mode of the incident: a synchronous throw bypasses
    // .catch(). Calling the method must never throw before returning a promise.
    expect(() => {
      WatchConnectivity.signOut().catch(() => {});
      WatchConnectivity.sendTips([]).catch(() => {});
      WatchConnectivity.sendWeekAndTips(1, []).catch(() => {});
    }).not.toThrow();
  });

  it("getSessionState resolves with the safe stub state", async () => {
    await expect(WatchConnectivity.getSessionState()).resolves.toEqual({
      activationState: "notActivated",
      isWatchAppInstalled: false,
      isReachable: false,
      isSupported: false,
    });
  });

  it("addListener returns a removable subscription instead of throwing", () => {
    let sub!: { remove: () => void };
    expect(() => {
      sub = WatchConnectivity.addListener("newEvent", () => {});
    }).not.toThrow();
    expect(() => sub.remove()).not.toThrow();
  });
});
