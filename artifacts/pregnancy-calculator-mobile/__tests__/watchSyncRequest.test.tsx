/**
 * watchSyncRequest.test.tsx
 *
 * Confirms that when the Watch fires an onSyncRequest event (e.g. fresh
 * install with empty UserDefaults), useWatchConnectivity responds by
 * immediately calling sendWeekAndTips with the current gestational week and
 * tips — so the Watch can populate its Tips tab without requiring the user
 * to open the phone app.
 *
 * Also confirms that:
 *  - The response is suppressed when gestationalWeek is undefined or tips
 *    is empty (nothing to send yet).
 *  - The listener always uses the *latest* week+tips via a ref so a sync
 *    request arriving after a due-date update gets the new data, not
 *    stale captured values from the original subscribe call.
 *  - The listener is removed on unmount (no memory leak / stale callbacks).
 */

import React, { useState } from "react";
import { Platform } from "react-native";
import { act, create } from "react-test-renderer";

jest.mock("react-native-reanimated", () =>
  require("react-native-reanimated/mock"),
);

// ── Mock WatchConnectivity native module ──────────────────────────────────────

const mockSendWeekAndTips = jest.fn().mockResolvedValue(undefined);
const mockGetSessionState = jest.fn().mockResolvedValue({
  activationState: "activated",
  isWatchAppInstalled: true,
  isReachable: true,
});

// Capture listeners keyed by event name so tests can fire them manually.
const capturedListeners: Record<string, ((...args: unknown[]) => void)[]> = {};

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
    addListener: mockAddListener,
  },
}));

import {
  useWatchConnectivity,
  type WatchTip,
} from "../hooks/useWatchConnectivity";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeTips(week: number): WatchTip[] {
  return [
    { week, emoji: "👶", text: `Week ${week} — baby growth.` },
    { week, emoji: "🤰", text: `Week ${week} — how you may feel.` },
  ];
}

/** Fire all registered listeners for an event. */
function fireEvent(event: string, payload: unknown = {}) {
  (capturedListeners[event] ?? []).forEach((cb) => cb(payload));
}

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

// ─────────────────────────────────────────────────────────────────────────────

