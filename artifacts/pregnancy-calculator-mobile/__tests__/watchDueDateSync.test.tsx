/**
 * watchDueDateSync.test.tsx
 *
 * Verifies that when the user edits their due date (causing gestationalWeek to
 * change), useWatchConnectivity pushes the new week AND new tips in a single
 * atomic sendWeekAndTips call — so the Watch can never receive a mismatched
 * state where week and tips belong to different due dates.
 *
 * The JS hook always uses sendWeekAndTips (never the individual
 * sendGestationalWeek / sendTips calls) so it cannot produce a race.
 * The native Swift layer guarantees atomicity for the unreachable-fallback
 * path via a single updateApplicationContext payload; that path is covered
 * by manual Watch smoke testing.
 */

import React from "react";
import { Platform } from "react-native";
import { act, create } from "react-test-renderer";

// ── Silence Reanimated in the test environment ────────────────────────────────
jest.mock("react-native-reanimated", () =>
  require("react-native-reanimated/mock"),
);

// ── Mock the native WatchConnectivity module ──────────────────────────────────
const mockSendWeekAndTips = jest.fn().mockResolvedValue(undefined);
const mockSendGestationalWeek = jest.fn().mockResolvedValue(undefined);
const mockSendTips = jest.fn().mockResolvedValue(undefined);
const mockAddListener = jest.fn(() => ({ remove: jest.fn() }));
const mockGetSessionState = jest.fn().mockResolvedValue({
  isReachable: true,
  isWatchAppInstalled: true,
  activationState: "activated",
});

jest.mock("../modules/WatchConnectivity", () => ({
  default: {
    sendWeekAndTips: mockSendWeekAndTips,
    sendGestationalWeek: mockSendGestationalWeek,
    sendTips: mockSendTips,
    addListener: mockAddListener,
    getSessionState: mockGetSessionState,
  },
}));

// ── Import under test (after mocks) ──────────────────────────────────────────
import {
  useWatchConnectivity,
  type WatchTip,
} from "../hooks/useWatchConnectivity";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeTips(week: number): WatchTip[] {
  return [
    { week, emoji: "👶", text: `Week ${week} development milestone.` },
    { week, emoji: "💕", text: `Week ${week} how you may feel.` },
  ];
}

function WatchHookHarness({
  gestationalWeek,
  tips,
}: {
  gestationalWeek: number | undefined;
  tips: WatchTip[];
}) {
  useWatchConnectivity({ gestationalWeek, tips });
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────

describe("useWatchConnectivity — atomic due-date sync via sendWeekAndTips", () => {
  let originalOS: typeof Platform.OS;

  beforeAll(() => {
    originalOS = Platform.OS;
    // Force iOS so getModule() inside the hook doesn't short-circuit to null
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
    mockSendWeekAndTips.mockResolvedValue(undefined);
    mockSendGestationalWeek.mockResolvedValue(undefined);
    mockSendTips.mockResolvedValue(undefined);
    mockGetSessionState.mockResolvedValue({
      isReachable: true,
      isWatchAppInstalled: true,
      activationState: "activated",
    });
    mockAddListener.mockReturnValue({ remove: jest.fn() });
  });

  // ── Single atomic call on mount ─────────────────────────────────────────────

  it("calls sendWeekAndTips (not separate calls) on first mount", async () => {
    await act(async () => {
      create(<WatchHookHarness gestationalWeek={20} tips={makeTips(20)} />);
    });

    expect(mockSendWeekAndTips).toHaveBeenCalledTimes(1);
    expect(mockSendWeekAndTips).toHaveBeenCalledWith(
      20,
      expect.arrayContaining([expect.objectContaining({ week: 20 })]),
    );
    // Individual calls must NOT be made — the hook uses sendWeekAndTips only
    expect(mockSendGestationalWeek).not.toHaveBeenCalled();
    expect(mockSendTips).not.toHaveBeenCalled();
  });

  // ── Atomic re-push after due-date edit ──────────────────────────────────────

  it("re-pushes both week and tips atomically when the due date changes", async () => {
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(
        <WatchHookHarness gestationalWeek={20} tips={makeTips(20)} />,
      );
    });

    mockSendWeekAndTips.mockClear();

    // Simulate user editing due date → week jumps from 20 → 24
    await act(async () => {
      renderer.update(
        <WatchHookHarness gestationalWeek={24} tips={makeTips(24)} />,
      );
    });

    expect(mockSendWeekAndTips).toHaveBeenCalledTimes(1);
    expect(mockSendWeekAndTips).toHaveBeenCalledWith(
      24,
      expect.arrayContaining([expect.objectContaining({ week: 24 })]),
    );
    // Confirm the payload is coherent: the tips week matches the gestational week
    const [sentWeek, sentTips] = mockSendWeekAndTips.mock.calls[0] as [
      number,
      WatchTip[],
    ];
    expect(sentTips.every((t) => t.week === sentWeek)).toBe(true);
  });

  it("sends correct week after multiple successive due-date edits", async () => {
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(
        <WatchHookHarness gestationalWeek={20} tips={makeTips(20)} />,
      );
    });

    mockSendWeekAndTips.mockClear();

    await act(async () => {
      renderer.update(
        <WatchHookHarness gestationalWeek={28} tips={makeTips(28)} />,
      );
    });
    await act(async () => {
      renderer.update(
        <WatchHookHarness gestationalWeek={32} tips={makeTips(32)} />,
      );
    });

    expect(mockSendWeekAndTips).toHaveBeenCalledTimes(2);
    expect(mockSendWeekAndTips).toHaveBeenNthCalledWith(
      1,
      28,
      expect.arrayContaining([expect.objectContaining({ week: 28 })]),
    );
    expect(mockSendWeekAndTips).toHaveBeenNthCalledWith(
      2,
      32,
      expect.arrayContaining([expect.objectContaining({ week: 32 })]),
    );
  });

  it("does not call sendWeekAndTips when gestationalWeek is undefined", async () => {
    await act(async () => {
      create(<WatchHookHarness gestationalWeek={undefined} tips={[]} />);
    });

    expect(mockSendWeekAndTips).not.toHaveBeenCalled();
  });

  it("does not call sendWeekAndTips when tips array is empty", async () => {
    await act(async () => {
      create(<WatchHookHarness gestationalWeek={20} tips={[]} />);
    });

    expect(mockSendWeekAndTips).not.toHaveBeenCalled();
  });

  // ── Coherence guarantee ─────────────────────────────────────────────────────

  it("always sends matching week numbers in both the week arg and every tip", async () => {
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(
        <WatchHookHarness gestationalWeek={16} tips={makeTips(16)} />,
      );
    });

    await act(async () => {
      renderer.update(
        <WatchHookHarness gestationalWeek={36} tips={makeTips(36)} />,
      );
    });

    // Every sendWeekAndTips call should have a consistent week in week arg and tips
    for (const call of mockSendWeekAndTips.mock.calls) {
      const [week, tips] = call as [number, WatchTip[]];
      expect(tips.every((t) => t.week === week)).toBe(true);
    }
  });
});
