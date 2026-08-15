/**
 * useWatchConnectivity
 *
 * React hook that bridges the Apple Watch companion app with the phone.
 * On iOS (with the Watch extension installed) it:
 *  - Pushes gestational-week tips to the watch via WCSession
 *  - Receives kick-session summaries and contraction records from the watch
 *
 * On Android / when the native module is absent it is a no-op.
 */

import { useEffect, useCallback, useState, useRef, useMemo } from "react";
import { AppState, Platform } from "react-native";
import type { WatchSessionState } from "../modules/WatchConnectivity";

// Lazy-require so the module is only resolved on iOS at runtime
function getModule() {
  if (Platform.OS !== "ios") return null;
  try {
    const mod = require("../modules/WatchConnectivity");
    return mod?.default ?? mod ?? null;
  } catch {
    return null;
  }
}

export interface WatchTip {
  id?: string;
  week: number;
  emoji: string;
  text: string;
}

export interface KickSessionSummary {
  kickCount: number;
  startedAt: string; // ISO-8601
  endedAt: string;
}

export interface ContractionRecord {
  id?: string;
  startedAt: string;
  endedAt: string;
  interval?: number; // seconds
}

interface UseWatchConnectivityOptions {
  /** Current gestational week — sent to the watch whenever it changes */
  gestationalWeek?: number;
  /** Tips to display on the watch */
  tips?: WatchTip[];
  /** Called when the watch finishes a kick-counting session */
  onKickSessionEnd?: (session: KickSessionSummary) => void;
  /** Called on each contraction record from the watch */
  onContractionUpdate?: (record: ContractionRecord) => void;
  /** Called with a live kick-count update mid-session */
  onKickUpdate?: (count: number) => void;
}

export interface WatchConnectivityStatus {
  /** true if the Watch is currently reachable over the air */
  isReachable: boolean;
  /** true if the Watch companion app is installed */
  isWatchAppInstalled: boolean;
  /** "activated" | "inactive" | "notActivated" | "unknown" */
  activationState: string;
}

