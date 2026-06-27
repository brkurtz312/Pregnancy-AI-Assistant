import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Generic key-value config store for runtime-mutable server settings.
 *
 * Current keys:
 *   reviewer_access_code  — the code the Apple reviewer enters to sign in
 *   reviewer_demo_user_id — the Clerk user id of the demo account
 */
export const appConfigTable = pgTable("app_config", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type AppConfig = typeof appConfigTable.$inferSelect;
