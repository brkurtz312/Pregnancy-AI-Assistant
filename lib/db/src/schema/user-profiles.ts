import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const userProfilesTable = pgTable("user_profiles", {
  userId: text("user_id").primaryKey(),
  dueDate: text("due_date"),
  providerName: text("provider_name"),
  providerPhone: text("provider_phone"),
  hospitalName: text("hospital_name"),
  hospitalPhone: text("hospital_phone"),
  hospitalAddress: text("hospital_address"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertUserProfileSchema = createInsertSchema(
  userProfilesTable,
).omit({ createdAt: true, updatedAt: true });

export type InsertUserProfile = z.infer<typeof insertUserProfileSchema>;
export type UserProfile = typeof userProfilesTable.$inferSelect;
