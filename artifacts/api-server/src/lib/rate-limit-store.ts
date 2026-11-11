import type { Store, Options, ClientRateLimitInfo } from "express-rate-limit";
import { db, rateLimitsTable } from "@workspace/db";
import { and, eq, gt, sql } from "drizzle-orm";

/**
 * Every rate-limiter prefix must be registered here exactly once.
 * Using a value from this object is a compile-time guarantee that the prefix is
 * known; `PostgresRateLimitStore` enforces at startup that no two limiter
 * definitions share the same prefix so a copy-paste typo cannot silently merge
 * two counters.
 */
export const RATE_LIMIT_PREFIXES = {
  aiBurst: "ai-burst",
  aiDaily: "ai-daily",
  redeemCode: "redeem-code",
  demoSession: "demo-session",
  funnelEvents: "funnel-events",
} as const;

export type RateLimitPrefix =
  (typeof RATE_LIMIT_PREFIXES)[keyof typeof RATE_LIMIT_PREFIXES];

// Precomputed allowlist for runtime validation. TypeScript erases the
// RateLimitPrefix type at runtime, so a JS caller or an `as` cast could
// still pass an arbitrary string; the allowlist catches that at startup.
const ALLOWED_PREFIXES = new Set<string>(Object.values(RATE_LIMIT_PREFIXES));

// Application-level duplicate guard: each prefix must be used by exactly one
// store instance per process. This Set is populated in the constructor during
// startup; any copy-paste error creating two limiters with the same prefix
// throws immediately rather than silently sharing a counter in production.
const _registeredPrefixes = new Set<string>();

/**
 * Clears the in-process prefix registry.
 * FOR TESTING ONLY — never call this in production code.
 * Use before each test that constructs `PostgresRateLimitStore` instances to
 * simulate the clean slate a fresh server process would have.
 */
export function _resetPrefixRegistryForTesting(): void {
  _registeredPrefixes.clear();
}

// Sweep expired rows occasionally so the table doesn't accumulate one row per
// distinct client key forever. A lapsed window is harmless on its own (it's
// reset in place on the next hit), so this is purely housekeeping. A single
// timer per process covers every limiter that uses this store.
const CLEANUP_INTERVAL_MS = 15 * 60 * 1000;
let cleanupStarted = false;

function ensureCleanup(): void {
  if (cleanupStarted) return;
  cleanupStarted = true;
  const timer = setInterval(() => {
    void db
      .delete(rateLimitsTable)
      .where(sql`${rateLimitsTable.expiresAt} <= now()`)
      .catch(() => {
        // Best-effort housekeeping; ignore failures.
      });
  }, CLEANUP_INTERVAL_MS);
  // Don't keep the process alive just to run cleanup.
  timer.unref();
}

/**
 * PostgreSQL-backed fixed-window store for express-rate-limit.
 *
 * The `prefix` parameter must be a value from `RATE_LIMIT_PREFIXES`. The
 * constructor enforces two invariants at startup:
 *
 *   1. **Known prefix** — the value must be in `RATE_LIMIT_PREFIXES` (the
 *      `ALLOWED_PREFIXES` allowlist catches JS callers or `as`-cast bypasses).
 *   2. **Unique prefix** — each value may only be used by one store per
 *      process. A duplicate throws immediately so a copy-paste typo is caught
 *      at startup rather than silently merging two limiters' counters.
 *
 * In tests, call `_resetPrefixRegistryForTesting()` in `beforeEach` to
 * simulate the clean registry a fresh server process would have.
 */
export class PostgresRateLimitStore implements Store {
  // Keys are global (shared across instances), not process-local.
  localKeys = false;
  private windowMs = 60_000;
  private readonly keyPrefix: RateLimitPrefix;

  constructor(prefix: RateLimitPrefix) {
    if (_registeredPrefixes.has(prefix)) {
      throw new Error(
        `PostgresRateLimitStore: prefix "${prefix}" is already registered. ` +
          `Each entry in RATE_LIMIT_PREFIXES must be used by exactly one limiter.`,
      );
    }
    if (!ALLOWED_PREFIXES.has(prefix)) {
      throw new Error(
        `PostgresRateLimitStore: unknown prefix "${prefix}". ` +
          `Add it to RATE_LIMIT_PREFIXES in rate-limit-store.ts before use.`,
      );
    }
    _registeredPrefixes.add(prefix);
    this.keyPrefix = prefix;
    ensureCleanup();
  }

  init(options: Options): void {
    this.windowMs = options.windowMs;
  }

  private fullKey(key: string): string {
    return `${this.keyPrefix}:${key}`;
  }

  async increment(key: string): Promise<ClientRateLimitInfo> {
    const fullKey = this.fullKey(key);
    const windowSeconds = Math.ceil(this.windowMs / 1000);
    const windowInterval = sql`(${windowSeconds} * interval '1 second')`;
    // Single-statement upsert: insert a fresh window or, on conflict, either
    // increment the live window or reset it if it has already lapsed. Atomic, so
    // concurrent requests across instances can't each start their own budget.
    const [row] = await db
      .insert(rateLimitsTable)
      .values({
        key: fullKey,
        hits: 1,
        expiresAt: sql`now() + ${windowInterval}`,
      })
      .onConflictDoUpdate({
        target: rateLimitsTable.key,
        set: {
          hits: sql`case when ${rateLimitsTable.expiresAt} <= now() then 1 else ${rateLimitsTable.hits} + 1 end`,
          expiresAt: sql`case when ${rateLimitsTable.expiresAt} <= now() then now() + ${windowInterval} else ${rateLimitsTable.expiresAt} end`,
        },
      })
      .returning({
        hits: rateLimitsTable.hits,
        expiresAt: rateLimitsTable.expiresAt,
      });

    if (!row) {
      // The upsert always writes a row, so this is defensive only.
      return {
        totalHits: 1,
        resetTime: new Date(Date.now() + this.windowMs),
      };
    }
    return { totalHits: row.hits, resetTime: row.expiresAt };
  }

  async decrement(key: string): Promise<void> {
    const fullKey = this.fullKey(key);
    await db
      .update(rateLimitsTable)
      .set({ hits: sql`greatest(${rateLimitsTable.hits} - 1, 0)` })
      .where(
        and(
          eq(rateLimitsTable.key, fullKey),
          gt(rateLimitsTable.expiresAt, sql`now()`),
        ),
      );
  }

  async resetKey(key: string): Promise<void> {
    await db
      .delete(rateLimitsTable)
      .where(eq(rateLimitsTable.key, this.fullKey(key)));
  }
}
