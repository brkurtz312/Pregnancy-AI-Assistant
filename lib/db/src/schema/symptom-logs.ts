import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const symptomLogsTable = pgTable("symptom_logs", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  symptom: text("symptom").notNull(),
  severity: integer("severity"),
  notes: text("notes"),
  loggedAt: timestamp("logged_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertSymptomLogSchema = createInsertSchema(symptomLogsTable).omit(
  { id: true, createdAt: true },
);
export type InsertSymptomLog = z.infer<typeof insertSymptomLogSchema>;
export type SymptomLog = typeof symptomLogsTable.$inferSelect;
