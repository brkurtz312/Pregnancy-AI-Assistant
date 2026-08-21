import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const contractionLogsTable = pgTable(
  "contraction_logs",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, {
        onDelete: "cascade",
      }),
    startedAt: timestamp("started_at").notNull(),
    endedAt: timestamp("ended_at"),
    durationSeconds: integer("duration_seconds"),
    intervalSeconds: integer("interval_seconds"),
    sessionDate: text("session_date").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    // UUID assigned by the Watch to each contraction record.
    // Used as a server-enforced idempotency key: if a record with the same
    // watchRecordId already exists for this user, the insert is skipped and the
    // existing row is returned.  This prevents a duplicate contraction from being
    // saved when the phone app is force-quit after the API call succeeds but
    // before the native receipt acknowledgement is written.
    watchRecordId: text("watch_record_id"),
  },
  (table) => [
    // Partial unique index: rows with the same (userId, watchRecordId) are
    // rejected by the DB when watchRecordId is not null.  PostgreSQL treats each
    // NULL as distinct in unique indexes, so rows without a watchRecordId
    // (manually-entered contractions) are never constrained by this index.
    uniqueIndex("contraction_logs_user_watch_id_uniq")
      .on(table.userId, table.watchRecordId)
      .where(sql`${table.watchRecordId} IS NOT NULL`),
  ],
);

export const insertContractionLogSchema = createInsertSchema(
  contractionLogsTable,
).omit({ id: true, createdAt: true });
export type InsertContractionLog = z.infer<typeof insertContractionLogSchema>;
export type ContractionLog = typeof contractionLogsTable.$inferSelect;
