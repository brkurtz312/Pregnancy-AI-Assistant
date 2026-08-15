/**
 * watchFreshInstallSync.test.tsx
 *
 * Validates the JS-layer contract for the fresh-install tips-sync path that
 * was introduced in WatchSessionManager.requestSyncIfNeeded() and
 * PhoneWatchBridge's requestSync message handling.
 *
 * ── What this file covers that watchSyncRequest.test.tsx does NOT ────────────
 *
 * watchSyncRequest.test.tsx tests the hook's response to the onSyncRequest
 * event in isolation: the mock session is already activated before each test,
 * so the isSessionReady guard is always satisfied. It never exercises what
 * happens during the activation transition itself.
 *
 * This suite specifically tests:
 *
 *   1. SESSION ACTIVATION PATH (WatchSessionManager.activationDidCompleteWith)
 *      When the native session transitions from notActivated → activated (the
 *      onWatchStateChange event, driven by WCSession.activate()), the hook's
 *      main tips-push effect fires sendWeekAndTips. This is the primary
 *      delivery path for fresh-install tips and is distinct from the
 *      onSyncRequest response path.
 *
 *   2. COMBINED ACTIVATION + SYNC REQUEST FLOW
 *      On a real fresh install both effects can fire in the same session:
 *        a. Session activates → isSessionReady becomes true → tips pushed (path A).
 *        b. Watch fires onSyncRequest (it had no cached tips) → tips pushed
 *           again via the sync-request listener (path B, the replyHandler/
 *           transferUserInfo response path from PhoneWatchBridge).
 *      Tests verify both fire independently and carry the correct payload.
 *
 *   3. isSessionReady GUARD (session not yet activated at sync-request time)
 *      If onSyncRequest somehow arrives before activation completes, the hook
 *      still responds (the sync-request listener is not gated on isSessionReady).
 *      After activation, sendWeekAndTips fires a second time via the tips-push
 *      effect, ensuring the Watch always receives a fresh snapshot.
 *
 *   4. SESSION STATE SUPPRESSION
 *      When the session reports isWatchAppInstalled=false or
 *      activationState≠"activated", the tips-push effect must NOT send —
 *      even if gestationalWeek and tips are present. The onSyncRequest
 *      listener remains active and can still deliver a response.
 *
 * The native behaviors these tests validate:
 *
 *   • WatchSessionManager.activationDidCompleteWith(.activated) calls
 *     requestSyncIfNeeded() when tips is empty → sends requestSync to phone.
 *     Observable JS consequence: onSyncRequest event fires; hook calls
 *     sendWeekAndTips.
 *
 *   • PhoneWatchBridge.session(_:didReceiveMessage:replyHandler:) for requestSync
 *     builds a reply from lastKnownWeek + lastKnownTipsData and fires
 *     onSyncRequest. Observable JS consequence: sendWeekAndTips called with
 *     the current week and tips immediately when onSyncRequest arrives.
 *
 *   • PhoneWatchBridge.handleMessage() for transferUserInfo-delivered requestSync
 *     (Watch was not reachable at activation) fires onSyncRequest only (no
 *     inline reply). Observable JS consequence: same as replyHandler path —
 *     sendWeekAndTips called by the JS hook's sync-request listener.
 */

import React, { useState } from "react";
import { Platform } from "react-native";
import { act, create } from "react-test-renderer";

jest.mock("react-native-reanimated", () =>
  require("react-native-reanimated/mock"),
);

// ── Mock WatchConnectivity native module ──────────────────────────────────────

const mockSendWeekAndTips = jest.fn().mockResolvedValue(undefined);
const mockGetSessionState = jest.fn();

const capturedListeners: Record<
  string,
  Array<(...args: unknown[]) => void>
> = {};

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
  },
}));

import { useWatchConnectivity } from "../hooks/useWatchConnectivity";
import type { WatchTip } from "../hooks/useWatchConnectivity";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeTips(week: number): WatchTip[] {
  return [
    { week, emoji: "👶", text: `Week ${week} — baby growth.` },
    { week, emoji: "🤰", text: `Week ${week} — how you may feel.` },
  ];
}

