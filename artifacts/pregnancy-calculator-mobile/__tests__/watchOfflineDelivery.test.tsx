/**
 * watchOfflineDelivery.test.tsx
 *
 * Confirms that kick sessions and contractions queued on the Watch via
 * WCSession.transferUserInfo (the offline fallback used when the iPhone is
 * unreachable) are correctly delivered to the JS layer after reconnect.
 *
 * Architecture recap
 * ──────────────────
 * Online path  (iPhone in range):
 *   Watch  →  WCSession.sendMessage
 *   Phone  ←  didReceiveMessage  →  PhoneWatchBridge.handleMessage
 *          →  self.onKickSessionEnd?(json)
 *          →  native sendEvent("onKickSessionEnd")
 *          →  useWatchConnectivity addListener("onKickSessionEnd")  →  JS callback
 *
 * Offline path (iPhone out of range):
 *   Watch  →  WCSession.transferUserInfo
 *   Phone  ←  didReceiveUserInfo  →  PhoneWatchBridge.handleMessage
 *          →  self.onKickSessionEnd?(json)          ← same handler as online path
 *          →  native sendEvent("onKickSessionEnd")  ← same native event
 *          →  useWatchConnectivity addListener("onKickSessionEnd")  →  JS callback
 *
 * Both transports share the handleMessage → native-event pipeline, so the JS
 * difference between online and offline is which *WCSessionDelegate method*
 * fires — but the native event name and payload structure are identical.
 *
 * These tests verify the JS subscription boundary: that useWatchConnectivity
 * correctly subscribes to "onKickSessionEnd" and "onContractionUpdate" via the
 * native module's addListener, and that the registered callbacks are invoked
 * with the correct decoded payload when the native module emits the event.
 * This is the layer that would break if didReceiveUserInfo were removed or
 * stopped calling handleMessage.
 *
 * This mirrors the approach in watchSyncRequest.test.tsx (which tests the
 * "onSyncRequest" event fired from the Watch via the same transferUserInfo
 * channel).
 */

import React from "react";
import { Platform } from "react-native";
import { act, create } from "react-test-renderer";

jest.mock("react-native-reanimated", () =>
  require("react-native-reanimated/mock"),
);

// ── Mock WatchConnectivity native module ──────────────────────────────────────
//
// The mock captures every addListener call so tests can fire events manually
// by calling fireNativeEvent(name, payload).  This simulates the native
// module emitting "onKickSessionEnd" / "onContractionUpdate" — exactly what
// PhoneWatchBridge.handleMessage does after decoding a transferUserInfo payload
// in didReceiveUserInfo.

const capturedListeners: Record<string, ((...args: unknown[]) => void)[]> = {};

const mockSendWeekAndTips = jest.fn().mockResolvedValue(undefined);
const mockGetSessionState = jest.fn().mockResolvedValue({
  activationState: "activated",
  isWatchAppInstalled: true,
  isReachable: false, // Watch is *not* reachable — offline scenario
});
const mockAddListener = jest.fn(
  (event: string, cb: (...args: unknown[]) => void) => {
    if (!capturedListeners[event]) capturedListeners[event] = [];
    capturedListeners[event].push(cb);
    return {
      remove: () => {
        capturedListeners[event] = (capturedListeners[event] ?? []).filter(
          (l) => l !== cb,
        );
      },
    };
  },
);

