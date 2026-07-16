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
 * ## TTL / memory bounds
 *
 * Completed entries expire after IDEMPOTENCY_TTL_MS (5 min).  Eviction is
 * lazy — triggered on every `beginIdempotency` call when cache size exceeds
 * MAX_CACHE_SIZE.  Pending entries are cleaned up by their own abort() call.
 *
 * ## Security
 *
 * Cache keys are always scoped to `userId` so a different user presenting the
 * same key string cannot read another user's result.
 */

export const IDEMPOTENCY_TTL_MS = 5 * 60 * 1000;
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

/** Remove all expired Done entries; called lazily when the cache grows large. */
function evictExpired(): void {
  const now = Date.now();
  for (const [k, entry] of cache) {
    if (entry.status === "done" && entry.expiresAt <= now) {
      cache.delete(k);
    }
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Check for a live idempotency entry for (key, user).
 *
 * - Cache miss → `{ found: false }`
 * - In-flight match → awaits the in-flight promise; returns `{ found: true,
 *   response }` on success, or `{ found: false }` if the original request
 *   aborted (so the caller can start a fresh attempt).
 * - Completed match (within TTL) → `{ found: true, response }`
 */
export async function checkIdempotency(
  idempotencyKey: string,
  userId: string,
): Promise<{ found: true; response: unknown } | { found: false }> {
  const k = cacheKey(idempotencyKey, userId);
  const entry = cache.get(k);
  if (!entry) return { found: false };

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
    return { found: false };
  }
  return { found: true, response: entry.response };
}

/**
 * Register this request as the authoritative in-flight handler for (key, user).
 * Must be called synchronously after a `checkIdempotency` miss and BEFORE
 * `reserveUsage`, so that concurrent retries find the Pending entry and attach
 * to this request's promise instead of making their own reservation.
 *
 * Returns two callbacks:
 *  - `commit(response)` — call on success; stores the result and resolves all
 *    waiting retries.
 *  - `abort()` — call on any failure; removes the pending entry and rejects
 *    waiting retries (they will fall through to a fresh attempt).
 */
export function beginIdempotency(
  idempotencyKey: string,
  userId: string,
): { commit: (response: unknown) => void; abort: () => void } {
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

  // Lazy eviction: sweep expired done entries when the cache is too large.
  if (cache.size > MAX_CACHE_SIZE) {
    evictExpired();
  }

  let settled = false;

  function commit(response: unknown): void {
    if (settled) return;
    settled = true;
    cache.set(k, {
      status: "done",
      response,
      expiresAt: Date.now() + IDEMPOTENCY_TTL_MS,
    });
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
