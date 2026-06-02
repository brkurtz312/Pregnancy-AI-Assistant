import { pgTable, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Application users, keyed by their Clerk user id.
 *
 * Stripe-owned data (customers, payments, prices) lives in the `stripe.*`
 * schema managed by stripe-replit-sync. Here we only keep the link to the
 * Stripe customer plus a denormalized entitlement flag for the Full
 * Pregnancy Pass so gating checks are fast.
 */
export const usersTable = pgTable("users", {
  id: text("id").primaryKey(), // Clerk user id
  email: text("email"),
  stripeCustomerId: text("stripe_customer_id"),
  hasPass: boolean("has_pass").notNull().default(false),
  passPurchasedAt: timestamp("pass_purchased_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
