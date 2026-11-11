import {
  pgTable,
  serial,
  text,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

/**
 * Anonymous purchase-funnel counters, one row per client event.
 *
 * Deliberately holds nothing that identifies a person or a device: no user id,
 * email, device id or IP. The only questions it answers are "how many times did
 * step X happen, from where, signed in or not, on which build" — enough to see
 * where buyers drop out, nothing that would need a privacy disclosure beyond
 * aggregate analytics.
 *
 * `event` and `source` are validated against an allowlist in
 * `artifacts/api-server/src/routes/events.ts`; `error_code` is a short
 * machine-readable code (RevenueCat's readable error code or one of ours),
 * never a free-text message.
 */
export const funnelEventsTable = pgTable(
  "funnel_events",
  {
    id: serial("id").primaryKey(),
    event: text("event").notNull(),
    source: text("source"),
    signedIn: boolean("signed_in").notNull(),
    platform: text("platform").notNull(),
    appVersion: text("app_version").notNull(),
    errorCode: text("error_code"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("funnel_events_created_at_idx").on(t.createdAt)],
);

export type FunnelEvent = typeof funnelEventsTable.$inferSelect;
