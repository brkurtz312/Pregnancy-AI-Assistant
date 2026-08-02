/**
 * watchAppStoreUpdate.test.tsx
 *
 * Confirms that the Watch companion app receives data correctly when the user
 * updates the phone app from a version that had no Watch companion (1.0.11) to
 * one that does (1.0.12).
 *
 * Update scenario timeline
 * ────────────────────────
 * 1. User updates the iPhone app from the App Store.
 * 2. The phone app launches.  At this point watchOS has not yet delivered the
 *    Watch app to the paired watch — `isWatchAppInstalled` is false.
 * 3. `useWatchConnectivity` mounts.  The sendWeekAndTips effect runs but
 *    should be suppressed because the Watch app is not yet installed.
 * 4. A few seconds later watchOS installs the Watch companion automatically.
 *    `onWatchStateChange` fires with `isWatchAppInstalled: true`.
 * 5. The hook re-runs the sendWeekAndTips effect and pushes the current
 *    gestational week + tips to the Watch — no user action required.
 *
 * Without both `isWatchAppInstalled` and `activationState` in the effect's dep
 * array, step 5 can fail silently:
 *  - If the app launches before WCSession activates, installation is true but
 *    activationState is "notActivated".  The native guard no-ops.  When the
 *    session later becomes "activated" with installation still true, nothing
 *    triggers a re-send.
 *  - Similarly, if installation transitions false → true while the session is
 *    already activated, only watching installation catches the change.
 *
 * Additional coverage
 * ───────────────────
 * • Initial mount with isWatchAppInstalled: true + activated — fires immediately.
 * • isWatchAppInstalled false → true (Watch delivered after phone update).
 * • activationState notActivated → activated with isWatchAppInstalled already true.
 * • gestationalWeek undefined — suppressed regardless of Watch state.
 * • Event listeners for kicks/contractions attach on first mount regardless.
 */

import React, { useState } from "react";
import { Platform } from "react-native";
import { act, create } from "react-test-renderer";

jest.mock("react-native-reanimated", () =>
  require("react-native-reanimated/mock"),
);

// ── Mock WatchConnectivity native module ──────────────────────────────────────
const mockSendWeekAndTips = jest.fn().mockResolvedValue(undefined);
const mockAddListener = jest.fn();
const mockGetSessionState = jest.fn();

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
    { week, emoji: "👶", text: `Week ${week} — baby development.` },
    { week, emoji: "💕", text: `Week ${week} — how you may feel.` },
  ];
}

/** Captures the onWatchStateChange listener so tests can fire it manually. */
let stateChangeListener: ((s: object) => void) | null = null;

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

/** Lets tests change gestationalWeek after mount. */
function ControlledWatchHarness({
  initialWeek,
  onSetWeek,
}: {
  initialWeek: number;
  onSetWeek: (setter: (w: number) => void) => void;
}) {
  const [week, setWeek] = useState(initialWeek);
  onSetWeek(setWeek);
  const tips = makeTips(week);
  useWatchConnectivity({ gestationalWeek: week, tips });
  return null;
}

function KickListenerHarness({
  onKickSessionEnd,
}: {
  onKickSessionEnd: () => void;
}) {
  useWatchConnectivity({
    gestationalWeek: 28,
    tips: makeTips(28),
    onKickSessionEnd,
  });
  return null;
}

