import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const prenatalVisitsTable = pgTable("prenatal_visits", {
  id: serial("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => usersTable.id, {
      onDelete: "cascade",
    }),
  visitDate: timestamp("visit_date").notNull(),
  weight: text("weight"),
  bloodPressure: text("blood_pressure"),
  fetalHeartRate: text("fetal_heart_rate"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertPrenatalVisitSchema = createInsertSchema(
  prenatalVisitsTable,
).omit({ id: true, createdAt: true });
export type InsertPrenatalVisit = z.infer<typeof insertPrenatalVisitSchema>;
export type PrenatalVisit = typeof prenatalVisitsTable.$inferSelect;
