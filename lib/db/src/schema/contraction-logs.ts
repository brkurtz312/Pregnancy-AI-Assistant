import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const contractionLogsTable = pgTable("contraction_logs", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  startedAt: timestamp("started_at").notNull(),
  endedAt: timestamp("ended_at"),
  durationSeconds: integer("duration_seconds"),
  intervalSeconds: integer("interval_seconds"),
  sessionDate: text("session_date").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertContractionLogSchema = createInsertSchema(
  contractionLogsTable,
).omit({ id: true, createdAt: true });
export type InsertContractionLog = z.infer<typeof insertContractionLogSchema>;
export type ContractionLog = typeof contractionLogsTable.$inferSelect;
