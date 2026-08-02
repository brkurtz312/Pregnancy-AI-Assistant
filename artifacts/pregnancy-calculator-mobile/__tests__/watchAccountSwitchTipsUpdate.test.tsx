/**
 * watchAccountSwitchTipsUpdate.test.tsx
 *
 * Confirms that Watch Tips update correctly when the signed-in account changes
 * on the phone.
 *
 * Scenario
 * ────────
 * • User A is signed in with a due date at Week 20.  The Watch receives Week 20
 *   tips on first mount.
 * • User A signs out and User B signs in (due date = Week 32).  The Watch must
 *   receive Week 32 tips shortly after sign-in — without relaunching the Watch
 *   app.
 * • If User B has no due date (gestationalWeek becomes undefined, tips become
 *   []), sendWeekAndTips must NOT be called again with User A's stale data.
 *
 * How it maps to the app
 * ─────────────────────
 * In app/(tabs)/index.tsx:
 *   1. userId change → results reset to null, autoLoadedRef cleared
 *   2. gestationalWeek useMemo recomputes from new profile.dueDate (or undefined)
 *   3. watchTips useMemo recomputes from gestationalWeek
 *   4. useWatchConnectivity({ gestationalWeek, tips: watchTips }) receives new props
 *
 * The tests here exercise step 4 directly — the hook itself — because that is
 * where the native bridge call is gated.  The gestationalWeek / tips values are
 * the output of steps 1-3 combined; changing them in the test harness faithfully
 * simulates what the component does during an account switch.
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
    { week, emoji: "🤰", text: `Week ${week} how you may feel.` },
    { week, emoji: "📅", text: `Week ${week} what's coming up.` },
  ];
}

/** Minimal wrapper that passes gestationalWeek + tips straight to the hook. */
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
// Suite setup — force iOS so getModule() inside the hook resolves the native
// module instead of short-circuiting to null.
// ─────────────────────────────────────────────────────────────────────────────

