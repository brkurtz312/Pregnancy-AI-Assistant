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

import { useEffect, useCallback, useState, useRef } from "react";
import { Platform } from "react-native";
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

  // Fetch initial state once on mount (iOS only)
  useEffect(() => {
    if (!mod) return;
    mod
      .getSessionState()
      .then((s: WatchSessionState) => {
        setWatchStatus({
          isReachable: s.isReachable,
          isWatchAppInstalled: s.isWatchAppInstalled,
          activationState: s.activationState,
        });
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!mod]);

  // Subscribe to real-time state changes
  useEffect(() => {
    if (!mod) return;
    const sub = mod.addListener(
      "onWatchStateChange",
      (s: WatchSessionState) => {
        setWatchStatus({
          isReachable: s.isReachable,
          isWatchAppInstalled: s.isWatchAppInstalled,
          activationState: s.activationState,
        });
      },
    );
    return () => sub.remove();
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
    watchStatus.isWatchAppInstalled &&
    watchStatus.activationState === "activated";
  useEffect(() => {
    if (!mod || gestationalWeek == null || !tips?.length) return;
    if (!isSessionReady) return;
    mod.sendWeekAndTips(gestationalWeek, tips).catch(() => {});
  }, [mod, gestationalWeek, tips, isSessionReady]);

  // Subscribe to watch events
  useEffect(() => {
    if (!mod) return;

    const subs: ReturnType<typeof mod.addListener>[] = [];

    if (onKickSessionEnd) {
      subs.push(mod.addListener("onKickSessionEnd", onKickSessionEnd));
    }
    if (onContractionUpdate) {
      subs.push(mod.addListener("onContractionUpdate", onContractionUpdate));
    }
    if (onKickUpdate) {
      subs.push(
        mod.addListener("onKickUpdate", ({ count }: { count: number }) =>
          onKickUpdate(count),
        ),
      );
    }

    return () => subs.forEach((s) => s.remove());
  }, [mod, onKickSessionEnd, onContractionUpdate, onKickUpdate]);

  // When the Watch requests a sync (e.g. fresh install with empty tips),
  // push the current week and tips without waiting for a data change.
  // We capture gestationalWeek and tips in a ref so the listener callback
  // always sees the latest values without re-subscribing on every render.
  const syncDataRef = useRef({ gestationalWeek, tips });
  useEffect(() => {
    syncDataRef.current = { gestationalWeek, tips };
  });

  useEffect(() => {
    if (!mod) return;
    const sub = mod.addListener("onSyncRequest", () => {
      const { gestationalWeek: week, tips: currentTips } = syncDataRef.current;
      if (week == null || !currentTips?.length) return;
      mod.sendWeekAndTips(week, currentTips).catch(() => {});
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!mod]);

  /** Manually push tips (call this after a week change is confirmed) */
  const pushTips = useCallback(
    async (newTips: WatchTip[]) => {
      if (!mod) return;
      await mod.sendTips(newTips);
    },
    [mod],
  );

  return { pushTips, isSupported: !!mod, watchStatus };
}