jest.mock("../modules/WatchConnectivity", () => ({
  __esModule: true,
  default: {
    sendTips: jest.fn().mockResolvedValue(undefined),
    sendGestationalWeek: jest.fn().mockResolvedValue(undefined),
    sendWeekAndTips: mockSendWeekAndTips,
    getSessionState: mockGetSessionState,
    getActivationDiagnostic: jest.fn().mockResolvedValue("OK state=2"),
    addListener: mockAddListener,
    signOut: jest.fn().mockResolvedValue(undefined),
  },
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────────
import {
  useWatchConnectivity,
  type KickSessionSummary,
  type ContractionRecord,
} from "../hooks/useWatchConnectivity";

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Fire all registered listeners for a native event name with the given
 * payload.  This simulates the native module emitting an event (e.g. as
 * PhoneWatchBridge.handleMessage does after decoding a transferUserInfo
 * payload in didReceiveUserInfo).
 */
function fireNativeEvent(event: string, payload: unknown = {}) {
  (capturedListeners[event] ?? []).forEach((cb) => cb(payload));
}

type WatchHarnessProps = {
  onKickSessionEnd?: (s: KickSessionSummary) => void | Promise<void>;
  onContractionUpdate?: (r: ContractionRecord) => void | Promise<void>;
};

/**
 * Minimal harness that mounts useWatchConnectivity with provided callbacks.
 * Gestational week + tips are included so the hook has valid data if it ever
 * tries to push to the Watch.
 */
function WatchHarness({
  onKickSessionEnd,
  onContractionUpdate,
}: WatchHarnessProps) {
  useWatchConnectivity({
    gestationalWeek: 28,
    tips: [{ week: 28, emoji: "👶", text: "Week 28 tip." }],
    onKickSessionEnd,
    onContractionUpdate,
  });
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────

describe("useWatchConnectivity — onKickSessionEnd subscription (offline/transferUserInfo path)", () => {
  let originalOS: typeof Platform.OS;

  beforeAll(() => {
    originalOS = Platform.OS;
    Object.defineProperty(Platform, "OS", { value: "ios", writable: true });
  });

  afterAll(() => {
    Object.defineProperty(Platform, "OS", {
      value: originalOS,
      writable: true,
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    Object.keys(capturedListeners).forEach((k) => delete capturedListeners[k]);
    mockGetSessionState.mockResolvedValue({
      activationState: "activated",
      isWatchAppInstalled: true,
      isReachable: false, // Watch offline — payload arrived via transferUserInfo
    });
    mockAddListener.mockImplementation(
      (event: string, cb: (...args: unknown[]) => void) => {
        if (!capturedListeners[event]) capturedListeners[event] = [];
        capturedListeners[event].push(cb);
        return {
          remove: () => {
            capturedListeners[event] = (capturedListeners[event] ?? []).filter(
              (l) => l !== cb,
            );
          },
        };
      },
    );
  });

  it("registers an onKickSessionEnd listener with the native module", async () => {
    const onKickSessionEnd = jest.fn();

    await act(async () => {
      create(<WatchHarness onKickSessionEnd={onKickSessionEnd} />);
    });

    // useWatchConnectivity must subscribe via addListener("onKickSessionEnd")
    // so the native module can route both sendMessage and transferUserInfo
    // deliveries to the same JS callback.
    expect(capturedListeners["onKickSessionEnd"]).toBeDefined();
    expect(capturedListeners["onKickSessionEnd"]).toHaveLength(1);
  });

  it("invokes the onKickSessionEnd callback when the native module fires the event (simulates didReceiveUserInfo routing)", async () => {
    // This is the JS analogue of didReceiveUserInfo → handleMessage →
    // sendEvent("onKickSessionEnd") on the Swift side.
    const onKickSessionEnd = jest.fn();

    await act(async () => {
      create(<WatchHarness onKickSessionEnd={onKickSessionEnd} />);
    });

    // Simulate the native module emitting the event after decoding a
    // transferUserInfo payload (the Watch was offline; this payload was queued
    // and delivered on reconnect).
    const offlinePayload: KickSessionSummary = {
      kickCount: 8,
      startedAt: "2026-08-04T07:00:00.000Z",
      endedAt: "2026-08-04T07:45:00.000Z",
    };

    act(() => {
      fireNativeEvent("onKickSessionEnd", offlinePayload);
    });

    expect(onKickSessionEnd).toHaveBeenCalledTimes(1);
    expect(onKickSessionEnd).toHaveBeenCalledWith(offlinePayload);
  });

  it("invokes the callback with the correct payload for a zero-kick session queued offline", async () => {
    // The Watch can end a session with 0 kicks; transferUserInfo queues it
    // the same way, and the phone must deliver it to the callback unchanged.
    const onKickSessionEnd = jest.fn();

    await act(async () => {
      create(<WatchHarness onKickSessionEnd={onKickSessionEnd} />);
    });

    const zeroKickPayload: KickSessionSummary = {
      kickCount: 0,
      startedAt: "2026-08-04T09:00:00.000Z",
      endedAt: "2026-08-04T09:05:00.000Z",
    };

    act(() => {
      fireNativeEvent("onKickSessionEnd", zeroKickPayload);
    });

    expect(onKickSessionEnd).toHaveBeenCalledTimes(1);
    expect(onKickSessionEnd).toHaveBeenCalledWith(zeroKickPayload);
  });

  it("delivers multiple queued kick sessions in order (transferUserInfo guaranteed-ordered replay)", async () => {
    // transferUserInfo guarantees ordered delivery.  Each queued payload
    // triggers one native event.  The hook must invoke the callback once per
    // event, in the order they fire.
    const onKickSessionEnd = jest.fn();

    await act(async () => {
      create(<WatchHarness onKickSessionEnd={onKickSessionEnd} />);
    });

    // TestFlight step 5.9: two sessions queued while phone was in airplane mode.
    const first: KickSessionSummary = {
      kickCount: 8,
      startedAt: "2026-08-04T10:00:00.000Z",
      endedAt: "2026-08-04T10:30:00.000Z",
    };
    const second: KickSessionSummary = {
      kickCount: 6,
      startedAt: "2026-08-04T11:00:00.000Z",
      endedAt: "2026-08-04T11:20:00.000Z",
    };

    act(() => {
      fireNativeEvent("onKickSessionEnd", first);
      fireNativeEvent("onKickSessionEnd", second);
    });

    expect(onKickSessionEnd).toHaveBeenCalledTimes(2);
    // Order must be preserved — first session arrives first.
    expect(onKickSessionEnd).toHaveBeenNthCalledWith(1, first);
    expect(onKickSessionEnd).toHaveBeenNthCalledWith(2, second);
  });

  it("removes the onKickSessionEnd listener when the component unmounts", async () => {
    const onKickSessionEnd = jest.fn();
    let renderer!: ReturnType<typeof create>;

    await act(async () => {
      renderer = create(<WatchHarness onKickSessionEnd={onKickSessionEnd} />);
    });

    expect(capturedListeners["onKickSessionEnd"]).toHaveLength(1);

    act(() => {
      renderer.unmount();
    });

    // After unmount, the subscription must be removed so stale callbacks
    // don't fire into a dead component on the next reconnect.
    expect(capturedListeners["onKickSessionEnd"] ?? []).toHaveLength(0);
  });

  it("does not invoke a stale onKickSessionEnd callback after unmount", async () => {
    const onKickSessionEnd = jest.fn();
    let renderer!: ReturnType<typeof create>;

    await act(async () => {
      renderer = create(<WatchHarness onKickSessionEnd={onKickSessionEnd} />);
    });

    act(() => {
      renderer.unmount();
    });

    // Fire the native event after the component is gone — must not reach the
    // callback (listener was removed on unmount).
    act(() => {
      fireNativeEvent("onKickSessionEnd", {
        kickCount: 3,
        startedAt: "2026-08-04T12:00:00.000Z",
        endedAt: "2026-08-04T12:10:00.000Z",
      });
    });

    expect(onKickSessionEnd).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("useWatchConnectivity — onContractionUpdate subscription (offline/transferUserInfo path)", () => {
  let originalOS: typeof Platform.OS;

  beforeAll(() => {
    originalOS = Platform.OS;
    Object.defineProperty(Platform, "OS", { value: "ios", writable: true });
  });

  afterAll(() => {
    Object.defineProperty(Platform, "OS", {
      value: originalOS,
      writable: true,
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    Object.keys(capturedListeners).forEach((k) => delete capturedListeners[k]);
    mockGetSessionState.mockResolvedValue({
      activationState: "activated",
      isWatchAppInstalled: true,
      isReachable: false,
    });
    mockAddListener.mockImplementation(
      (event: string, cb: (...args: unknown[]) => void) => {
        if (!capturedListeners[event]) capturedListeners[event] = [];
        capturedListeners[event].push(cb);
        return {
          remove: () => {
            capturedListeners[event] = (capturedListeners[event] ?? []).filter(
              (l) => l !== cb,
            );
          },
        };
      },
    );
  });

  it("registers an onContractionUpdate listener with the native module", async () => {
    const onContractionUpdate = jest.fn();

    await act(async () => {
      create(<WatchHarness onContractionUpdate={onContractionUpdate} />);
    });

    expect(capturedListeners["onContractionUpdate"]).toBeDefined();
    expect(capturedListeners["onContractionUpdate"]).toHaveLength(1);
  });

  it("invokes onContractionUpdate when the native module fires the event (simulates didReceiveUserInfo routing)", async () => {
    // Mirrors the kick-session test above but for the contraction path
    // (TestFlight step 5.9 also covers contractions arriving via transferUserInfo).
    const onContractionUpdate = jest.fn();

    await act(async () => {
      create(<WatchHarness onContractionUpdate={onContractionUpdate} />);
    });

    const offlineContraction: ContractionRecord = {
      startedAt: "2026-08-04T14:00:00.000Z",
      endedAt: "2026-08-04T14:01:30.000Z",
      interval: 360,
    };

    act(() => {
      fireNativeEvent("onContractionUpdate", offlineContraction);
    });

    expect(onContractionUpdate).toHaveBeenCalledTimes(1);
    expect(onContractionUpdate).toHaveBeenCalledWith(offlineContraction);
  });

  it("delivers a contraction without an interval field (first contraction of the session, queued offline)", async () => {
    // First contraction in a session has no preceding one to measure interval
    // from; the payload may legitimately omit the field.
    const onContractionUpdate = jest.fn();

    await act(async () => {
      create(<WatchHarness onContractionUpdate={onContractionUpdate} />);
    });

    const noIntervalPayload: ContractionRecord = {
      startedAt: "2026-08-04T15:00:00.000Z",
      endedAt: "2026-08-04T15:01:00.000Z",
      // interval omitted intentionally
    };

    act(() => {
      fireNativeEvent("onContractionUpdate", noIntervalPayload);
    });

    expect(onContractionUpdate).toHaveBeenCalledTimes(1);
    const received = onContractionUpdate.mock.calls[0][0] as ContractionRecord;
    expect(received.startedAt).toBe(noIntervalPayload.startedAt);
    expect(received.endedAt).toBe(noIntervalPayload.endedAt);
    expect(received.interval).toBeUndefined();
  });

  it("delivers multiple contractions in order when replayed after reconnect", async () => {
    const onContractionUpdate = jest.fn();

    await act(async () => {
      create(<WatchHarness onContractionUpdate={onContractionUpdate} />);
    });

    const first: ContractionRecord = {
      startedAt: "2026-08-04T16:00:00.000Z",
      endedAt: "2026-08-04T16:01:00.000Z",
      interval: 300,
    };
    const second: ContractionRecord = {
      startedAt: "2026-08-04T16:06:00.000Z",
      endedAt: "2026-08-04T16:06:50.000Z",
      interval: 300,
    };

    act(() => {
      fireNativeEvent("onContractionUpdate", first);
      fireNativeEvent("onContractionUpdate", second);
    });

    expect(onContractionUpdate).toHaveBeenCalledTimes(2);
    expect(onContractionUpdate).toHaveBeenNthCalledWith(1, first);
    expect(onContractionUpdate).toHaveBeenNthCalledWith(2, second);
  });

  it("removes the onContractionUpdate listener when the component unmounts", async () => {
    const onContractionUpdate = jest.fn();
    let renderer!: ReturnType<typeof create>;

    await act(async () => {
      renderer = create(
        <WatchHarness onContractionUpdate={onContractionUpdate} />,
      );
    });

    expect(capturedListeners["onContractionUpdate"]).toHaveLength(1);

    act(() => {
      renderer.unmount();
    });

    expect(capturedListeners["onContractionUpdate"] ?? []).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//
// Mixed offline backlog (kicks + contractions arriving together on reconnect)
//
// ─────────────────────────────────────────────────────────────────────────────

describe("useWatchConnectivity — mixed offline backlog (kicks + contractions)", () => {
  let originalOS: typeof Platform.OS;

  beforeAll(() => {
    originalOS = Platform.OS;
    Object.defineProperty(Platform, "OS", { value: "ios", writable: true });
  });

  afterAll(() => {
    Object.defineProperty(Platform, "OS", {
      value: originalOS,
      writable: true,
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    Object.keys(capturedListeners).forEach((k) => delete capturedListeners[k]);
    mockGetSessionState.mockResolvedValue({
      activationState: "activated",
      isWatchAppInstalled: true,
      isReachable: false,
    });
    mockAddListener.mockImplementation(
      (event: string, cb: (...args: unknown[]) => void) => {
        if (!capturedListeners[event]) capturedListeners[event] = [];
        capturedListeners[event].push(cb);
        return {
          remove: () => {
            capturedListeners[event] = (capturedListeners[event] ?? []).filter(
              (l) => l !== cb,
            );
          },
        };
      },
    );
  });

  it("routes kick and contraction events independently when both arrive after reconnect", async () => {
    // Realistic scenario: user recorded a kick session AND a contraction while
    // the phone was in airplane mode.  transferUserInfo delivers each as a
    // separate payload; didReceiveUserInfo fires twice, producing two different
    // native events.  The hook must route each to the correct callback.
    const onKickSessionEnd = jest.fn();
    const onContractionUpdate = jest.fn();

    await act(async () => {
      create(
        <WatchHarness
          onKickSessionEnd={onKickSessionEnd}
          onContractionUpdate={onContractionUpdate}
        />,
      );
    });

    const kickPayload: KickSessionSummary = {
      kickCount: 7,
      startedAt: "2026-08-04T16:00:00.000Z",
      endedAt: "2026-08-04T16:25:00.000Z",
    };
    const contractionPayload: ContractionRecord = {
      startedAt: "2026-08-04T16:30:00.000Z",
      endedAt: "2026-08-04T16:31:10.000Z",
      interval: 600,
    };

    act(() => {
      fireNativeEvent("onKickSessionEnd", kickPayload);
      fireNativeEvent("onContractionUpdate", contractionPayload);
    });

    // Each callback must receive exactly its own event — no cross-wiring.
    expect(onKickSessionEnd).toHaveBeenCalledTimes(1);
    expect(onKickSessionEnd).toHaveBeenCalledWith(kickPayload);

    expect(onContractionUpdate).toHaveBeenCalledTimes(1);
    expect(onContractionUpdate).toHaveBeenCalledWith(contractionPayload);
  });

  it("does not invoke onContractionUpdate when a kick event fires, and vice versa", async () => {
    const onKickSessionEnd = jest.fn();
    const onContractionUpdate = jest.fn();

    await act(async () => {
      create(
        <WatchHarness
          onKickSessionEnd={onKickSessionEnd}
          onContractionUpdate={onContractionUpdate}
        />,
      );
    });

    // Fire only the kick event.
    act(() => {
      fireNativeEvent("onKickSessionEnd", {
        kickCount: 3,
        startedAt: "2026-08-04T17:00:00.000Z",
        endedAt: "2026-08-04T17:10:00.000Z",
      });
    });

    expect(onKickSessionEnd).toHaveBeenCalledTimes(1);
    expect(onContractionUpdate).not.toHaveBeenCalled();

    onKickSessionEnd.mockClear();

    // Fire only the contraction event.
    act(() => {
      fireNativeEvent("onContractionUpdate", {
        startedAt: "2026-08-04T18:00:00.000Z",
        endedAt: "2026-08-04T18:01:00.000Z",
        interval: 240,
      });
    });

    expect(onContractionUpdate).toHaveBeenCalledTimes(1);
    expect(onKickSessionEnd).not.toHaveBeenCalled();
  });
});
