import { pgTable, text, integer, timestamp, index } from "drizzle-orm/pg-core";

/**
 * Shared, cross-instance counters for express-rate-limit.
 *
 * The public API runs as an autoscaled deployment with multiple Node processes.
 * An in-memory rate-limit store would give each instance its own budget, so a
 * client could multiply the effective limit by the number of warm instances.
 * Backing the limiter with this table makes the window counters global.
 *
 * `key` is `<limiterPrefix>:<clientKey>` (e.g. "ai-burst:1.2.3.4"); the prefix
 * keeps different limiters from sharing a counter for the same client. `hits`
 * is the request count in the current fixed window and `expiresAt` is when that
 * window resets. Lapsed windows are reset in place on the next hit; expired
 * rows are also swept periodically so the table doesn't grow unbounded.
 */
export const rateLimitsTable = pgTable(
  "rate_limits",
  {
    key: text("key").primaryKey(),
    hits: integer("hits").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("rate_limits_expires_at_idx").on(t.expiresAt)],
);

export type RateLimit = typeof rateLimitsTable.$inferSelect;
