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

// ─── Counting what succeeded ────────────────────────────────────────────────
//
// Recording failures was not enough. A drain that runs, returns nothing, and
// reports no error is indistinguishable from a drain that returns records and
// drops every one of them — and that is exactly the state the Watch->phone
// defect left the app in on 20 Sep 2026: the Watch showed records
// acknowledged, the phone showed no error, and nothing arrived.
//
// So count the successes too. A number that should be non-zero and is not
// says more than any error message.

export interface WatchBridgeCounts {
  /** Times the drain effect body ran past its guards. */
  effectRuns: number;
  /** Times setActiveWatchUser resolved — the stage before the drain. */
  registered: number;
  /** Times it did not resolve within the timeout and the drain went ahead. */
  registerTimeouts: number;
  /** Effect runs abandoned because this user had already been drained. */
  alreadyDrained: number;
  /**
   * Stages abandoned because the generation token moved under them.
   *
   * Silent until now, and the reason the drain looked like a stalled promise:
   * the token was claimed before the guard that decides whether a run does any
   * work, so every do-nothing re-run invalidated the one chain that was
   * draining.
   */
  generationAbandoned: number;
  /** Drain attempts (getPendingContractionReceipts calls that resolved). */
  drains: number;
  /** Records the native store handed back across those drains. */
  returned: number;
  /** Records dropped before dispatch because a required field was missing. */
  skipped: number;
  /** Why the last skip happened, for when `skipped` is the non-zero number. */
  lastSkipReason: string | null;
  /** Records handed to the save path, whether from a drain or a live event. */
  dispatched: number;
  /** Live onContractionUpdate events received from the native bridge. */
  live: number;
  /** Saves that reached the API. */
  saved: number;
  /** Saves that fell back to the offline queue. */
  queued: number;
  /** Dispatches that returned early because JS considered itself signed out. */
  droppedSignedOut: number;
  /**
   * Dispatches where fetching the Clerk token threw.
   *
   * `await getToken()` sat outside the try block, so a rejection threw out of
   * the handler before anything could catch it: no save, no toast, no error,
   * and the native receipt left unacknowledged so it replays forever.
   */
  tokenFailed: number;
  /** Dispatches abandoned because the queue generation moved (account switch). */
  droppedGeneration: number;
  /** True when no event API worked at all — the live path is dead. */
  listenerFailed: boolean;
  /**
   * Which event API actually delivered the listener.
   *
   * "module" is the modern one, "emitter" the deprecated wrapper, "none" no
   * working path. Worth reporting because function calls bridge fine under
   * both, so this is invisible from every other symptom.
   */
  listenerStrategy: "module" | "emitter" | "none" | null;
}

const zeroCounts = (): WatchBridgeCounts => ({
  effectRuns: 0,
  registered: 0,
  registerTimeouts: 0,
  alreadyDrained: 0,
  generationAbandoned: 0,
  drains: 0,
  returned: 0,
  skipped: 0,
  lastSkipReason: null,
  dispatched: 0,
  live: 0,
  saved: 0,
  queued: 0,
  droppedSignedOut: 0,
  tokenFailed: 0,
  droppedGeneration: 0,
  listenerFailed: false,
  listenerStrategy: null,
});

let counts: WatchBridgeCounts = zeroCounts();
const countListeners = new Set<(c: WatchBridgeCounts) => void>();

/** Adds to the counters. Safe to call from any thread of control. */
export function countWatchBridge(change: Partial<WatchBridgeCounts>): void {
  const next = { ...counts };
  for (const [key, value] of Object.entries(change)) {
    if (typeof value === "number") {
      next[key as "drains"] += value;
    } else if (typeof value === "boolean") {
      next[key as "listenerFailed"] = value;
    } else if (key === "listenerStrategy") {
      next.listenerStrategy = value as WatchBridgeCounts["listenerStrategy"];
    } else if (typeof value === "string" || value === null) {
      next[key as "lastSkipReason"] = value;
    }
  }
  counts = next;
  for (const l of countListeners) l(next);
}

export function getWatchBridgeCounts(): WatchBridgeCounts {
  return counts;
}

export function subscribeWatchBridgeCounts(
  listener: (c: WatchBridgeCounts) => void,
): () => void {
  countListeners.add(listener);
  return () => {
    countListeners.delete(listener);
  };
}

/**
 * One line a person can read on a phone, or null when there is nothing to say.
 *
 * Deliberately leads with the number that is wrong. "3 found, 0 saved" is the
 * whole diagnosis; a paragraph around it is not.
 */
export function watchBridgeSummary(c: WatchBridgeCounts): string | null {
  if (c.listenerFailed)
    return "Watch live updates unavailable (no working event API)";

  // Never return null for "nothing has happened". That state — the drain
  // never completing — was the most diagnostic one of all, and reporting it
  // as silence made it indistinguishable from being on an older build.
  if (c.drains === 0 && c.returned === 0 && c.live === 0) {
    const stage: string[] = [];
    stage.push(`effect ran ${c.effectRuns}`);
    stage.push(`registered ${c.registered}`);
    if (c.registerTimeouts > 0)
      stage.push(`register timeouts ${c.registerTimeouts}`);
    if (c.alreadyDrained > 0) stage.push(`skipped ${c.alreadyDrained}`);
    if (c.generationAbandoned > 0)
      stage.push(`abandoned ${c.generationAbandoned}`);
    if (c.listenerStrategy !== null)
      stage.push(`events via ${c.listenerStrategy}`);
    return `Watch records: no drain yet (${stage.join(", ")})`;
  }

  const parts = [`${c.returned} found`, `${c.saved} saved`];
  if (c.queued > 0) parts.push(`${c.queued} queued offline`);
  if (c.skipped > 0) {
    parts.push(
      `${c.skipped} skipped${c.lastSkipReason ? ` (${c.lastSkipReason})` : ""}`,
    );
  }
  if (c.droppedSignedOut > 0)
    parts.push(`${c.droppedSignedOut} dropped, signed out`);
  if (c.tokenFailed > 0)
    parts.push(`${c.tokenFailed} failed, no sign-in token`);
  if (c.droppedGeneration > 0)
    parts.push(`${c.droppedGeneration} dropped, account changed`);
  if (c.live > 0) parts.push(`${c.live} live`);
  // Which event API attached matters only while no live event has arrived —
  // after that it has plainly worked.
  if (c.live === 0 && c.listenerStrategy !== null) {
    parts.push(`events via ${c.listenerStrategy}`);
  }
  return `Watch records: ${parts.join(", ")}`;
}

/** Test seam — module state would otherwise leak between cases. */
export function __resetWatchBridgeCountsForTests(): void {
  counts = zeroCounts();
  countListeners.clear();
}
