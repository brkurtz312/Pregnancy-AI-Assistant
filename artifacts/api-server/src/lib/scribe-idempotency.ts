/**
 * In-flight + cached idempotency tracking for /scribe/generate-note.
 *
 * ## What this solves
 *
 * `reserveUsage` is committed atomically to the DB.  If the response is lost
 * in transit the client retries — but the quota is already consumed.  With an
 * idempotency key we can:
 *
 *  a) Return a cached result to retries that arrive *after* the first request
 *     finished successfully (cache-hit path).
 *  b) Return the same result to concurrent retries that arrive *while* the
 *     first request is still in-flight (pending-Promise path) — they attach to
 *     the same execution and never call `reserveUsage` again.
 *
 * ## Durability across server restarts
 *
 * The in-process map is authoritative for pending (in-flight) entries and
 * acts as a fast read-through for completed entries.  On commit, the result
 * is also persisted to the `scribe_idempotency_keys` PostgreSQL table so
 * that a retry arriving after a server restart or on a different instance
 * will still find the cached response and avoid a second `reserveUsage` call.
 *
 * DB failures are treated as misses (graceful degradation) — the in-process
 * cache is always checked first, so a healthy instance is never slowed down
 * by a brief DB hiccup.
 *
 * ## TTL / memory bounds
 *
 * Completed entries expire after IDEMPOTENCY_TTL_MS (5 min).  Eviction runs
 * on two schedules:
 *
 *  1. Background sweep — a setInterval fires every SWEEP_INTERVAL_MS
 *     (1 minute) and removes all expired Done entries regardless of traffic.
 *     The timer is unref'd so it never prevents the process from exiting.
 *     The same sweep also deletes expired rows from the DB table.
 *  2. Lazy eviction on every beginIdempotency write — if the cache size
 *     exceeds MAX_CACHE_SIZE after the sweep, the oldest Done entries are
 *     dropped until the count falls below the cap.
 *
 * Pending entries are cleaned up by their own abort() call.
 *
 * ## Security
 *
 * Cache keys are always scoped to `userId` so a different user presenting the
 * same key string cannot read another user's result.
 */

import { db, scribeIdempotencyKeysTable } from "@workspace/db";
import { and, eq, gt, lt } from "drizzle-orm";
import { logger } from "./logger";

export const IDEMPOTENCY_TTL_MS = 5 * 60 * 1000;
export const SWEEP_INTERVAL_MS = 60 * 1000;
const MAX_CACHE_SIZE = 10_000;

// ─── Internal types ────────────────────────────────────────────────────────────

interface PendingEntry {
  readonly status: "pending";
  /** Resolves to the successful response body, or rejects on abort. */
  readonly promise: Promise<unknown>;
  readonly resolve: (response: unknown) => void;
  readonly reject: (err: Error) => void;
}

interface DoneEntry {
  readonly status: "done";
  readonly response: unknown;
  readonly expiresAt: number;
}

type CacheEntry = PendingEntry | DoneEntry;

const cache = new Map<string, CacheEntry>();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cacheKey(idempotencyKey: string, userId: string): string {
  // Null byte separator makes collision between "a" + "bc" and "ab" + "c" impossible.
  return `${userId}\0${idempotencyKey}`;
}

/** Remove all expired Done entries. */
function evictExpired(): void {
  const now = Date.now();
  for (const [k, entry] of cache) {
    if (entry.status === "done" && entry.expiresAt <= now) {
      cache.delete(k);
    }
  }
}

/**
 * Enforce the hard cap by dropping the oldest Done entries (by expiresAt)
 * until the cache falls below MAX_CACHE_SIZE.  Pending entries are never
 * dropped here — they are managed by abort().
 */
