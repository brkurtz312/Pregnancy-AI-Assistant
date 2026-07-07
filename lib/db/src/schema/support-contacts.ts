import { pgTable, text, timestamp, uuid, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const supportContactsTable = pgTable("support_contacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  firstName: text("first_name").notNull(),
  role: text("role").notNull(),
  phone: text("phone").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertSupportContactSchema = createInsertSchema(
  supportContactsTable,
).omit({ id: true, createdAt: true, updatedAt: true });

export type InsertSupportContact = z.infer<typeof insertSupportContactSchema>;
export type SupportContact = typeof supportContactsTable.$inferSelect;
