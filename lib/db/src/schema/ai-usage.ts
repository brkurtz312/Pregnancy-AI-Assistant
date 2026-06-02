import {
  pgTable,
  text,
  integer,
  timestamp,
  primaryKey,
} from "drizzle-orm/pg-core";

/**
 * Per-period free AI question metering.
 *
 * `identifier` is either `user:<clerkUserId>` for signed-in users or
 * `ip:<key>` for anonymous visitors. `periodKey` is an ISO week string
 * (e.g. "2026-W23"), so each row counts one identifier's usage within one
 * week. Pass holders bypass this metering entirely.
 */
export const aiUsageTable = pgTable(
  "ai_usage",
  {
    identifier: text("identifier").notNull(),
    periodKey: text("period_key").notNull(),
    count: integer("count").notNull().default(0),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.periodKey] })],
);

export type AiUsage = typeof aiUsageTable.$inferSelect;
