import {
  pgTable,
  text,
  jsonb,
  timestamp,
  index,
  primaryKey,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/**
 * Persisted idempotency cache for /scribe/generate-note.
 *
 * The in-process idempotency cache is lost on server restart. If the client
 * retries after a restart the server would re-run reserveUsage and charge a
 * second free slot. Persisting completed entries here makes retries safe even
 * across restarts and multi-instance deployments.
 *
 * Rows expire after 5 minutes (the same TTL used by the in-process cache).
 * The `expires_at` index supports periodic cleanup without a full table scan.
 */
export const scribeIdempotencyKeysTable = pgTable(
  "scribe_idempotency_keys",
  {
    idempotencyKey: text("idempotency_key").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, {
        onDelete: "cascade",
      }),
    response: jsonb("response").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.idempotencyKey] }),
    index("scribe_idempotency_keys_expires_at_idx").on(t.expiresAt),
  ],
);

export type ScribeIdempotencyKey =
  typeof scribeIdempotencyKeysTable.$inferSelect;
