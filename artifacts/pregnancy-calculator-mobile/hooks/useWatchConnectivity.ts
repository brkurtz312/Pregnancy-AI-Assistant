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

import { useEffect, useCallback } from "react";
import { Platform } from "react-native";

// Lazy-require so the module is only resolved on iOS at runtime
function getModule() {
  if (Platform.OS !== "ios") return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
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

export function useWatchConnectivity({
  gestationalWeek,
  tips,
  onKickSessionEnd,
  onContractionUpdate,
  onKickUpdate,
}: UseWatchConnectivityOptions = {}) {
  const mod = getModule();

  // Push gestational week to the watch whenever it changes
  useEffect(() => {
    if (!mod || gestationalWeek == null) return;
    mod.sendGestationalWeek(gestationalWeek).catch(() => {});
  }, [mod, gestationalWeek]);

  // Push tips to the watch whenever they change
  useEffect(() => {
    if (!mod || !tips?.length) return;
    mod.sendTips(tips).catch(() => {});
  }, [mod, tips]);

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

  /** Manually push tips (call this after a week change is confirmed) */
  const pushTips = useCallback(
    async (newTips: WatchTip[]) => {
      if (!mod) return;
      await mod.sendTips(newTips);
    },
    [mod],
  );

  return { pushTips, isSupported: !!mod };
}