describe("useWatchConnectivity — onSyncRequest → sendWeekAndTips", () => {
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
    // Reset captured listeners for each test
    Object.keys(capturedListeners).forEach((k) => delete capturedListeners[k]);
    mockGetSessionState.mockResolvedValue({
      activationState: "activated",
      isWatchAppInstalled: true,
      isReachable: true,
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

  // ── Basic response ──────────────────────────────────────────────────────────

  it("calls sendWeekAndTips when the Watch fires onSyncRequest", async () => {
    await act(async () => {
      create(<WatchHarness gestationalWeek={20} tips={makeTips(20)} />);
    });

    // Simulate the Watch activating with no cached tips
    await act(async () => {
      fireEvent("onSyncRequest");
    });

    expect(mockSendWeekAndTips).toHaveBeenCalledWith(20, makeTips(20));
  });

  it("sendWeekAndTips payload from onSyncRequest has consistent week in all tips", async () => {
    const week = 28;
    await act(async () => {
      create(<WatchHarness gestationalWeek={week} tips={makeTips(week)} />);
    });

    await act(async () => {
      fireEvent("onSyncRequest");
    });

    const [sentWeek, sentTips] = mockSendWeekAndTips.mock.calls[
      mockSendWeekAndTips.mock.calls.length - 1
    ] as [number, WatchTip[]];
    expect(sentWeek).toBe(week);
    expect(sentTips.every((t) => t.week === week)).toBe(true);
  });

  // ── Suppression when data is absent ────────────────────────────────────────

  it("does NOT call sendWeekAndTips when gestationalWeek is undefined at sync time", async () => {
    await act(async () => {
      create(<WatchHarness gestationalWeek={undefined} tips={[]} />);
    });

    mockSendWeekAndTips.mockClear();

    await act(async () => {
      fireEvent("onSyncRequest");
    });

    expect(mockSendWeekAndTips).not.toHaveBeenCalled();
  });

  it("does NOT call sendWeekAndTips when tips array is empty at sync time", async () => {
    await act(async () => {
      create(<WatchHarness gestationalWeek={20} tips={[]} />);
    });

    mockSendWeekAndTips.mockClear();

    await act(async () => {
      fireEvent("onSyncRequest");
    });

    expect(mockSendWeekAndTips).not.toHaveBeenCalled();
  });

  // ── Ref ensures latest data is used ────────────────────────────────────────
  //
  // The hook stores gestationalWeek+tips in a ref that is updated on every
  // render.  The onSyncRequest listener reads from the ref, not from captured
  // closure values, so a sync request fired after a due-date change gets the
  // latest week and tips without re-subscribing.

  it("sends the UPDATED week+tips when onSyncRequest fires after a due-date change", async () => {
    let setWeek!: (w: number) => void;

    await act(async () => {
      create(
        <ControlledHarness
          initialWeek={20}
          onSetWeek={(fn) => {
            setWeek = fn;
          }}
        />,
      );
    });

    // Due-date correction bumps gestational week from 20 → 36
    await act(async () => {
      setWeek(36);
    });

    // Clear initial sendWeekAndTips calls (from the tips-push effect)
    mockSendWeekAndTips.mockClear();

    // Watch fires onSyncRequest after the week has already changed
    await act(async () => {
      fireEvent("onSyncRequest");
    });

    expect(mockSendWeekAndTips).toHaveBeenCalledTimes(1);
    const [sentWeek, sentTips] = mockSendWeekAndTips.mock.calls[0] as [
      number,
      WatchTip[],
    ];
    expect(sentWeek).toBe(36);
    expect(sentTips[0].week).toBe(36);
  });

  it("sends stale week 20 (not yet updated to 36) if sync fires before the due-date change", async () => {
    let setWeek!: (w: number) => void;

    await act(async () => {
      create(
        <ControlledHarness
          initialWeek={20}
          onSetWeek={(fn) => {
            setWeek = fn;
          }}
        />,
      );
    });

    // Sync fires BEFORE due-date is updated
    mockSendWeekAndTips.mockClear();
    await act(async () => {
      fireEvent("onSyncRequest");
    });

    const [sentWeek] = mockSendWeekAndTips.mock.calls[0] as [
      number,
      WatchTip[],
    ];
    expect(sentWeek).toBe(20);

    // Now update due date — subsequent sync requests get week 36
    await act(async () => {
      setWeek(36);
    });
    mockSendWeekAndTips.mockClear();

    await act(async () => {
      fireEvent("onSyncRequest");
    });

    const [updatedWeek] = mockSendWeekAndTips.mock.calls[0] as [
      number,
      WatchTip[],
    ];
    expect(updatedWeek).toBe(36);
  });

  // ── Multiple sync requests ──────────────────────────────────────────────────

  it("responds to every onSyncRequest fired — not just the first", async () => {
    await act(async () => {
      create(<WatchHarness gestationalWeek={24} tips={makeTips(24)} />);
    });

    mockSendWeekAndTips.mockClear();

    await act(async () => {
      fireEvent("onSyncRequest");
    });
    await act(async () => {
      fireEvent("onSyncRequest");
    });

    expect(mockSendWeekAndTips).toHaveBeenCalledTimes(2);
    expect(mockSendWeekAndTips).toHaveBeenNthCalledWith(1, 24, makeTips(24));
    expect(mockSendWeekAndTips).toHaveBeenNthCalledWith(2, 24, makeTips(24));
  });

  // ── Listener cleanup on unmount ─────────────────────────────────────────────

  it("removes the onSyncRequest listener on unmount", async () => {
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(
        <WatchHarness gestationalWeek={20} tips={makeTips(20)} />,
      );
    });

    expect(capturedListeners["onSyncRequest"]?.length).toBeGreaterThan(0);

    act(() => {
      renderer.unmount();
    });

    expect(capturedListeners["onSyncRequest"] ?? []).toHaveLength(0);
  });
});
