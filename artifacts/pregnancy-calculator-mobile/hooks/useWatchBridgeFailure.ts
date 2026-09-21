import { useEffect, useState } from "react";
import {
  getWatchBridgeCounts,
  getWatchBridgeFailure,
  subscribeWatchBridgeCounts,
  subscribeWatchBridgeFailure,
  type WatchBridgeCounts,
  type WatchBridgeFailure,
} from "@/lib/watch-bridge-log";

/**
 * The last Watch bridge failure, for rendering somewhere the user will see it.
 *
 * A toast lasts three seconds and the failure it reports usually happens at
 * launch, so the toast alone can be missed entirely. This keeps the failure on
 * screen until the bridge registers successfully.
 */
export function useWatchBridgeFailure(): WatchBridgeFailure | null {
  const [failure, setFailure] = useState<WatchBridgeFailure | null>(() =>
    getWatchBridgeFailure(),
  );
  useEffect(() => subscribeWatchBridgeFailure(setFailure), []);
  return failure;
}

/**
 * The Watch bridge counters, for rendering a one-line summary.
 *
 * Separate from the failure hook because the useful state is usually the one
 * with no failure in it: records found and not saved.
 */
export function useWatchBridgeCounts(): WatchBridgeCounts {
  const [counts, setCounts] = useState<WatchBridgeCounts>(() =>
    getWatchBridgeCounts(),
  );
  useEffect(() => subscribeWatchBridgeCounts(setCounts), []);
  return counts;
}
