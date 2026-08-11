import AsyncStorage from "@react-native-async-storage/async-storage";

export type SyncKey =
  | "hospital-bag"
  | "birth-plan"
  | "journal"
  | "watch-kicks"
  | "watch-contractions";

const PREFIX = "pending_sync:";

export async function markPendingSync(key: SyncKey): Promise<void> {
  await AsyncStorage.setItem(`${PREFIX}${key}`, "1");
}

export async function clearPendingSync(key: SyncKey): Promise<void> {
  await AsyncStorage.removeItem(`${PREFIX}${key}`);
}

export async function hasPendingSync(key: SyncKey): Promise<boolean> {
  const v = await AsyncStorage.getItem(`${PREFIX}${key}`);
  return v !== null;
}

// ─── Single-flight sync lock ──────────────────────────────────────────────────
//
// Prevents two reconnect handlers (the global root hook and a tool screen's own
// useNetReconnect) from concurrently upserting the same local-only journal
// entries, which would create duplicate server records.
//
// Usage:
//   if (!tryAcquireSyncLock("journal")) return; // another path is running
//   try { ... } finally { releaseSyncLock("journal"); }

const syncInFlight = new Set<SyncKey>();

/**
 * Attempts to acquire the sync lock for the given key.
 * Returns `true` if the caller may proceed, `false` if another sync is already
 * in progress for the same key (caller should bail out immediately).
 */
export function tryAcquireSyncLock(key: SyncKey): boolean {
  if (syncInFlight.has(key)) return false;
  syncInFlight.add(key);
  return true;
}

/**
 * Releases the sync lock acquired by `tryAcquireSyncLock`.
 * Must be called in a `finally` block to ensure the lock is always freed.
 */
export function releaseSyncLock(key: SyncKey): void {
  syncInFlight.delete(key);
}

// ─── Watch event queues ───────────────────────────────────────────────────────
//
// Watch events that fail to reach the API while offline are stored in per-user
// AsyncStorage queues.  Each item carries a `_clientId` so the flush path can
// remove individual items after a successful save rather than clearing the
// entire queue at once (prevents data loss if the app is killed mid-flush).
//
// ACCOUNT SAFETY
// ──────────────
// Queue keys are scoped to the authenticated userId.  A session-generation
// counter is maintained per userId and is incremented by
// `invalidateWatchQueueSession` whenever the user signs out.
//
//   • `enqueueWatchKickSession` / `enqueueWatchContraction` require the caller
//     to pass the generation they observed at Watch-event-receive time.  If
//     sign-out (and a generation bump) occurred before the enqueue runs, the
//     function rejects — preventing data from a signed-out session from being
//     persisted and later sent with a different user's token.
//
//   • `invalidateWatchQueueSession` bumps the generation and schedules a clear
//     through the same serial chains, so no stale enqueue can slip in after the
//     clear: any in-flight op that started before the invalidation will either
//     see the bumped generation and abort, or will have already written its item
//     and then immediately be followed by the clear.
//
// SERIAL CHAINS
// ─────────────
// All enqueue and targeted-remove operations on the kick queue are chained
// through `kickChain`; all contraction operations through `contractionChain`.
// This prevents concurrent async calls from interleaving their read-modify-
// write steps and overwriting each other's data.  `invalidateWatchQueueSession`
// chains through BOTH so the clear is ordered after any in-flight op on either
// queue.
//
// ERROR PROPAGATION
// ─────────────────
// Each chain entry wraps the caller promise separately; a failing op rejects
// the caller's promise but does NOT break the chain for subsequent operations.

export interface PendingKickSession {
  /** @internal — not sent to the API; used for targeted per-item removal */
  _clientId: string;
  startedAt?: string | null;
  endedAt?: string | null;
  kickCount?: number | null;
  /** Server-enforced idempotency key (the Watch session's startedAt) forwarded
   *  by the queue flush so a replay cannot create a duplicate row. */
  watchSessionId?: string | null;
}

export interface PendingContraction {
  /** @internal — not sent to the API; used for targeted per-item removal */
  _clientId: string;
  startedAt: string;
  endedAt?: string | null;
  durationSeconds?: number | null;
  intervalSeconds?: number | null;
  sessionDate: string;
  /** Watch-assigned UUID forwarded to the API as a server-enforced idempotency
   *  key.  Presence prevents a duplicate row when the phone is force-quit after
   *  the API call succeeds but before the native receipt acknowledgement fires. */
  watchRecordId?: string | null;
}

// ── Storage keys ──────────────────────────────────────────────────────────────

function watchKicksKey(userId: string): string {
  return `watch_queue:kicks:${userId}`;
}

function watchContractionsKey(userId: string): string {
  return `watch_queue:contractions:${userId}`;
}

function recentKickSavesKey(userId: string): string {
  return `watch_recent_kicks:${userId}`;
}

