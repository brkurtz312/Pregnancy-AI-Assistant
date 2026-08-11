/**
 * watchSendWeekAndTipsOnConnect.test.tsx
 *
 * Confirms that useWatchConnectivity pushes the current gestational-week tips
 * to the Watch immediately when the session transitions to ready — without any
 * user action.
 *
 * Specifically tested:
 *   1. sendWeekAndTips IS called when onWatchStateChange fires with
 *      isReachable:true (isSessionReady flips true) and gestationalWeek is
 *      already loaded on the phone.
 *   2. sendWeekAndTips is NOT called when the session is not yet ready
 *      (isWatchAppInstalled:false).
 *
 * Relevant hook code:
 *   artifacts/pregnancy-calculator-mobile/hooks/useWatchConnectivity.ts
 *   Lines ~145-152: isSessionReady guard + sendWeekAndTips effect
 */

import React from "react";
import { Platform } from "react-native";
import { act, create } from "react-test-renderer";
import { flushAsync } from "../test-helpers/testUtils";

// ─── WatchConnectivity module mock ───────────────────────────────────────────

type WatchState = {
  activationState: string;
  isWatchAppInstalled: boolean;
  isReachable: boolean;
};

let capturedStateListener: ((state: WatchState) => void) | null = null;

const mockGetSessionState = jest.fn(
  async (): Promise<WatchState> => ({
    activationState: "notActivated",
    isWatchAppInstalled: false,
    isReachable: false,
  }),
);

const mockSendWeekAndTips = jest.fn(async () => {});

const mockAddListener = jest.fn(
  (event: string, cb: (state: WatchState) => void) => {
    if (event === "onWatchStateChange") {
      capturedStateListener = cb;
    }
    return {
      remove: () => {
        if (event === "onWatchStateChange") {
          capturedStateListener = null;
        }
      },
    };
  },
);

jest.mock("../modules/WatchConnectivity", () => ({
  __esModule: true,
  default: {
    getSessionState: mockGetSessionState,
    sendWeekAndTips: mockSendWeekAndTips,
    sendTips: jest.fn(async () => {}),
    sendGestationalWeek: jest.fn(async () => {}),
    addListener: mockAddListener,
  },
}));

// jest-expo sets defaultPlatform: "ios" so Platform.OS is already "ios" here.
import { useWatchConnectivity } from "../hooks/useWatchConnectivity";
import type { WatchTip } from "../hooks/useWatchConnectivity";

// ─── Minimal wrapper that injects gestational-week data into the hook ─────────

function TestWrapperWithData({
  gestationalWeek,
  tips,
}: {
  gestationalWeek: number;
  tips: WatchTip[];
}) {
  useWatchConnectivity({ gestationalWeek, tips });
  return null;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

const SAMPLE_TIPS: WatchTip[] = [
  { week: 20, emoji: "🌟", text: "Your baby can now hear sounds." },
];

describe("useWatchConnectivity — sendWeekAndTips fires when session becomes ready", () => {
  beforeEach(() => {
    capturedStateListener = null;
    jest.clearAllMocks();

    // Re-register addListener mock implementation after clearAllMocks
    mockAddListener.mockImplementation(
      (event: string, cb: (state: WatchState) => void) => {
        if (event === "onWatchStateChange") capturedStateListener = cb;
        return {
          remove: () => {
            if (event === "onWatchStateChange") capturedStateListener = null;
          },
        };
      },
    );

    // Re-register sendWeekAndTips so clearAllMocks doesn't leave it returning undefined
    mockSendWeekAndTips.mockImplementation(async () => {});

    // Default: Watch not yet connected (session not ready)
    mockGetSessionState.mockResolvedValue({
      activationState: "notActivated",
      isWatchAppInstalled: false,
      isReachable: false,
    });
  });

  it("calls sendWeekAndTips when onWatchStateChange fires with isReachable:true and gestationalWeek is already set", async () => {
    // Sanity-check: we are on iOS so the module is returned by getModule()
    expect(Platform.OS).toBe("ios");

    let renderer: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        React.createElement(TestWrapperWithData, {
          gestationalWeek: 20,
          tips: SAMPLE_TIPS,
        }),
      );
    });
    await flushAsync();

    // Session not ready — sendWeekAndTips must NOT have been called yet
    expect(mockSendWeekAndTips).not.toHaveBeenCalled();

    // Watch connects: onWatchStateChange fires, session becomes ready
    expect(capturedStateListener).not.toBeNull();
    await act(async () => {
      capturedStateListener!({
        activationState: "activated",
        isWatchAppInstalled: true,
        isReachable: true,
      });
    });
    await flushAsync();

    // sendWeekAndTips must have been called with the already-loaded week + tips
    expect(mockSendWeekAndTips).toHaveBeenCalledTimes(1);
    expect(mockSendWeekAndTips).toHaveBeenCalledWith(20, SAMPLE_TIPS);

    renderer!.unmount();
    await flushAsync();
  });

  it("does NOT call sendWeekAndTips when the session is not yet ready (isWatchAppInstalled:false)", async () => {
    // beforeEach already sets getSessionState to notActivated/false/false.
    // The hook's isSessionReady guard must prevent the push even when a
    // state-change event fires with the watch still not installed.

    let renderer: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        React.createElement(TestWrapperWithData, {
          gestationalWeek: 20,
          tips: SAMPLE_TIPS,
        }),
      );
    });
    await flushAsync();

    // Simulate a state-change event that does NOT make the session ready
    expect(capturedStateListener).not.toBeNull();
    await act(async () => {
      capturedStateListener!({
        activationState: "notActivated",
        isWatchAppInstalled: false,
        isReachable: false,
      });
    });
    await flushAsync();

    // Session never became ready — sendWeekAndTips must stay uncalled
    expect(mockSendWeekAndTips).not.toHaveBeenCalled();

    renderer!.unmount();
    await flushAsync();
  });
});
