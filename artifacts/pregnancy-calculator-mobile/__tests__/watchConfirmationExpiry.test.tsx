/**
 * useWatchConnectivity — message-confirmation latch expiry tests
 *
 * Verifies the 30-second timer behaviour introduced to prevent
 * watchConfirmedByMessage from staying permanently true after the Watch app
 * is uninstalled while native isWatchAppInstalled was stale-false.
 *
 * Scenarios covered:
 *  1. Initial native-false + Watch message → latch set, 30 s timer started.
 *  2. New message before expiry → timer reset (another 30 s window).
 *  3. No new message within 30 s → latch cleared (uninstall detected).
 *  4. onSyncRequest alone confirms presence and starts the expiry clock.
 */

import React from "react";
import { act, create } from "react-test-renderer";

jest.mock("react-native-reanimated", () =>
  require("react-native-reanimated/mock"),
);

// ── Mock WatchConnectivity native module ──────────────────────────────────────

let kickSessionEndListener: (() => void) | null = null;
let syncRequestListener: (() => void) | null = null;

const mockGetSessionState = jest.fn().mockResolvedValue({
  activationState: "activated",
  isWatchAppInstalled: false, // deliberately stale-false
  isReachable: false,
});

const mockAddListener = jest.fn(
  (event: string, cb: (...args: unknown[]) => void) => {
    if (event === "onKickSessionEnd") kickSessionEndListener = cb as () => void;
    if (event === "onSyncRequest") syncRequestListener = cb as () => void;
    return { remove: jest.fn() };
  },
);

const mockSendWeekAndTips = jest.fn().mockResolvedValue(undefined);

jest.mock("../modules/WatchConnectivity", () => ({
  __esModule: true,
  default: {
    sendTips: jest.fn().mockResolvedValue(undefined),
    sendGestationalWeek: jest.fn().mockResolvedValue(undefined),
    sendWeekAndTips: mockSendWeekAndTips,
    getSessionState: mockGetSessionState,
    addListener: mockAddListener,
  },
}));

import { useWatchConnectivity } from "../hooks/useWatchConnectivity";

// ── Minimal wrappers ──────────────────────────────────────────────────────────

function WatchWrapper() {
  useWatchConnectivity({ onKickSessionEnd: jest.fn() });
  return null;
}

let capturedInstalled = false;

function WatchStatusCapture({
  includeKick = false,
}: {
  includeKick?: boolean;
}) {
  const { watchStatus } = useWatchConnectivity(
    includeKick ? { onKickSessionEnd: jest.fn() } : {},
  );
  capturedInstalled = watchStatus.isWatchAppInstalled;
  return null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fireKickSessionEnd() {
  act(() => {
    kickSessionEndListener?.();
  });
}

function fireSyncRequest() {
  act(() => {
    syncRequestListener?.();
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("useWatchConnectivity — confirmation expiry", () => {
  let instance: ReturnType<typeof create> | undefined;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    kickSessionEndListener = null;
    syncRequestListener = null;
    capturedInstalled = false;
    instance = undefined;
  });

  afterEach(() => {
    // Unmount before running pending timers so they don't fire against an
    // already-unmounted component.
    if (instance) {
      act(() => {
        instance!.unmount();
      });
      instance = undefined;
    }
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it("starts a 30 s expiry timer when a Watch message arrives and native is stale-false", async () => {
    await act(async () => {
      instance = create(<WatchWrapper />);
    });

    expect(kickSessionEndListener).not.toBeNull();

    // Simulate Watch message while native isWatchAppInstalled is false
    fireKickSessionEnd();

    // Advance just under 30 s — timer should not have fired yet
    act(() => {
      jest.advanceTimersByTime(29_999);
    });

    // Hook is still mounted with no re-render crash
    expect(kickSessionEndListener).not.toBeNull();
  });

  it("clears the latch after 30 s of silence (no new Watch messages)", async () => {
    await act(async () => {
      instance = create(<WatchStatusCapture includeKick />);
    });

    // Initially native says false → latch false → not installed
    expect(capturedInstalled).toBe(false);

    // Watch sends a message → latch set → shows installed
    fireKickSessionEnd();
    expect(capturedInstalled).toBe(true);

    // Advance 30 s with no further messages → expiry fires → not installed
    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });

    expect(capturedInstalled).toBe(false);
  });

  it("resets the 30 s deadline when a new Watch message arrives before expiry", async () => {
    await act(async () => {
      instance = create(<WatchStatusCapture includeKick />);
    });

    // First message — starts 30 s timer
    fireKickSessionEnd();
    expect(capturedInstalled).toBe(true);

    // 20 s later, a second message arrives — resets the timer
    act(() => {
      jest.advanceTimersByTime(20_000);
    });
    fireKickSessionEnd();
    expect(capturedInstalled).toBe(true);

    // 29 s since the reset — should NOT have expired yet
    await act(async () => {
      jest.advanceTimersByTime(29_000);
    });
    expect(capturedInstalled).toBe(true);

    // Final 1 s — 30 s since the reset — now it expires
    await act(async () => {
      jest.advanceTimersByTime(1_000);
    });
    expect(capturedInstalled).toBe(false);
  });

  it("onSyncRequest confirms presence and starts the expiry clock", async () => {
    await act(async () => {
      instance = create(<WatchStatusCapture />);
    });

    expect(capturedInstalled).toBe(false);
    expect(syncRequestListener).not.toBeNull();

    // Watch sends only an onSyncRequest (no kick/contraction messages)
    fireSyncRequest();
    expect(capturedInstalled).toBe(true);

    // After 30 s of silence the latch should clear
    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });
    expect(capturedInstalled).toBe(false);
  });
});
