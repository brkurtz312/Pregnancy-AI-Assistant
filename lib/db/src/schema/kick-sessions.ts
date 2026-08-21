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

export const kickSessionsTable = pgTable(
  "kick_sessions",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, {
        onDelete: "cascade",
      }),
    startedAt: timestamp("started_at").notNull().defaultNow(),
    endedAt: timestamp("ended_at"),
    kickCount: integer("kick_count").notNull().default(0),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    // Idempotency key for Watch-originated sessions (the Watch session's
    // startedAt string). A retry of the same logical session — e.g. the Watch
    // re-delivering after the phone app was force-quit — hits the partial
    // unique index below and the server returns the existing row instead of
    // inserting a duplicate.
    watchSessionId: text("watch_session_id"),
  },
  (table) => [
    // Partial unique index: rows with the same (userId, watchSessionId) are
    // rejected when watchSessionId is not null. Manually-created sessions
    // (no watchSessionId) are never constrained by this index.
    uniqueIndex("kick_sessions_user_watch_session_uniq")
      .on(table.userId, table.watchSessionId)
      .where(sql`${table.watchSessionId} IS NOT NULL`),
  ],
);

export const insertKickSessionSchema = createInsertSchema(
  kickSessionsTable,
).omit({ id: true, createdAt: true });
export type InsertKickSession = z.infer<typeof insertKickSessionSchema>;
export type KickSession = typeof kickSessionsTable.$inferSelect;