function fireListeners(event: string, payload: unknown = {}) {
  for (const cb of capturedListeners[event] ?? []) cb(payload);
}

/** Simulate WCSession activation completing successfully. */
function fireSessionActivated({
  isReachable = true,
  isWatchAppInstalled = true,
}: { isReachable?: boolean; isWatchAppInstalled?: boolean } = {}) {
  fireListeners("onWatchStateChange", {
    activationState: "activated",
    isWatchAppInstalled,
    isReachable,
  });
}

/** Simulate a requestSync event from the Watch (via either delivery channel). */
function fireRequestSync() {
  fireListeners("onSyncRequest");
}

// ── Minimal test components ───────────────────────────────────────────────────

function WatchHarness({
  gestationalWeek,
  tips,
}: {
  gestationalWeek: number | undefined;
  tips: WatchTip[];
}) {
  useWatchConnectivity({ gestationalWeek, tips });
  return null;
}

function ControlledHarness({
  initialWeek,
  onSetWeek,
}: {
  initialWeek: number;
  onSetWeek: (setter: (w: number) => void) => void;
}) {
  const [week, setWeek] = useState(initialWeek);
  onSetWeek(setWeek);
  useWatchConnectivity({ gestationalWeek: week, tips: makeTips(week) });
  return null;
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe("watchFreshInstallSync — session activation path", () => {
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

    // Start with session notActivated so tests control the activation moment.
    mockGetSessionState.mockResolvedValue({
      activationState: "notActivated",
      isWatchAppInstalled: false,
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

  // ── 1. SESSION ACTIVATION PATH ──────────────────────────────────────────────
  //
  // Mirrors: WatchSessionManager.activationDidCompleteWith(.activated)
  // → requestSyncIfNeeded() sends requestSync → PhoneWatchBridge fires
  // onSyncRequest → useWatchConnectivity calls sendWeekAndTips.

  it("sends tips when session transitions from notActivated to activated (primary fresh-install path)", async () => {
    const week = 20;
    await act(async () => {
      create(<WatchHarness gestationalWeek={week} tips={makeTips(week)} />);
    });

    // No send yet — session not ready
    expect(mockSendWeekAndTips).not.toHaveBeenCalled();

    // WCSession.activate() completes → onWatchStateChange fires
    await act(async () => {
      fireSessionActivated();
    });

    expect(mockSendWeekAndTips).toHaveBeenCalledWith(week, makeTips(week));
  });

  it("sends tips on activation only when isWatchAppInstalled is true", async () => {
    const week = 24;
    await act(async () => {
      create(<WatchHarness gestationalWeek={week} tips={makeTips(week)} />);
    });

    // Activate with watch app not installed — isSessionReady is false
    await act(async () => {
      fireListeners("onWatchStateChange", {
        activationState: "activated",
        isWatchAppInstalled: false,
        isReachable: true,
      });
    });

    expect(mockSendWeekAndTips).not.toHaveBeenCalled();
  });

  it("does not send tips before session activates even when week and tips are ready", async () => {
    const week = 28;
    await act(async () => {
      create(<WatchHarness gestationalWeek={week} tips={makeTips(week)} />);
    });

    // Still no activation event
    expect(mockSendWeekAndTips).not.toHaveBeenCalled();
  });

  it("sends the correct gestational week in the activation-triggered push", async () => {
    const week = 32;
    await act(async () => {
      create(<WatchHarness gestationalWeek={week} tips={makeTips(week)} />);
    });

    await act(async () => {
      fireSessionActivated();
    });

    const [sentWeek] = mockSendWeekAndTips.mock.calls[0] as [
      number,
      WatchTip[],
    ];
    expect(sentWeek).toBe(week);
  });

  // ── 2. COMBINED ACTIVATION + SYNC REQUEST FLOW ─────────────────────────────
  //
  // Mirrors: Session activates (path A, tips-push effect) AND Watch fires
  // onSyncRequest (path B, PhoneWatchBridge replyHandler/transferUserInfo).
  // Both deliver tips; Watch receives data through two independent channels.

  it("fires sendWeekAndTips twice when activation AND onSyncRequest both occur", async () => {
    const week = 20;
    await act(async () => {
      create(<WatchHarness gestationalWeek={week} tips={makeTips(week)} />);
    });

    // Path A: session activation triggers tips-push effect
    await act(async () => {
      fireSessionActivated();
    });
    const callsAfterActivation = mockSendWeekAndTips.mock.calls.length;
    expect(callsAfterActivation).toBeGreaterThan(0);

    // Path B: Watch fires requestSync (had no cached tips); hook's
    // sync-request listener calls sendWeekAndTips independently
    await act(async () => {
      fireRequestSync();
    });

    expect(mockSendWeekAndTips.mock.calls.length).toBeGreaterThan(
      callsAfterActivation,
    );
  });

  it("both activation push and sync-request response carry consistent week + tips", async () => {
    const week = 36;
    await act(async () => {
      create(<WatchHarness gestationalWeek={week} tips={makeTips(week)} />);
    });

    await act(async () => {
      fireSessionActivated();
    });
    await act(async () => {
      fireRequestSync();
    });

    // Every call to sendWeekAndTips must carry the same week and tips
    for (const [sentWeek, sentTips] of mockSendWeekAndTips.mock.calls as [
      number,
      WatchTip[],
    ][]) {
      expect(sentWeek).toBe(week);
      expect(sentTips).toEqual(makeTips(week));
    }
  });

  // ── 3. isSessionReady GUARD ─────────────────────────────────────────────────
  //
  // onSyncRequest arriving before activation: sync-request listener responds
  // immediately (not gated on isSessionReady). After activation, the tips-push
  // effect fires a second time ensuring the Watch gets a fresh snapshot.

  it("sync-request listener responds even before session activation completes", async () => {
    const week = 22;
    await act(async () => {
      create(<WatchHarness gestationalWeek={week} tips={makeTips(week)} />);
    });

    // onSyncRequest arrives BEFORE session activates
    await act(async () => {
      fireRequestSync();
    });

    // Sync-request listener is not gated on isSessionReady — it always responds
    expect(mockSendWeekAndTips).toHaveBeenCalledWith(week, makeTips(week));
  });

  it("tips-push effect fires after activation even when sync-request already responded", async () => {
    const week = 22;
    await act(async () => {
      create(<WatchHarness gestationalWeek={week} tips={makeTips(week)} />);
    });

    // Sync request before activation
    await act(async () => {
      fireRequestSync();
    });
    const callsBeforeActivation = mockSendWeekAndTips.mock.calls.length;
    expect(callsBeforeActivation).toBeGreaterThan(0);

    // Session activates — tips-push effect fires independently
    await act(async () => {
      fireSessionActivated();
    });

    expect(mockSendWeekAndTips.mock.calls.length).toBeGreaterThan(
      callsBeforeActivation,
    );
  });

  // ── 4. SUPPRESSION WHEN PROFILE NOT YET LOADED ─────────────────────────────
  //
  // Mirrors: PhoneWatchBridge reply is empty (JS layer hasn't loaded the
  // profile yet). The activation-triggered push and the sync-request listener
  // both silently drop the request; data arrives once the profile loads.

  it("does not send on activation when gestationalWeek is not yet loaded", async () => {
    await act(async () => {
      create(<WatchHarness gestationalWeek={undefined} tips={[]} />);
    });

    await act(async () => {
      fireSessionActivated();
    });

    expect(mockSendWeekAndTips).not.toHaveBeenCalled();
  });

  it("does not send on sync-request when tips are empty (profile not yet loaded)", async () => {
    await act(async () => {
      create(<WatchHarness gestationalWeek={20} tips={[]} />);
    });

    await act(async () => {
      fireSessionActivated();
    });
    mockSendWeekAndTips.mockClear();

    await act(async () => {
      fireRequestSync();
    });

    expect(mockSendWeekAndTips).not.toHaveBeenCalled();
  });

  it("sends tips once profile loads after session was already activated", async () => {
    let setWeek!: (w: number) => void;

    function LazyHarness({
      onSetWeek,
    }: {
      onSetWeek: (fn: (w: number) => void) => void;
    }) {
      const [week, setW] = useState<number | undefined>(undefined);
      onSetWeek(setW as (w: number) => void);
      useWatchConnectivity({
        gestationalWeek: week,
        tips: week != null ? makeTips(week) : [],
      });
      return null;
    }

    await act(async () => {
      create(<LazyHarness onSetWeek={(fn) => (setWeek = fn)} />);
    });

    // Session is already activated before profile loads
    await act(async () => {
      fireSessionActivated();
    });
    expect(mockSendWeekAndTips).not.toHaveBeenCalled();

    // Profile loads — tips-push effect fires because gestationalWeek changed
    await act(async () => {
      setWeek(28);
    });

    expect(mockSendWeekAndTips).toHaveBeenCalledWith(28, makeTips(28));
  });

  // ── 5. transferUserInfo FALLBACK DELIVERY (isReachable=false at activation) ─
  //
  // Mirrors: WatchSessionManager.requestSyncIfNeeded() uses transferUserInfo
  // when isReachable is false → PhoneWatchBridge.handleMessage() fires
  // onSyncRequest (no inline reply). The JS hook responds identically.

  it("sync-request listener responds to transferUserInfo-delivered event (isReachable=false)", async () => {
    const week = 24;
    await act(async () => {
      create(<WatchHarness gestationalWeek={week} tips={makeTips(week)} />);
    });

    // Activate with isReachable=false → Watch used transferUserInfo for requestSync
    await act(async () => {
      fireSessionActivated({ isReachable: false });
    });

    mockSendWeekAndTips.mockClear();

    // transferUserInfo delivers the requestSync later (same JS event, different channel)
    await act(async () => {
      fireRequestSync();
    });

    expect(mockSendWeekAndTips).toHaveBeenCalledWith(week, makeTips(week));
  });

  it("transferUserInfo-delivered sync uses updated week when due-date changed since activation", async () => {
    let setWeek!: (w: number) => void;

    await act(async () => {
      create(
        <ControlledHarness
          initialWeek={20}
          onSetWeek={(fn) => (setWeek = fn)}
        />,
      );
    });

    await act(async () => {
      fireSessionActivated({ isReachable: false });
    });

    // Due-date correction while transferUserInfo is in flight
    await act(async () => {
      setWeek(36);
    });

    mockSendWeekAndTips.mockClear();

    // Deferred requestSync arrives — hook uses the updated week
    await act(async () => {
      fireRequestSync();
    });

    const [sentWeek, sentTips] = mockSendWeekAndTips.mock.calls[0] as [
      number,
      WatchTip[],
    ];
    expect(sentWeek).toBe(36);
    expect(sentTips[0].week).toBe(36);
  });

  // ── 6. LISTENER LIFECYCLE ──────────────────────────────────────────────────

  it("onSyncRequest listener is removed on unmount — no stale callbacks", async () => {
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(
        <WatchHarness gestationalWeek={20} tips={makeTips(20)} />,
      );
    });

    expect(capturedListeners["onSyncRequest"]?.length).toBeGreaterThan(0);
    act(() => renderer.unmount());
    expect(capturedListeners["onSyncRequest"] ?? []).toHaveLength(0);
  });

  it("sendWeekAndTips is NOT called after unmount if sync-request fires late", async () => {
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(
        <WatchHarness gestationalWeek={20} tips={makeTips(20)} />,
      );
    });

    await act(async () => {
      fireSessionActivated();
    });

    act(() => renderer.unmount());
    mockSendWeekAndTips.mockClear();

    await act(async () => {
      fireRequestSync();
    });

    expect(mockSendWeekAndTips).not.toHaveBeenCalled();
  });
});