function generateClientId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

// ── Low-level read / write ────────────────────────────────────────────────────

async function readQueue<T>(storageKey: string): Promise<T[]> {
  const raw = await AsyncStorage.getItem(storageKey);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as T[];
  } catch {
    return [];
  }
}

async function writeQueue<T>(storageKey: string, items: T[]): Promise<void> {
  if (items.length === 0) {
    await AsyncStorage.removeItem(storageKey);
  } else {
    await AsyncStorage.setItem(storageKey, JSON.stringify(items));
  }
}

// ── Session generation tracking ───────────────────────────────────────────────
//
// Incremented by `invalidateWatchQueueSession` on sign-out.
// Callers capture the value at Watch-event time and pass it to
// enqueueWatch* so that post-sign-out enqueues are rejected.

const watchQueueGen = new Map<string, number>();

/** Returns the current session generation for the given user. */
export function getWatchQueueGeneration(userId: string): number {
  return watchQueueGen.get(userId) ?? 0;
}

function bumpGen(userId: string): void {
  watchQueueGen.set(userId, (watchQueueGen.get(userId) ?? 0) + 1);
}

// ── Serial operation chains ───────────────────────────────────────────────────
//
// Each chain entry is a no-arg async thunk.  A helper wraps it so that:
//   1. The caller gets a promise that resolves/rejects with the thunk's outcome.
//   2. If the thunk throws, the chain itself continues (the next enqueued op
//      will still run), but the caller's promise rejects with the error.

let kickChain: Promise<void> = Promise.resolve();
let contractionChain: Promise<void> = Promise.resolve();

function chainKickOp<T>(op: () => Promise<T>): Promise<T> {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const caller = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  kickChain = kickChain
    .then(async () => {
      try {
        resolve(await op());
      } catch (e) {
        reject(e);
      }
    })
    .catch(() => {}); // keep chain alive regardless of per-op errors
  return caller;
}

function chainContractionOp<T>(op: () => Promise<T>): Promise<T> {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const caller = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  contractionChain = contractionChain
    .then(async () => {
      try {
        resolve(await op());
      } catch (e) {
        reject(e);
      }
    })
    .catch(() => {}); // keep chain alive regardless of per-op errors
  return caller;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Appends a failed kick session to the local retry queue for the given user.
 *
 * `capturedGen` must be the value of `getWatchQueueGeneration(userId)` captured
 * at the moment the Watch event was received (before the primary API call).
 * If the session generation has advanced since then (i.e. the user signed out),
 * the function rejects so the caller can show an appropriate error rather than
 * silently persisting data under an invalidated session.
 */
export function enqueueWatchKickSession(
  session: Omit<PendingKickSession, "_clientId">,
  userId: string,
  capturedGen: number,
): Promise<void> {
  return chainKickOp(async () => {
    if (getWatchQueueGeneration(userId) !== capturedGen) {
      throw new Error("Watch kick session invalidated — user signed out");
    }
    const key = watchKicksKey(userId);
    const items = await readQueue<PendingKickSession>(key);
    await writeQueue(key, [
      ...items,
      { ...session, _clientId: generateClientId() },
    ]);
  });
}

/** Returns all queued kick sessions for the given user without removing them. */
export async function readWatchKickSessions(
  userId: string,
): Promise<PendingKickSession[]> {
  return readQueue<PendingKickSession>(watchKicksKey(userId));
}

/**
 * Removes a single kick session from the queue by its `_clientId`.
 * Only called after a successful API save, so only that item is cleared.
 */
export function removeWatchKickSessionById(
  userId: string,
  clientId: string,
): Promise<void> {
  return chainKickOp(async () => {
    const key = watchKicksKey(userId);
    const items = await readQueue<PendingKickSession>(key);
    await writeQueue(
      key,
      items.filter((i) => i._clientId !== clientId),
    );
  });
}

/**
 * Appends a failed contraction to the local retry queue for the given user.
 *
 * `capturedGen` must be the value of `getWatchQueueGeneration(userId)` captured
 * at the moment the Watch event was received.  Rejects if sign-out occurred.
 */
export function enqueueWatchContraction(
  contraction: Omit<PendingContraction, "_clientId">,
  userId: string,
  capturedGen: number,
): Promise<void> {
  return chainContractionOp(async () => {
    if (getWatchQueueGeneration(userId) !== capturedGen) {
      throw new Error("Watch contraction invalidated — user signed out");
    }
    const key = watchContractionsKey(userId);
    const items = await readQueue<PendingContraction>(key);
    await writeQueue(key, [
      ...items,
      { ...contraction, _clientId: generateClientId() },
    ]);
  });
}

/** Returns all queued contractions for the given user without removing them. */
export async function readWatchContractions(
  userId: string,
): Promise<PendingContraction[]> {
  return readQueue<PendingContraction>(watchContractionsKey(userId));
}

/**
 * Removes a single contraction from the queue by its `_clientId`.
 * Only called after a successful API save.
 */
export function removeWatchContractionById(
  userId: string,
  clientId: string,
): Promise<void> {
  return chainContractionOp(async () => {
    const key = watchContractionsKey(userId);
    const items = await readQueue<PendingContraction>(key);
    await writeQueue(
      key,
      items.filter((i) => i._clientId !== clientId),
    );
  });
}

// ── Persisted recent-kick-session store (cold-start deduplication) ────────────
//
// The in-process dedup Set in WatchBackgroundListener only survives for the
// lifetime of the current JS process.  If the user force-quits the app and the
// Watch retries the same logical session on relaunch, the Set is empty and the
// duplicate would be written again.  This small persisted store of recently
// saved kick-session `startedAt` timestamps (per user, 24-hour TTL) covers
// that cold-start gap: handleKickSessionEnd consults it before calling the
// API, and records into it after a successful save.
//
// Storage shape: JSON map of `startedAt` → savedAt epoch-ms, under a per-user
// key.  Expired entries are pruned on every read and write.  All mutations are
// serialized through `kickChain` alongside queue ops, and the store is wiped
// (and the key removed) by `invalidateWatchQueueSession` on sign-out.

const RECENT_KICK_SAVE_TTL_MS = 24 * 60 * 60 * 1000;

type RecentKickSaves = Record<string, number>;

async function readRecentKickSaves(
  userId: string,
  now: number,
): Promise<RecentKickSaves> {
  const raw = await AsyncStorage.getItem(recentKickSavesKey(userId));
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return {};
  }
  const pruned: RecentKickSaves = {};
  for (const [startedAt, savedAt] of Object.entries(
    parsed as Record<string, unknown>,
  )) {
    if (
      typeof savedAt === "number" &&
      now - savedAt < RECENT_KICK_SAVE_TTL_MS
    ) {
      pruned[startedAt] = savedAt;
    }
  }
  return pruned;
}

