import type { Store, Options, ClientRateLimitInfo } from "express-rate-limit";
import { db, rateLimitsTable } from "@workspace/db";
import { and, eq, gt, sql } from "drizzle-orm";

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
 * Each limiter must be constructed with a distinct `prefix` so that different
 * limiters (e.g. burst vs. daily) keyed on the same client IP do not share a
 * counter.
 */
export class PostgresRateLimitStore implements Store {
  // Keys are global (shared across instances), not process-local.
  localKeys = false;
  private windowMs = 60_000;
  private readonly keyPrefix: string;

  constructor(prefix: string) {
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