export function useWatchConnectivity({
  gestationalWeek,
  tips,
  onKickSessionEnd,
  onContractionUpdate,
  onKickUpdate,
}: UseWatchConnectivityOptions = {}) {
  const mod = getModule();

  // ── Real-time session state ──────────────────────────────────────────────
  const [watchStatus, setWatchStatus] = useState<WatchConnectivityStatus>({
    isReachable: false,
    isWatchAppInstalled: false,
    activationState: "notActivated",
  });

  // ── Watch-app presence confirmed by message receipt ──────────────────────
  //
  // WCSession.isWatchAppInstalled can remain false for an extended period (or
  // permanently) even when the companion app IS installed and running, due to
  // a known iOS behaviour: the property is populated asynchronously via
  // Bluetooth sync and may never update if the Watch is out of range at launch.
  //
  // When the Watch app sends us ANY message — onSyncRequest, onKickSessionEnd,
  // onKickUpdate, or onContractionUpdate — that is definitive proof the Watch
  // app is installed and communicating.  We track this separately and OR it
  // into isWatchAppInstalled so the badge never shows "not installed" when the
  // Watch is actively talking to us.
  const [watchConfirmedByMessage, setWatchConfirmedByMessage] = useState(false);
  const watchConfirmedRef = useRef(false); // ref copy for use inside callbacks

  // Ref that always mirrors the latest native watchStatus so that callbacks
  // registered once (e.g. event listeners) can read the current value without
  // stale-closure issues.
  const watchStatusRef = useRef(watchStatus);
  useEffect(() => {
    watchStatusRef.current = watchStatus;
  });

  // Pending expiry timer: if the Watch stops sending messages while native
  // isWatchAppInstalled is still false (stale), this fires after 30 s and
  // clears the message-confirmation latch so the badge correctly shows
  // "Watch app not installed".
  const confirmationExpiryRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  // Cancel current timer and start a fresh 30-second countdown.
  // Only called when native installation state is false (stale) so that the
  // latch expiry is not needed when native is already authoritative.
  const scheduleConfirmationExpiry = useCallback(() => {
    if (confirmationExpiryRef.current)
      clearTimeout(confirmationExpiryRef.current);
    confirmationExpiryRef.current = setTimeout(() => {
      watchConfirmedRef.current = false;
      setWatchConfirmedByMessage(false);
      confirmationExpiryRef.current = null;
    }, 30_000);
  }, []);

  const confirmWatchPresence = useCallback(() => {
    // When native already reports the Watch as installed, the message-
    // confirmation latch is not needed.  Skip the state update to avoid a
    // spurious re-render (which could retrigger the sendWeekAndTips effect via
    // an unstable tips prop reference and produce a redundant send).
    if (watchStatusRef.current.isWatchAppInstalled) {
      if (confirmationExpiryRef.current) {
        clearTimeout(confirmationExpiryRef.current);
        confirmationExpiryRef.current = null;
      }
      return;
    }
    // Native state is stale-false: set the latch and start the 30-second expiry
    // clock.  Each subsequent message resets the deadline; if the Watch is
    // uninstalled it stops sending and the timer clears the latch.
    watchConfirmedRef.current = true;
    setWatchConfirmedByMessage(true);
    scheduleConfirmationExpiry();
  }, [scheduleConfirmationExpiry]);

  // Also schedule expiry when native transitions to not-installed while the
  // Watch was already confirmed by message (handles the native true→false
  // uninstall case where confirmWatchPresence never scheduled a timer because
  // native was authoritative at the time).  Cancel the timer when native goes
  // back to true.
  useEffect(() => {
    if (!watchStatus.isWatchAppInstalled && watchConfirmedRef.current) {
      scheduleConfirmationExpiry();
    } else if (
      watchStatus.isWatchAppInstalled &&
      confirmationExpiryRef.current
    ) {
      clearTimeout(confirmationExpiryRef.current);
      confirmationExpiryRef.current = null;
    }
  }, [watchStatus.isWatchAppInstalled, scheduleConfirmationExpiry]);

  // Clear the expiry timer on unmount so it can never fire against an
  // already-unmounted component.
  useEffect(() => {
    return () => {
      if (confirmationExpiryRef.current)
        clearTimeout(confirmationExpiryRef.current);
    };
  }, []);

  // Derived status: treat the Watch as installed when either WCSession says so
  // OR we have confirmed it via a received message.
  const effectiveWatchStatus = useMemo<WatchConnectivityStatus>(
    () => ({
      ...watchStatus,
      isWatchAppInstalled:
        watchStatus.isWatchAppInstalled || watchConfirmedByMessage,
    }),
    [watchStatus, watchConfirmedByMessage],
  );

  // Shared generation counter for all getSessionState() snapshot calls.
  // Incremented before every new call (mount-time, foreground-resume) AND
  // whenever a live onWatchStateChange event fires so that any in-flight
  // Promise whose result is now stale is silently discarded.
  const fetchGenRef = useRef(0);

  // Fetch initial state once on mount (iOS only).
  // The generation guard ensures a delayed Promise cannot overwrite a fresher
  // foreground-resume snapshot or a live onWatchStateChange event that settled
  // while the native call was still in flight.
  useEffect(() => {
    if (!mod) return;
    const gen = ++fetchGenRef.current;
    mod
      .getSessionState()
      .then((s: WatchSessionState) => {
        if (fetchGenRef.current !== gen) return;
        setWatchStatus({
          isReachable: s.isReachable,
          isWatchAppInstalled: s.isWatchAppInstalled,
          activationState: s.activationState,
        });
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!mod]);

  // Subscribe to real-time state changes, then poll with retries until both
  // WCSession activation AND Watch app install are confirmed.
  //
  // WHY a two-phase retry loop:
  //
  // Phase 1 — fast polls every 500 ms for up to ~5 s:
  //   WCSession.activate() runs in the native OnCreate hook before JS renders.
  //   activationDidCompleteWith fires asynchronously and calls onSessionStateChange —
  //   but that callback is only wired in OnStartObserving (triggered by addListener()).
  //   There is a narrow window where the activation event fires before the bridge sets
  //   onSessionStateChange, silently dropping it.  A fast retry loop covers this gap.
  //
  // Phase 2 — slow polls every 3 s for up to ~30 s:
  //   Even after activationState === "activated", isWatchAppInstalled can still be
  //   false because the phone hasn't yet received the Watch's pairing state over
  //   Bluetooth.  That state arrives via sessionWatchStateDidChange — but only when
  //   the Watch comes into range.  If the watch is out of range at launch, the live
  //   event never fires and the UI stays stuck.  The slow loop keeps checking until
  //   the Watch is confirmed installed (or we give up after ~30 s).
  //
  // If a live onWatchStateChange event fires while a poll is in flight, the
  // generation guard discards the stale result and the live event value wins.
  useEffect(() => {
    if (!mod) return;
    const sub = mod.addListener(
      "onWatchStateChange",
      (s: WatchSessionState) => {
        fetchGenRef.current += 1; // invalidate any concurrent snapshot fetch
        setWatchStatus({
          isReachable: s.isReachable,
          isWatchAppInstalled: s.isWatchAppInstalled,
          activationState: s.activationState,
        });
      },
    );

    // Phase 1: fast polls — every 500 ms, up to 10 attempts (~5 s).
    // Stops early only when BOTH activated AND Watch app confirmed installed.
    const FAST_POLLS = 10;
    const FAST_INTERVAL_MS = 500;
    // Phase 2: slow polls — every 3 s, up to 10 attempts (~30 s).
    const SLOW_POLLS = 10;
    const SLOW_INTERVAL_MS = 3000;

    let fastRetries = 0;
    let slowRetries = 0;
    let cancelled = false;

    const isFullyReady = (s: WatchSessionState) =>
      s.activationState === "activated" && s.isWatchAppInstalled;

    const doSlowPoll = () => {
      if (cancelled || slowRetries >= SLOW_POLLS) return;
      const gen = ++fetchGenRef.current;
      mod
        .getSessionState()
        .then((s: WatchSessionState) => {
          if (cancelled || fetchGenRef.current !== gen) return;
          setWatchStatus({
            isReachable: s.isReachable,
            isWatchAppInstalled: s.isWatchAppInstalled,
            activationState: s.activationState,
          });
          if (!isFullyReady(s)) {
            slowRetries++;
            setTimeout(doSlowPoll, SLOW_INTERVAL_MS);
          }
        })
        .catch(() => {
          if (!cancelled) {
            slowRetries++;
            setTimeout(doSlowPoll, SLOW_INTERVAL_MS);
          }
        });
    };

    const doFastPoll = () => {
      const gen = ++fetchGenRef.current;
      mod
        .getSessionState()
        .then((s: WatchSessionState) => {
          if (cancelled || fetchGenRef.current !== gen) return;
          setWatchStatus({
            isReachable: s.isReachable,
            isWatchAppInstalled: s.isWatchAppInstalled,
            activationState: s.activationState,
          });
          if (isFullyReady(s)) return; // done — live events will handle any further changes
          if (fastRetries < FAST_POLLS) {
            fastRetries++;
            setTimeout(doFastPoll, FAST_INTERVAL_MS);
          } else {
            // Fast phase exhausted — hand off to slow phase
            doSlowPoll();
          }
        })
        .catch(() => {
          if (!cancelled) {
            if (fastRetries < FAST_POLLS) {
              fastRetries++;
              setTimeout(doFastPoll, FAST_INTERVAL_MS);
            } else {
              doSlowPoll();
            }
          }
        });
    };

    doFastPoll(); // first poll immediately after subscribing

    return () => {
      cancelled = true;
      sub.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!mod]);

  // Push gestational week + tips atomically whenever either changes, and also
  // whenever the Watch session becomes ready (either because isWatchAppInstalled
  // transitions false→true after an App Store update, or because activationState
  // transitions "notActivated"→"activated" on first launch).
  //
  // Both fields are included in the dep array so the effect re-runs on either
  // transition independently.  The native sendWeekAndTips already guards against
  // an uninstalled companion or an inactive session; we add a JS guard here too
  // to avoid unnecessary bridge calls.
  //
  // Using a single sendWeekAndTips call ensures the Watch always receives a
  // coherent snapshot — never a state where week and tips belong to different
  // due dates.
  const isSessionReady =
    effectiveWatchStatus.isWatchAppInstalled &&
    effectiveWatchStatus.activationState === "activated";
  useEffect(() => {
    if (!mod || gestationalWeek == null || !tips?.length) return;
    if (!isSessionReady) return;
    mod.sendWeekAndTips(gestationalWeek, tips).catch((err: unknown) => {
      // The Watch may have been removed while the call was in flight
      // (mid-refresh uninstall). Log for diagnostics but never let the
      // rejection put the hook in an error state — the next ready
      // transition (e.g. reinstall) re-runs this effect and re-pushes.
      console.warn("[useWatchConnectivity] sendWeekAndTips failed:", err);
    });
  }, [mod, gestationalWeek, tips, isSessionReady]);

  // Subscribe to watch events
  useEffect(() => {
    if (!mod) return;

    const subs: ReturnType<typeof mod.addListener>[] = [];

    if (onKickSessionEnd) {
      subs.push(
        mod.addListener("onKickSessionEnd", (session: KickSessionSummary) => {
          confirmWatchPresence();
          onKickSessionEnd(session);
        }),
      );
    }
    if (onContractionUpdate) {
      subs.push(
        mod.addListener("onContractionUpdate", (record: ContractionRecord) => {
          confirmWatchPresence();
          onContractionUpdate(record);
        }),
      );
    }
    if (onKickUpdate) {
      subs.push(
        mod.addListener("onKickUpdate", ({ count }: { count: number }) => {
          confirmWatchPresence();
          onKickUpdate(count);
        }),
      );
    }

    return () => subs.forEach((s) => s.remove());
  }, [
    mod,
    onKickSessionEnd,
    onContractionUpdate,
    onKickUpdate,
    confirmWatchPresence,
  ]);

  // When the Watch requests a sync (e.g. fresh install with empty tips),
  // push the current week and tips without waiting for a data change.
  // We capture gestationalWeek and tips in a ref so the listener callback
  // always sees the latest values without re-subscribing on every render.
  const syncDataRef = useRef({ gestationalWeek, tips });
  useEffect(() => {
    syncDataRef.current = { gestationalWeek, tips };
  });

  // Re-fetch session state when the app returns to the foreground so the
  // badge reflects the current Watch reachability without waiting for the next
  // organic onWatchStateChange event.  This handles the case where Watch
  // reachability changed while the phone was backgrounded — WCSession won't
  // fire sessionReachabilityDidChange again on resume because the state has
  // already settled.
  // Uses the same shared fetchGenRef as the mount-time fetch so a delayed
  // initial snapshot can never overwrite a fresher foreground-resume result.
  useEffect(() => {
    if (!mod) return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      const gen = ++fetchGenRef.current;
      mod
        .getSessionState()
        .then((s: WatchSessionState) => {
          // Discard if a newer fetch or a live event has superseded this result.
          if (fetchGenRef.current !== gen) return;
          setWatchStatus({
            isReachable: s.isReachable,
            isWatchAppInstalled: s.isWatchAppInstalled,
            activationState: s.activationState,
          });
        })
        .catch(() => {});
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!mod]);

  // Re-push the current week + tips whenever the app returns to the
  // foreground. This closes a race where the Watch requested a sync while the
  // phone's JS layer hadn't loaded the profile yet (the native reply was
  // empty), and no data-change event fires afterwards to trigger a send.
  useEffect(() => {
    if (!mod) return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      const { gestationalWeek: week, tips: currentTips } = syncDataRef.current;
      if (week == null || !currentTips?.length) return;
      mod.sendWeekAndTips(week, currentTips).catch((err: unknown) => {
        // The Watch may have been removed while this refresh-triggered send
        // was in flight. Log for diagnostics; never propagate — the next
        // ready transition or foreground resume re-pushes automatically.
        console.warn(
          "[useWatchConnectivity] foreground re-push sendWeekAndTips failed:",
          err,
        );
      });
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!mod]);

  useEffect(() => {
    if (!mod) return;
    const sub = mod.addListener("onSyncRequest", () => {
      // onSyncRequest is sent by the Watch app — definitive proof it's installed.
      confirmWatchPresence();
      const { gestationalWeek: week, tips: currentTips } = syncDataRef.current;
      if (week == null || !currentTips?.length) return;
      mod.sendWeekAndTips(week, currentTips).catch((err: unknown) => {
        // Same mid-flight-removal handling as above: log, never throw.
        console.warn(
          "[useWatchConnectivity] sync-request sendWeekAndTips failed:",
          err,
        );
      });
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!mod, confirmWatchPresence]);

  /** Manually push tips (call this after a week change is confirmed) */
  const pushTips = useCallback(
    async (newTips: WatchTip[]) => {
      if (!mod) return;
      await mod.sendTips(newTips);
    },
    [mod],
  );

  return { pushTips, isSupported: !!mod, watchStatus: effectiveWatchStatus };
}
