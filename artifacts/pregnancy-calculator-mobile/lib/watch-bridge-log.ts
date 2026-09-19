/**
 * Makes a failing Watch bridge visible.
 *
 * Registering the active user with the native bridge, draining its pending
 * receipts and dispatching them were each wrapped in `.catch(() => {})`. When
 * registration fails the bridge keeps `activeUserId == nil`, and
 * `persistContractionReceipt` then refuses every incoming record and withholds
 * the acknowledgement so the Watch keeps retrying. The user sees a Watch that
 * records normally, a phone log that never fills, and no error anywhere —
 * which is the state this module exists to end.
 *
 * The surface is deliberately the UI, not the console: a console line is
 * unreadable without a Mac attached, and this failure silently drops health
 * data the user believes is being saved.
 */

export type WatchBridgeStage =
  | "module" // the native module did not load at all
  | "register" // setActiveWatchUser failed — the bridge has no active user
  | "deregister" // setActiveWatchUser(null) failed on sign-out
  | "drain" // getPendingContractionReceipts failed
  | "dispatch"; // replaying a drained receipt failed

export interface WatchBridgeFailure {
  stage: WatchBridgeStage;
  message: string;
  at: string;
}

const STAGE_LABEL: Record<WatchBridgeStage, string> = {
  module: "Watch module unavailable",
  register: "Watch link setup failed",
  deregister: "Watch sign-out failed",
  drain: "Watch records could not be read",
  dispatch: "Watch records could not be replayed",
};

/** Short enough for a toast, specific enough to act on. */
export function watchBridgeMessage(
  stage: WatchBridgeStage,
  err: unknown,
): string {
  const detail = errorDetail(err);
  return detail ? `${STAGE_LABEL[stage]}: ${detail}` : STAGE_LABEL[stage];
}

function errorDetail(err: unknown): string {
  if (err === undefined || err === null) return "";
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (typeof err === "object") {
    const e = err as { message?: unknown; code?: unknown };
    if (typeof e.message === "string") return e.message;
    if (typeof e.code === "string") return e.code;
    try {
      return JSON.stringify(err);
    } catch {
      return String(err);
    }
  }
  return String(err);
}

let last: WatchBridgeFailure | null = null;
const listeners = new Set<(f: WatchBridgeFailure | null) => void>();

/** Records a failure and notifies anything rendering it. */
export function recordWatchBridgeFailure(
  stage: WatchBridgeStage,
  err: unknown,
): WatchBridgeFailure {
  const failure: WatchBridgeFailure = {
    stage,
    message: watchBridgeMessage(stage, err),
    at: new Date().toISOString(),
  };
  last = failure;
  for (const l of listeners) l(failure);
  return failure;
}

/** Cleared once the bridge registers successfully, so a stale error cannot mislead. */
export function clearWatchBridgeFailure(): void {
  if (last === null) return;
  last = null;
  for (const l of listeners) l(null);
}

export function getWatchBridgeFailure(): WatchBridgeFailure | null {
  return last;
}

export function subscribeWatchBridgeFailure(
  listener: (f: WatchBridgeFailure | null) => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test seam — module state would otherwise leak between cases. */
export function __resetWatchBridgeFailureForTests(): void {
  last = null;
  listeners.clear();
}
