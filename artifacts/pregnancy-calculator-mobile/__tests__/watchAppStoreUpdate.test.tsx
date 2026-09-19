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
import { AppState, Platform } from "react-native";
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
    getActivationDiagnostic: jest.fn().mockResolvedValue("OK state=2"),
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

  // ── Remove-and-reinstall (true→false→true) ─────────────────────────────────
  //
  // A user removes the Watch companion from their watch via the Watch app, then
  // adds it back from the App Store. The hook must:
  //   1. NOT call sendWeekAndTips when isWatchAppInstalled transitions true→false
  //      (Watch just uninstalled — nothing to push to).
  //   2. Call sendWeekAndTips exactly once when isWatchAppInstalled transitions
  //      false→true (Watch reinstalled — data must be re-pushed automatically).

  it("does NOT call sendWeekAndTips when Watch app is removed (true→false)", async () => {
    mockGetSessionState.mockResolvedValue({
      activationState: "activated",
      isWatchAppInstalled: true,
      isReachable: true,
    });

    await act(async () => {
      create(<WatchHarness gestationalWeek={28} tips={makeTips(28)} />);
    });

    // Initial send on mount (Watch was installed)
    expect(mockSendWeekAndTips).toHaveBeenCalledTimes(1);

    // User removes the Watch companion app
    await act(async () => {
      stateChangeListener?.({
        activationState: "activated",
        isWatchAppInstalled: false,
        isReachable: false,
      });
    });

    // Must not send again — the Watch app is gone
    expect(mockSendWeekAndTips).toHaveBeenCalledTimes(1);
  });

  it("calls sendWeekAndTips when Watch app is reinstalled after removal (true→false→true)", async () => {
    mockGetSessionState.mockResolvedValue({
      activationState: "activated",
      isWatchAppInstalled: true,
      isReachable: true,
    });

    await act(async () => {
      create(<WatchHarness gestationalWeek={28} tips={makeTips(28)} />);
    });

    // Initial send on mount
    expect(mockSendWeekAndTips).toHaveBeenCalledTimes(1);

    // User removes the Watch companion app
    await act(async () => {
      stateChangeListener?.({
        activationState: "activated",
        isWatchAppInstalled: false,
        isReachable: false,
      });
    });

    // Still only 1 call — removal must not trigger a send
    expect(mockSendWeekAndTips).toHaveBeenCalledTimes(1);

    // User reinstalls the Watch companion app from the App Store
    await act(async () => {
      stateChangeListener?.({
        activationState: "activated",
        isWatchAppInstalled: true,
        isReachable: true,
      });
    });

    // Reinstall must trigger exactly one new send with current data
    expect(mockSendWeekAndTips).toHaveBeenCalledTimes(2);
    expect(mockSendWeekAndTips).toHaveBeenLastCalledWith(28, makeTips(28));
  });

  it("sends the correct week+tips on reinstall even when gestationalWeek changed while Watch was removed", async () => {
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

    // Watch companion is removed
    await act(async () => {
      stateChangeListener?.({
        activationState: "activated",
        isWatchAppInstalled: false,
        isReachable: false,
      });
    });

    // Gestational week advances while Watch is absent
    await act(async () => {
      setWeek(30);
    });

    // Still only 1 call — no Watch to send to
    expect(mockSendWeekAndTips).toHaveBeenCalledTimes(1);

    // User reinstalls the Watch companion
    await act(async () => {
      stateChangeListener?.({
        activationState: "activated",
        isWatchAppInstalled: true,
        isReachable: true,
      });
    });

    // Must send the *current* week (30), not the stale week (28)
    expect(mockSendWeekAndTips).toHaveBeenCalledTimes(2);
    const lastCall = mockSendWeekAndTips.mock.calls[1] as [number, WatchTip[]];
    expect(lastCall[0]).toBe(30);
    expect(lastCall[1][0].week).toBe(30);
  });

  // ── Due-date reset while Watch is absent ───────────────────────────────────
  //
  // Distinct from a week *advance*: the user changes their due date entirely,
  // resetting the gestational week to a much earlier value (28 → 8). The tips
  // array changes shape (different entries, different length), not just the
  // week number. On reinstall the hook must push the week-8 snapshot, never a
  // stale week-28 one.

  it("sends the reset week+tips on reinstall when the due date changed while the Watch was removed", async () => {
    let setWeekAndTips!: (week: number, tips: WatchTip[]) => void;

    function DueDateResetHarness() {
      const [state, setState] = useState<{ week: number; tips: WatchTip[] }>({
        week: 28,
        tips: makeTips(28),
      });
      setWeekAndTips = (week, tips) => setState({ week, tips });
      useWatchConnectivity({ gestationalWeek: state.week, tips: state.tips });
      return null;
    }

    mockGetSessionState.mockResolvedValue({
      activationState: "activated",
      isWatchAppInstalled: true,
      isReachable: true,
    });

    await act(async () => {
      create(<DueDateResetHarness />);
    });

    // Initial send with the original due date's week
    expect(mockSendWeekAndTips).toHaveBeenCalledTimes(1);
    expect(mockSendWeekAndTips).toHaveBeenCalledWith(28, makeTips(28));

    // Watch companion is removed
    await act(async () => {
      stateChangeListener?.({
        activationState: "activated",
        isWatchAppInstalled: false,
        isReachable: false,
      });
    });

    // User changes their due date entirely — week resets to 8 and the tips
    // array changes shape (three early-pregnancy tips instead of two).
    const week8Tips: WatchTip[] = [
      { week: 8, emoji: "👶", text: "Week 8 — baby development." },
      { week: 8, emoji: "💕", text: "Week 8 — how you may feel." },
      { week: 8, emoji: "🥦", text: "Week 8 — nutrition tip." },
    ];
    await act(async () => {
      setWeekAndTips(8, week8Tips);
    });

    // Still only 1 call — no Watch to send to while it is absent
    expect(mockSendWeekAndTips).toHaveBeenCalledTimes(1);

    // User reinstalls the Watch companion
    await act(async () => {
      stateChangeListener?.({
        activationState: "activated",
        isWatchAppInstalled: true,
        isReachable: true,
      });
    });

    // Must send exactly one new snapshot with week 8 and the new-shape tips —
    // never the stale week-28 payload.
    expect(mockSendWeekAndTips).toHaveBeenCalledTimes(2);
    const lastCall = mockSendWeekAndTips.mock.calls[1] as [number, WatchTip[]];
    expect(lastCall[0]).toBe(8);
    expect(lastCall[1]).toHaveLength(3);
    expect(lastCall[1]).toEqual(week8Tips);
    expect(lastCall[1].every((t) => t.week === 8)).toBe(true);
  });

  // ── getSessionState race: live event wins ──────────────────────────────────
  //
  // If onWatchStateChange fires BEFORE getSessionState() resolves, the stale
  // snapshot from getSessionState() must NOT overwrite the live value.
  // Concretely: Watch is installed (live event says true) but getSessionState
  // resolves late with isWatchAppInstalled: false — the hook must keep the live
  // "installed" value and not revert to false.

  it("does not overwrite a live onWatchStateChange update with a stale getSessionState result", async () => {
    let resolveSessionState!: (s: object) => void;
    mockGetSessionState.mockReturnValueOnce(
      new Promise<object>((resolve) => {
        resolveSessionState = resolve;
      }),
    );

    await act(async () => {
      create(<WatchHarness gestationalWeek={28} tips={makeTips(28)} />);
    });

    // Live event fires BEFORE getSessionState resolves — Watch is installed
    await act(async () => {
      stateChangeListener?.({
        activationState: "activated",
        isWatchAppInstalled: true,
        isReachable: true,
      });
    });

    // sendWeekAndTips should have fired once (live event set installed: true)
    expect(mockSendWeekAndTips).toHaveBeenCalledTimes(1);

    // Now getSessionState resolves with a stale snapshot (installed: false)
    await act(async () => {
      resolveSessionState({
        activationState: "activated",
        isWatchAppInstalled: false,
        isReachable: false,
      });
    });

    // Still exactly one call — the stale snapshot must not suppress future sends
    // and must not have triggered a second send
    expect(mockSendWeekAndTips).toHaveBeenCalledTimes(1);
  });

  // ── Mid-flight removal: sendWeekAndTips rejects ────────────────────────────
  //
  // The Watch companion can be removed while a sendWeekAndTips call is already
  // in flight (e.g. during a background refresh). The native promise rejects.
  // The hook must swallow-and-log the rejection — it must NOT enter an error
  // state, crash the render tree, or suppress the next push when the Watch is
  // reinstalled.

  it("does not throw or enter an error state when sendWeekAndTips rejects mid-flight", async () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    mockGetSessionState.mockResolvedValue({
      activationState: "activated",
      isWatchAppInstalled: true,
      isReachable: true,
    });
    mockSendWeekAndTips.mockRejectedValueOnce(
      new Error("WCSession companion app not installed"),
    );

    await act(async () => {
      create(<WatchHarness gestationalWeek={28} tips={makeTips(28)} />);
    });

    expect(mockSendWeekAndTips).toHaveBeenCalledTimes(1);
    // The error is surfaced via logging, not swallowed silently
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("sendWeekAndTips failed"),
      expect.any(Error),
    );
    warnSpy.mockRestore();
  });

  it("still pushes on reinstall after a mid-flight rejection (rejection does not suppress subsequent sends)", async () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    mockGetSessionState.mockResolvedValue({
      activationState: "activated",
      isWatchAppInstalled: true,
      isReachable: true,
    });
    // First push fails: Watch removed while the transfer was in flight
    mockSendWeekAndTips.mockRejectedValueOnce(
      new Error("transfer interrupted"),
    );

    await act(async () => {
      create(<WatchHarness gestationalWeek={28} tips={makeTips(28)} />);
    });

    expect(mockSendWeekAndTips).toHaveBeenCalledTimes(1);

    // Native layer reports the removal
    await act(async () => {
      stateChangeListener?.({
        activationState: "activated",
        isWatchAppInstalled: false,
        isReachable: false,
      });
    });

    // No send attempts while the Watch is absent
    expect(mockSendWeekAndTips).toHaveBeenCalledTimes(1);

    // User reinstalls the Watch companion — the hook must re-push (mock now
    // resolves again, since the rejection was one-shot)
    await act(async () => {
      stateChangeListener?.({
        activationState: "activated",
        isWatchAppInstalled: true,
        isReachable: true,
      });
    });

    expect(mockSendWeekAndTips).toHaveBeenCalledTimes(2);
    expect(mockSendWeekAndTips).toHaveBeenLastCalledWith(28, makeTips(28));
    warnSpy.mockRestore();
  });

  // ── Mid-flight removal during a background refresh (AppState path) ────────
  //
  // The Watch is removed while the foreground-resume re-push (the AppState
  // "active" handler) is in flight. The rejection must be logged, must not
  // break the hook, and a later resume/reinstall must push successfully.

  it("logs and recovers when the AppState foreground re-push rejects because the Watch was removed mid-refresh", async () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    const appStateListeners: ((state: string) => void)[] = [];
    const appStateSpy = jest
      .spyOn(AppState, "addEventListener")
      .mockImplementation(((event: string, cb: (state: string) => void) => {
        appStateListeners.push(cb);
        // `remove` must actually remove, as the real AppState subscription
        // does. With a no-op stub, an effect that re-runs leaves its old
        // callback in this array, the `forEach` below invokes both, and the
        // call counts come out one high -- a failure that depends on how many
        // times a render happened rather than on the behaviour under test.
        return {
          remove: () => {
            const i = appStateListeners.indexOf(cb);
            if (i !== -1) appStateListeners.splice(i, 1);
          },
        };
      }) as unknown as typeof AppState.addEventListener);

    mockGetSessionState.mockResolvedValue({
      activationState: "activated",
      isWatchAppInstalled: true,
      isReachable: true,
    });

    await act(async () => {
      create(<WatchHarness gestationalWeek={28} tips={makeTips(28)} />);
    });

    // Initial ready-state push on mount
    expect(mockSendWeekAndTips).toHaveBeenCalledTimes(1);

    // App returns to foreground → refresh re-push fires, but the Watch is
    // removed while the transfer is in flight and the native call rejects.
    mockSendWeekAndTips.mockRejectedValueOnce(
      new Error("companion app removed mid-transfer"),
    );
    // The hook registers exactly two AppState listeners: one re-fetches the
    // session state, one re-pushes week and tips. Asserting it here means a
    // leak is reported as a leak rather than as a wrong call count.
    expect(appStateListeners).toHaveLength(2);

    await act(async () => {
      appStateListeners.forEach((cb) => cb("active"));
    });

    expect(mockSendWeekAndTips).toHaveBeenCalledTimes(2);
    // The failure is surfaced via logging, not swallowed silently
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("foreground re-push sendWeekAndTips failed"),
      expect.any(Error),
    );

    // Watch state settles to removed, then the user reinstalls the companion.
    await act(async () => {
      stateChangeListener?.({
        activationState: "activated",
        isWatchAppInstalled: false,
        isReachable: false,
      });
    });
    expect(mockSendWeekAndTips).toHaveBeenCalledTimes(2);

    await act(async () => {
      stateChangeListener?.({
        activationState: "activated",
        isWatchAppInstalled: true,
        isReachable: true,
      });
    });

    // The earlier rejection must not suppress this push
    expect(mockSendWeekAndTips).toHaveBeenCalledTimes(3);
    expect(mockSendWeekAndTips).toHaveBeenLastCalledWith(28, makeTips(28));

    // A subsequent foreground resume also pushes successfully again
    await act(async () => {
      appStateListeners.forEach((cb) => cb("active"));
    });
    expect(mockSendWeekAndTips).toHaveBeenCalledTimes(4);

    appStateSpy.mockRestore();
    warnSpy.mockRestore();
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