/**
 * Records a successfully saved kick session `startedAt` in the persisted
 * recent-saves store so a Watch retry after force-quit + relaunch is
 * suppressed.  Entries expire after 24 hours.
 */
export function markKickSessionSaved(
  userId: string,
  startedAt: string,
): Promise<void> {
  return chainKickOp(async () => {
    const now = Date.now();
    const saves = await readRecentKickSaves(userId, now);
    saves[startedAt] = now;
    await AsyncStorage.setItem(
      recentKickSavesKey(userId),
      JSON.stringify(saves),
    );
  });
}

/**
 * Returns true if the given kick session `startedAt` was saved for this user
 * within the last 24 hours (persisted across app restarts).
 *
 * Expired entries are pruned and the pruned map is written back so the stored
 * map cannot grow without bound.  Serialized through the kick chain so the
 * write-back cannot interleave with a concurrent markKickSessionSaved.
 */
export function isKickSessionRecentlySaved(
  userId: string,
  startedAt: string,
): Promise<boolean> {
  return chainKickOp(async () => {
    const key = recentKickSavesKey(userId);
    const raw = await AsyncStorage.getItem(key);
    const saves = await readRecentKickSaves(userId, Date.now());
    const prunedJson = JSON.stringify(saves);
    if (raw !== null && raw !== prunedJson) {
      // Persist the pruned map (or remove the key entirely when empty).
      if (Object.keys(saves).length === 0) {
        await AsyncStorage.removeItem(key);
      } else {
        await AsyncStorage.setItem(key, prunedJson);
      }
    }
    return startedAt in saves;
  });
}

/**
 * Invalidates the Watch queue session for the given user and clears all
 * pending events.  Must be called on sign-out.
 *
 * Bumps the session generation BEFORE chaining the clear so that:
 *   • Any enqueueWatch* calls that run after this call but before the clear
 *     completes will see the bumped generation and reject.
 *   • The clear itself is ordered after all in-flight enqueue/remove ops on
 *     both chains, so a Watch callback currently writing to the queue will
 *     finish first, and then the clear will wipe it.
 *
 * Returns a promise that resolves when both chains have processed the clear.
 */
export function invalidateWatchQueueSession(userId: string): Promise<void> {
  // Bump synchronously before chaining so all subsequent enqueue calls (even
  // those already waiting in the chain) see the new generation.
  bumpGen(userId);
  const clearOp = async (): Promise<void> => {
    await AsyncStorage.multiRemove([
      watchKicksKey(userId),
      watchContractionsKey(userId),
      recentKickSavesKey(userId),
    ]);
  };
  // Route through BOTH chains so the clear is ordered after any in-flight op
  // on either queue.
  const kickDone = chainKickOp(clearOp);
  const contractionDone = chainContractionOp(clearOp);
  return Promise.all([kickDone, contractionDone]).then(() => {});
}
