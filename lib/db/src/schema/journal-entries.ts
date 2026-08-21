import { pgTable, text, timestamp, uuid, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const journalEntriesTable = pgTable("journal_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => usersTable.id, {
      onDelete: "cascade",
    }),
  text: text("text").notNull().default(""),
  mood: text("mood"),
  gestationalWeeks: integer("gestational_weeks"),
  gestationalDays: integer("gestational_days"),
  postpartumDays: integer("postpartum_days"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertJournalEntrySchema = createInsertSchema(
  journalEntriesTable,
).omit({ createdAt: true, updatedAt: true });

export type InsertJournalEntry = z.infer<typeof insertJournalEntrySchema>;
export type JournalEntryRow = typeof journalEntriesTable.$inferSelect;
