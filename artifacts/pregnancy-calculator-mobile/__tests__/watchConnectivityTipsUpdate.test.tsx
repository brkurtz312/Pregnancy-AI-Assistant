/**
 * useWatchConnectivity — tips update integration test
 *
 * Confirms that when gestationalWeek (derived from profile.dueDate) changes,
 * the hook's useEffect fires sendWeekAndTips with the updated week's tips.
 *
 * This is the integration layer between the profile-update flow
 * (profile.dueDate → gestationalWeek → watchTips useMemo in tools.tsx) and the
 * Watch connectivity module.
 *
 * Strategy
 * ────────
 * • Mock the WatchConnectivity native module so sendWeekAndTips is a jest spy.
 * • Render a minimal wrapper component that calls useWatchConnectivity with a
 *   given gestationalWeek and the tips from getWeeklyTips(gestationalWeek).
 * • Assert sendWeekAndTips is called with the correct week and tip content on
 *   mount (initial due date) and again after the week prop changes (updated
 *   due date after an ultrasound dating correction).
 */

import React, { useState } from "react";
import { act, create } from "react-test-renderer";

jest.mock("react-native-reanimated", () =>
  require("react-native-reanimated/mock"),
);

// ── Mock WatchConnectivity native module ──────────────────────────────────────
// The hook lazy-requires ../modules/WatchConnectivity at runtime; we intercept
// that here so sendWeekAndTips is a controllable spy.
const mockSendWeekAndTips = jest.fn().mockResolvedValue(undefined);
const mockGetSessionState = jest.fn().mockResolvedValue({
  activationState: "activated",
  isWatchAppInstalled: true,
  isReachable: true,
});
const mockAddListener = jest.fn().mockReturnValue({ remove: jest.fn() });

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
import { getWeeklyTips } from "../lib/watch-tips";
import { fetalDevelopmentData } from "../lib/fetal-development";

// ── Wrapper component ─────────────────────────────────────────────────────────

function WatchWrapper({ gestationalWeek }: { gestationalWeek: number }) {
  const tips = getWeeklyTips(gestationalWeek);
  useWatchConnectivity({ gestationalWeek, tips });
  return null;
}

/**
 * Interactive wrapper that exposes a setter so tests can change the week
 * after mount (simulating a profile due-date update).
 */
function ControlledWatchWrapper({
  initialWeek,
  onSetWeek,
}: {
  initialWeek: number;
  onSetWeek: (setter: (w: number) => void) => void;
}) {
  const [week, setWeek] = useState(initialWeek);
  onSetWeek(setWeek);
  const tips = getWeeklyTips(week);
  useWatchConnectivity({ gestationalWeek: week, tips });
  return null;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("useWatchConnectivity — sendWeekAndTips fires on mount", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("calls sendWeekAndTips with week=20 and matching tips on initial mount", async () => {
    const week = 20;
    const expectedTips = getWeeklyTips(week);

    await act(async () => {
      create(React.createElement(WatchWrapper, { gestationalWeek: week }));
    });

    expect(mockSendWeekAndTips).toHaveBeenCalledWith(week, expectedTips);
  });

  it("sendWeekAndTips receives tips whose first entry matches week-20 size data", async () => {
    const week = 20;
    const data = fetalDevelopmentData[week]!;

    await act(async () => {
      create(React.createElement(WatchWrapper, { gestationalWeek: week }));
    });

    const [calledWeek, calledTips] = mockSendWeekAndTips.mock.calls[0] as [
      number,
      ReturnType<typeof getWeeklyTips>,
    ];
    expect(calledWeek).toBe(week);
    expect(calledTips[0].text).toContain(data.size);
    expect(calledTips[0].text).toContain(data.sizeComparison);
  });
});

describe("useWatchConnectivity — sendWeekAndTips re-fires when gestationalWeek changes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("calls sendWeekAndTips again with week=36 after due-date update from week 20", async () => {
    let setWeek!: (w: number) => void;

    await act(async () => {
      create(
        React.createElement(ControlledWatchWrapper, {
          initialWeek: 20,
          onSetWeek: (fn) => {
            setWeek = fn;
          },
        }),
      );
    });

    // First call: week 20
    expect(mockSendWeekAndTips).toHaveBeenCalledWith(20, getWeeklyTips(20));
    const callsAfterMount = mockSendWeekAndTips.mock.calls.length;

    // Simulate a profile due-date correction that moves the user to week 36
    await act(async () => {
      setWeek(36);
    });

    // A second call must have been made with the updated week and tips
    expect(mockSendWeekAndTips.mock.calls.length).toBeGreaterThan(
      callsAfterMount,
    );
    const latestArgs = mockSendWeekAndTips.mock.calls[
      mockSendWeekAndTips.mock.calls.length - 1
    ] as [number, ReturnType<typeof getWeeklyTips>];
    expect(latestArgs[0]).toBe(36);
    expect(latestArgs[1]).toEqual(getWeeklyTips(36));
  });

  it("updated tips reflect the new week's fetal-development content", async () => {
    const newWeek = 36;
    const data = fetalDevelopmentData[newWeek]!;
    let setWeek!: (w: number) => void;

    await act(async () => {
      create(
        React.createElement(ControlledWatchWrapper, {
          initialWeek: 20,
          onSetWeek: (fn) => {
            setWeek = fn;
          },
        }),
      );
    });

    await act(async () => {
      setWeek(newWeek);
    });

    const lastArgs = mockSendWeekAndTips.mock.calls[
      mockSendWeekAndTips.mock.calls.length - 1
    ] as [number, ReturnType<typeof getWeeklyTips>];

    expect(lastArgs[0]).toBe(newWeek);
    expect(lastArgs[1][0].text).toContain(data.size);
    expect(lastArgs[1][1].text).toBe(data.development[0]);
  });

  it("tips sent after week decrease (due date corrected later) match the earlier week's data", async () => {
    let setWeek!: (w: number) => void;

    await act(async () => {
      create(
        React.createElement(ControlledWatchWrapper, {
          initialWeek: 36,
          onSetWeek: (fn) => {
            setWeek = fn;
          },
        }),
      );
    });

    // Correction moves due date further out → earlier gestational week
    await act(async () => {
      setWeek(20);
    });

    const lastArgs = mockSendWeekAndTips.mock.calls[
      mockSendWeekAndTips.mock.calls.length - 1
    ] as [number, ReturnType<typeof getWeeklyTips>];
    const data = fetalDevelopmentData[20]!;

    expect(lastArgs[0]).toBe(20);
    expect(lastArgs[1][0].text).toContain(data.size);
  });
});
