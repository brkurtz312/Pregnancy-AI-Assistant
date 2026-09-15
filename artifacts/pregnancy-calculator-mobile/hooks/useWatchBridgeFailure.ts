import { useEffect, useState } from "react";
import {
  getWatchBridgeFailure,
  subscribeWatchBridgeFailure,
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