function ContractionListenerHarness({
  onContractionUpdate,
}: {
  onContractionUpdate: () => void;
}) {
  useWatchConnectivity({
    gestationalWeek: 28,
    tips: makeTips(28),
    onContractionUpdate,
  });
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────

describe("useWatchConnectivity — App Store update from 1.0.11 (no Watch) to 1.0.12", () => {
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
    stateChangeListener = null;

    // Default: Watch app NOT yet installed (state right after phone update)
    mockGetSessionState.mockResolvedValue({
      activationState: "activated",
      isWatchAppInstalled: false,
      isReachable: false,
    });

    mockAddListener.mockImplementation(
      (event: string, cb: (s: object) => void) => {
        if (event === "onWatchStateChange") {
          stateChangeListener = cb;
        }
        return { remove: jest.fn() };
      },
    );
  });

  // ── isWatchAppInstalled transition ─────────────────────────────────────────

  it("does NOT call sendWeekAndTips on mount when isWatchAppInstalled is false", async () => {
    await act(async () => {
      create(<WatchHarness gestationalWeek={28} tips={makeTips(28)} />);
    });

    expect(mockSendWeekAndTips).not.toHaveBeenCalled();
  });

  it("calls sendWeekAndTips with current week+tips when isWatchAppInstalled transitions false→true", async () => {
    await act(async () => {
      create(<WatchHarness gestationalWeek={28} tips={makeTips(28)} />);
    });

    expect(mockSendWeekAndTips).not.toHaveBeenCalled();

    // watchOS delivers the companion app → onWatchStateChange fires
    await act(async () => {
      stateChangeListener?.({
        activationState: "activated",
        isWatchAppInstalled: true,
        isReachable: true,
      });
    });

    expect(mockSendWeekAndTips).toHaveBeenCalledTimes(1);
    expect(mockSendWeekAndTips).toHaveBeenCalledWith(28, makeTips(28));
  });

  it("sends the correct gestational week when Watch app becomes available", async () => {
    const week = 32;
    await act(async () => {
      create(<WatchHarness gestationalWeek={week} tips={makeTips(week)} />);
    });

    await act(async () => {
      stateChangeListener?.({
        activationState: "activated",
        isWatchAppInstalled: true,
        isReachable: false, // Watch present but screen off — uses applicationContext
      });
    });

    const [sentWeek, sentTips] = mockSendWeekAndTips.mock.calls[0] as [
      number,
      WatchTip[],
    ];
    expect(sentWeek).toBe(week);
    expect(sentTips).toHaveLength(2);
    expect(sentTips[0].week).toBe(week);
    expect(sentTips[1].week).toBe(week);
  });

  // ── activationState transition ─────────────────────────────────────────────
  //
  // This is the other half of the race: the Watch app is already installed
  // (e.g. the user had a paired Watch before updating the phone app) but the
  // WCSession is still "notActivated" at mount time because activation is
  // asynchronous.  The hook must fire sendWeekAndTips when activation completes,
  // not just when isWatchAppInstalled changes.

  it("sends week+tips when activationState transitions notActivated→activated with isWatchAppInstalled already true", async () => {
    mockGetSessionState.mockResolvedValue({
      activationState: "notActivated",
      isWatchAppInstalled: true,
      isReachable: false,
    });

    await act(async () => {
      create(<WatchHarness gestationalWeek={24} tips={makeTips(24)} />);
    });

    // Session not activated yet — nothing should have been sent
    expect(mockSendWeekAndTips).not.toHaveBeenCalled();

    // WCSession activation completes; installation is still true
    await act(async () => {
      stateChangeListener?.({
        activationState: "activated",
        isWatchAppInstalled: true,
        isReachable: true,
      });
    });

    expect(mockSendWeekAndTips).toHaveBeenCalledTimes(1);
    expect(mockSendWeekAndTips).toHaveBeenCalledWith(24, makeTips(24));
  });

  it("sends week+tips when both activationState and isWatchAppInstalled transition together", async () => {
    mockGetSessionState.mockResolvedValue({
      activationState: "notActivated",
      isWatchAppInstalled: false,
      isReachable: false,
    });

    await act(async () => {
      create(<WatchHarness gestationalWeek={24} tips={makeTips(24)} />);
    });

    expect(mockSendWeekAndTips).not.toHaveBeenCalled();

    await act(async () => {
      stateChangeListener?.({
        activationState: "activated",
        isWatchAppInstalled: true,
        isReachable: true,
      });
    });

    expect(mockSendWeekAndTips).toHaveBeenCalledTimes(1);
    expect(mockSendWeekAndTips).toHaveBeenCalledWith(24, makeTips(24));
  });

  // ── Already-ready path (fresh install / later launches after update) ────────

  it("calls sendWeekAndTips on mount when session is activated and Watch is installed", async () => {
    mockGetSessionState.mockResolvedValue({
      activationState: "activated",
      isWatchAppInstalled: true,
      isReachable: true,
    });

    await act(async () => {
      create(<WatchHarness gestationalWeek={20} tips={makeTips(20)} />);
    });

    expect(mockSendWeekAndTips).toHaveBeenCalledTimes(1);
    expect(mockSendWeekAndTips).toHaveBeenCalledWith(20, makeTips(20));
  });

  it("does NOT call sendWeekAndTips a second time if state stays activated+installed", async () => {
    mockGetSessionState.mockResolvedValue({
      activationState: "activated",
      isWatchAppInstalled: true,
      isReachable: true,
    });

    await act(async () => {
      create(<WatchHarness gestationalWeek={20} tips={makeTips(20)} />);
    });

    expect(mockSendWeekAndTips).toHaveBeenCalledTimes(1);

    // Another state event but nothing changed
    await act(async () => {
      stateChangeListener?.({
        activationState: "activated",
        isWatchAppInstalled: true,
        isReachable: false, // reachability changed — must not re-send
      });
    });

    expect(mockSendWeekAndTips).toHaveBeenCalledTimes(1);
  });

  // ── gestationalWeek guard ───────────────────────────────────────────────────

  it("does not send when gestationalWeek is undefined even after session is ready", async () => {
    await act(async () => {
      create(<WatchHarness gestationalWeek={undefined} tips={[]} />);
    });

    await act(async () => {
      stateChangeListener?.({
        activationState: "activated",
        isWatchAppInstalled: true,
        isReachable: true,
      });
    });

    expect(mockSendWeekAndTips).not.toHaveBeenCalled();
  });

  // ── Event listener attachment ───────────────────────────────────────────────
  //
  // Kick and contraction listeners must attach on first mount regardless of
  // Watch install/activation state so queued transferUserInfo payloads are
  // delivered as soon as the session activates.

  it("attaches onKickSessionEnd listener on first mount regardless of Watch install state", async () => {
    const kickHandler = jest.fn();

    await act(async () => {
      create(<KickListenerHarness onKickSessionEnd={kickHandler} />);
    });

    const kickCall = (mockAddListener.mock.calls as [string, unknown][]).find(
      ([event]) => event === "onKickSessionEnd",
    );
    expect(kickCall).toBeDefined();
  });

  it("attaches onContractionUpdate listener on first mount regardless of Watch install state", async () => {
    const contractionHandler = jest.fn();

    await act(async () => {
      create(
        <ContractionListenerHarness onContractionUpdate={contractionHandler} />,
      );
    });

    const contractionCall = (
      mockAddListener.mock.calls as [string, unknown][]
    ).find(([event]) => event === "onContractionUpdate");
    expect(contractionCall).toBeDefined();
  });

  // ── Week change after Watch becomes available ───────────────────────────────

  it("sends updated week+tips when gestationalWeek changes after Watch was installed", async () => {
    let setWeek!: (w: number) => void;

    mockGetSessionState.mockResolvedValue({
      activationState: "activated",
      isWatchAppInstalled: true,
      isReachable: true,
    });

    await act(async () => {
      create(
        <ControlledWatchHarness
          initialWeek={28}
          onSetWeek={(fn) => {
            setWeek = fn;
          }}
        />,
      );
    });

    expect(mockSendWeekAndTips).toHaveBeenCalledTimes(1);

    await act(async () => {
      setWeek(29);
    });

    expect(mockSendWeekAndTips).toHaveBeenCalledTimes(2);
    const lastCall = mockSendWeekAndTips.mock.calls[1] as [number, WatchTip[]];
    expect(lastCall[0]).toBe(29);
    expect(lastCall[1][0].week).toBe(29);
  });
});
