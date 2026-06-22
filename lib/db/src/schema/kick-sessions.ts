import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const kickSessionsTable = pgTable("kick_sessions", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  endedAt: timestamp("ended_at"),
  kickCount: integer("kick_count").notNull().default(0),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertKickSessionSchema = createInsertSchema(kickSessionsTable).omit(
  { id: true, createdAt: true }
);
export type InsertKickSession = z.infer<typeof insertKickSessionSchema>;
export type KickSession = typeof kickSessionsTable.$inferSelect;