describe("useWatchConnectivity — tips update after account switch", () => {
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
    mockSendWeekAndTips.mockResolvedValue(undefined);
    mockGetSessionState.mockResolvedValue({
      isReachable: true,
      isWatchAppInstalled: true,
      activationState: "activated",
    });
    mockAddListener.mockReturnValue({ remove: jest.fn() });
  });

  // ── User A → User B (both have due dates) ───────────────────────────────────

  it("sends week-20 tips on initial mount (User A)", async () => {
    await act(async () => {
      create(<WatchHookHarness gestationalWeek={20} tips={makeTips(20)} />);
    });

    expect(mockSendWeekAndTips).toHaveBeenCalledTimes(1);
    expect(mockSendWeekAndTips).toHaveBeenCalledWith(
      20,
      expect.arrayContaining([expect.objectContaining({ week: 20 })]),
    );
  });

  it("re-sends tips with User B's week-32 data after account switch", async () => {
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(
        <WatchHookHarness gestationalWeek={20} tips={makeTips(20)} />,
      );
    });

    // Watch has User A's week-20 tips.  Now User B signs in.
    // The component resets results → gestationalWeek recomputes to 32
    // from User B's profile.  Simulate that by updating the harness props.
    mockSendWeekAndTips.mockClear();

    await act(async () => {
      renderer.update(
        <WatchHookHarness gestationalWeek={32} tips={makeTips(32)} />,
      );
    });

    expect(mockSendWeekAndTips).toHaveBeenCalledTimes(1);
    expect(mockSendWeekAndTips).toHaveBeenCalledWith(
      32,
      expect.arrayContaining([expect.objectContaining({ week: 32 })]),
    );
  });

  it("tips sent to Watch after account switch carry User B's week in every tip", async () => {
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(
        <WatchHookHarness gestationalWeek={20} tips={makeTips(20)} />,
      );
    });

    mockSendWeekAndTips.mockClear();

    await act(async () => {
      renderer.update(
        <WatchHookHarness gestationalWeek={32} tips={makeTips(32)} />,
      );
    });

    const [sentWeek, sentTips] = mockSendWeekAndTips.mock.calls[0] as [
      number,
      WatchTip[],
    ];
    // Coherence: every tip week must match the gestational week argument
    expect(sentTips.every((t) => t.week === sentWeek)).toBe(true);
  });

  it("does not send User A's stale week-20 tips after User B signs in", async () => {
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(
        <WatchHookHarness gestationalWeek={20} tips={makeTips(20)} />,
      );
    });

    mockSendWeekAndTips.mockClear();

    await act(async () => {
      renderer.update(
        <WatchHookHarness gestationalWeek={32} tips={makeTips(32)} />,
      );
    });

    // Ensure week-20 was never re-sent after the switch
    const week20Calls = mockSendWeekAndTips.mock.calls.filter(
      ([week]) => week === 20,
    );
    expect(week20Calls).toHaveLength(0);
  });

  // ── User A → User B with no due date ────────────────────────────────────────
  //
  // When User B has no due date the component produces gestationalWeek=undefined
  // and tips=[].  The hook must NOT push User A's stale data to the Watch —
  // the Watch should keep its previous state until User B adds a due date.

  it("does not call sendWeekAndTips when User B has no due date (undefined week, empty tips)", async () => {
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(
        <WatchHookHarness gestationalWeek={20} tips={makeTips(20)} />,
      );
    });

    // User A is signed out, User B signs in with no due date.
    // Component resets → gestationalWeek=undefined, watchTips=[]
    mockSendWeekAndTips.mockClear();

    await act(async () => {
      renderer.update(
        <WatchHookHarness gestationalWeek={undefined} tips={[]} />,
      );
    });

    // No call must have been made — empty tips guard in the hook prevents it
    expect(mockSendWeekAndTips).not.toHaveBeenCalled();
  });

  it("does not call sendWeekAndTips for week-20 again after User B (no due date) signs in", async () => {
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(
        <WatchHookHarness gestationalWeek={20} tips={makeTips(20)} />,
      );
    });

    mockSendWeekAndTips.mockClear();

    // Sign out + sign in as user with no due date
    await act(async () => {
      renderer.update(
        <WatchHookHarness gestationalWeek={undefined} tips={[]} />,
      );
    });

    // Week 20 must not be re-pushed to avoid the Watch showing stale data
    const staleWeekCalls = mockSendWeekAndTips.mock.calls.filter(
      ([week]) => week === 20,
    );
    expect(staleWeekCalls).toHaveLength(0);
  });

  it("sends correct tips once User B adds their due date after initially having none", async () => {
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(
        <WatchHookHarness gestationalWeek={20} tips={makeTips(20)} />,
      );
    });

    // Switch to User B — no due date yet
    await act(async () => {
      renderer.update(
        <WatchHookHarness gestationalWeek={undefined} tips={[]} />,
      );
    });

    mockSendWeekAndTips.mockClear();

    // User B enters their due date → week 32 becomes available
    await act(async () => {
      renderer.update(
        <WatchHookHarness gestationalWeek={32} tips={makeTips(32)} />,
      );
    });

    expect(mockSendWeekAndTips).toHaveBeenCalledTimes(1);
    expect(mockSendWeekAndTips).toHaveBeenCalledWith(
      32,
      expect.arrayContaining([expect.objectContaining({ week: 32 })]),
    );
  });

  // ── Multiple successive account switches ────────────────────────────────────

  it("pushes updated tips for each successive account switch", async () => {
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(
        <WatchHookHarness gestationalWeek={20} tips={makeTips(20)} />,
      );
    });

    mockSendWeekAndTips.mockClear();

    // Switch 1: User A → User B (week 32)
    await act(async () => {
      renderer.update(
        <WatchHookHarness gestationalWeek={32} tips={makeTips(32)} />,
      );
    });

    // Switch 2: User B → User C (week 16)
    await act(async () => {
      renderer.update(
        <WatchHookHarness gestationalWeek={16} tips={makeTips(16)} />,
      );
    });

    expect(mockSendWeekAndTips).toHaveBeenCalledTimes(2);
    expect(mockSendWeekAndTips).toHaveBeenNthCalledWith(
      1,
      32,
      expect.arrayContaining([expect.objectContaining({ week: 32 })]),
    );
    expect(mockSendWeekAndTips).toHaveBeenNthCalledWith(
      2,
      16,
      expect.arrayContaining([expect.objectContaining({ week: 16 })]),
    );
  });

  it("tips remain coherent (week arg matches tips) across multiple account switches", async () => {
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(
        <WatchHookHarness gestationalWeek={20} tips={makeTips(20)} />,
      );
    });

    await act(async () => {
      renderer.update(
        <WatchHookHarness gestationalWeek={32} tips={makeTips(32)} />,
      );
    });

    await act(async () => {
      renderer.update(
        <WatchHookHarness gestationalWeek={16} tips={makeTips(16)} />,
      );
    });

    for (const call of mockSendWeekAndTips.mock.calls) {
      const [week, tips] = call as [number, WatchTip[]];
      expect(tips.every((t) => t.week === week)).toBe(true);
    }
  });
});