function evictOldestDone(): void {
  if (cache.size < MAX_CACHE_SIZE) return;

  // Collect done entries sorted ascending by expiresAt (oldest first).
  const done: Array<[string, DoneEntry]> = [];
  for (const [k, entry] of cache) {
    if (entry.status === "done") {
      done.push([k, entry]);
    }
  }
  done.sort((a, b) => a[1].expiresAt - b[1].expiresAt);

  for (const [k] of done) {
    cache.delete(k);
    if (cache.size < MAX_CACHE_SIZE) break;
  }
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

/**
 * Look up a completed entry in the DB for cross-restart durability.
 * Returns the stored response, or null on miss or DB error.
 */
async function dbLookup(
  idempotencyKey: string,
  userId: string,
): Promise<unknown | null> {
  try {
    const rows = await db
      .select()
      .from(scribeIdempotencyKeysTable)
      .where(
        and(
          eq(scribeIdempotencyKeysTable.userId, userId),
          eq(scribeIdempotencyKeysTable.idempotencyKey, idempotencyKey),
          gt(scribeIdempotencyKeysTable.expiresAt, new Date()),
        ),
      )
      .limit(1);
    return rows.length > 0 ? rows[0].response : null;
  } catch (err) {
    logger.warn(
      { err },
      "scribe-idempotency: DB lookup failed, treating as cache miss",
    );
    return null;
  }
}

/**
 * Persist a completed result to the DB.
 * Throws on failure — callers are responsible for handling the error so they
 * can log it and decide whether to surface it to the user.
 */
async function dbUpsert(
  idempotencyKey: string,
  userId: string,
  response: unknown,
  expiresAt: Date,
): Promise<void> {
  await db
    .insert(scribeIdempotencyKeysTable)
    .values({
      idempotencyKey,
      userId,
      response: response as Record<string, unknown>,
      expiresAt,
    })
    .onConflictDoUpdate({
      target: [
        scribeIdempotencyKeysTable.userId,
        scribeIdempotencyKeysTable.idempotencyKey,
      ],
      set: {
        response: response as Record<string, unknown>,
        expiresAt,
      },
    });
}

/**
 * Delete expired rows from the DB.  Called by the background sweep — errors
 * are logged and swallowed so they never crash the sweep timer.
 */
async function dbSweep(): Promise<void> {
  try {
    await db
      .delete(scribeIdempotencyKeysTable)
      .where(lt(scribeIdempotencyKeysTable.expiresAt, new Date()));
  } catch (err) {
    logger.warn({ err }, "scribe-idempotency: DB sweep failed");
  }
}

// ─── Background sweep ─────────────────────────────────────────────────────────

let sweepTimer: ReturnType<typeof setInterval> | null = null;

function startSweepInterval(): void {
  if (sweepTimer !== null) return;
  sweepTimer = setInterval(() => {
    evictExpired();
    void dbSweep();
  }, SWEEP_INTERVAL_MS);
  // unref() prevents the timer from keeping the process alive when nothing
  // else is running — important for tests and clean process shutdown.
  sweepTimer.unref();
}

// Start the sweep automatically when this module is imported in production.
startSweepInterval();

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Check for a live idempotency entry for (key, user).
 *
 * Check order:
 *  1. In-process map (fast path for pending in-flight + same-instance done).
 *  2. DB (for completed entries that survived a server restart).
 *
 * - Cache miss → `{ found: false }`
 * - In-flight match → awaits the in-flight promise; returns `{ found: true,
 *   response }` on success, or `{ found: false }` if the original request
 *   aborted (so the caller can start a fresh attempt).
 * - Completed match (within TTL, in-process or DB) → `{ found: true, response }`
 */
export async function checkIdempotency(
  idempotencyKey: string,
  userId: string,
): Promise<{ found: true; response: unknown } | { found: false }> {
  const k = cacheKey(idempotencyKey, userId);
  const entry = cache.get(k);

  if (entry) {
    if (entry.status === "pending") {
      try {
        const response = await entry.promise;
        return { found: true, response };
      } catch {
        // The in-flight request aborted — treat this as a miss so the retry
        // can make a fresh attempt.
        return { found: false };
      }
    }

    // Done entry — check TTL.
    if (Date.now() > entry.expiresAt) {
      cache.delete(k);
      // Fall through to DB check — the in-process entry expired but the DB
      // row might still be valid (clock skew is negligible; they share TTL).
    } else {
      return { found: true, response: entry.response };
    }
  }

  // In-process miss — check the DB for cross-restart durability.
  const dbResponse = await dbLookup(idempotencyKey, userId);
  if (dbResponse !== null) {
    return { found: true, response: dbResponse };
  }

  return { found: false };
}

/**
 * Register this request as the authoritative in-flight handler for (key, user).
 * Must be called synchronously after a `checkIdempotency` miss and BEFORE
 * `reserveUsage`, so that concurrent retries find the Pending entry and attach
 * to this request's promise instead of making their own reservation.
 *
 * Returns two callbacks:
 *  - `commit(response)` — call on success; stores the result in-process and
 *    in the DB, and resolves all waiting retries.
 *  - `abort()` — call on any failure; removes the pending entry and rejects
 *    waiting retries (they will fall through to a fresh attempt).
 */
export function beginIdempotency(
  idempotencyKey: string,
  userId: string,
): { commit: (response: unknown) => Promise<void>; abort: () => void } {
  const k = cacheKey(idempotencyKey, userId);

  let resolve!: (r: unknown) => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<unknown>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  // Suppress "unhandledRejection" noise: when abort() is called but no
  // concurrent request is awaiting this promise, Node.js would otherwise
  // log a warning.  checkIdempotency attaches its own try/catch so the
  // rejection is still handled correctly for in-flight retries.
  promise.catch(() => {});

  cache.set(k, { status: "pending", promise, resolve, reject });

  // Lazy eviction: sweep expired done entries, then enforce the hard cap.
  if (cache.size > MAX_CACHE_SIZE) {
    evictExpired();
    evictOldestDone();
  }

  let settled = false;

  async function commit(response: unknown): Promise<void> {
    if (settled) return;
    settled = true;
    const expiresAtMs = Date.now() + IDEMPOTENCY_TTL_MS;
    cache.set(k, {
      status: "done",
      response,
      expiresAt: expiresAtMs,
    });
    // Persist to DB so retries on other instances / after a restart get the
    // cached response without a second reserveUsage call.  We await this so
    // the route does not return 200 until the row is durably written — a
    // retry after a restart is only safe once the DB row exists.
    try {
      await dbUpsert(idempotencyKey, userId, response, new Date(expiresAtMs));
    } catch (err) {
      // KNOWN GAP: if the DB is down at commit time the row is never written.
      // A retry on a different instance after a server restart will miss both
      // the (gone) in-process cache and the (unwritten) DB row, and call
      // reserveUsage a second time — double-charging the free quota.
      //
      // MITIGATION: log all fields needed to identify and refund affected
      // sessions.  Search for "scribe-idempotency-commit-failure" in the
      // structured log stream to build an alert or feed a reconciliation job.
      logger.warn(
        {
          err,
          userId,
          idempotencyKey,
          response,
          event: "scribe-idempotency-commit-failure",
        },
        "scribe-idempotency: DB upsert failed — response is cached in-process only; a cross-instance retry may consume a second quota slot",
      );
    }
    resolve(response);
  }

  function abort(): void {
    if (settled) return;
    settled = true;
    // Remove the pending entry so future retries start fresh.
    const current = cache.get(k);
    if (current?.status === "pending") {
      cache.delete(k);
    }
    // Reject the in-flight promise so any waiters in checkIdempotency fall
    // through to { found: false } and make a fresh attempt themselves.
    reject(new Error("idempotency-abort"));
  }

  return { commit, abort };
}

/** Exposed for test isolation only — clears the entire in-process cache. */
export function _clearIdempotencyCache(): void {
  cache.clear();
}

/** Exposed for test isolation only — returns the current number of cache entries. */
export function _idempotencyCacheSize(): number {
  return cache.size;
}

/**
 * Exposed for test isolation only — stops the background sweep timer.
 * Call this in afterAll / afterEach if a test suite advances fake timers,
 * then call _startSweepInterval() to restart it.
 */
export function _stopSweepInterval(): void {
  if (sweepTimer !== null) {
    clearInterval(sweepTimer);
    sweepTimer = null;
  }
}

/**
 * Exposed for test isolation only — (re)starts the background sweep timer.
 * Only needed in test suites that previously called _stopSweepInterval().
 */
export function _startSweepInterval(): void {
  startSweepInterval();
}
