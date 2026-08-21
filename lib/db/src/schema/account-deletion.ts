import { integer, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Durable account-deletion tombstones.
 *
 * Completed rows are intentionally retained as a minimal tombstone. This
 * prevents a stale Clerk session from recreating app data after the identity
 * has been deleted, and gives the retry worker a durable record across restarts
 * and autoscaled API instances.
 */
export const accountDeletionRequestsTable = pgTable(
  "account_deletion_requests",
  {
    userId: text("user_id").primaryKey(),
    status: text("status").notNull().default("pending"),
    requestedAt: timestamp("requested_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    attemptCount: integer("attempt_count").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    lastError: text("last_error"),
    clerkDeletedAt: timestamp("clerk_deleted_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    index("account_deletion_requests_retry_idx").on(t.status, t.nextAttemptAt),
  ],
);

export type AccountDeletionRequest =
  typeof accountDeletionRequestsTable.$inferSelect;
