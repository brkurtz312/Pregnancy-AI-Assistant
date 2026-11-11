/**
 * Purchase-funnel report. Read-only: it runs SELECTs and nothing else.
 *
 * Prints, for the last 7 and 28 days:
 *   - how many times each funnel event happened, split signed in / signed out
 *   - paywall views and pass button taps by where they came from (source)
 *   - error codes behind offerings_load_failed and purchase_failed
 *
 *   pnpm --filter @workspace/scripts run funnel-report
 *
 * Requires DATABASE_URL. Against Railway from a laptop, use the Postgres
 * service's DATABASE_PUBLIC_URL (the internal one does not resolve outside
 * Railway) — see docs/db-migration.md.
 */

import { pool } from "@workspace/db";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";

/** Funnel order, so the table reads top to bottom as a user would move. */
const FUNNEL_ORDER = [
  "ai_limit_reached",
  "paywall_viewed",
  "signin_required_for_purchase",
  "pass_cta_tapped",
  "offerings_load_failed",
  "purchase_started",
  "purchase_cancelled",
  "purchase_failed",
  "purchase_completed",
  "restore_tapped",
];

type Row = Record<string, unknown>;

let db: {
  execute: (q: ReturnType<typeof sql>) => Promise<{ rows: unknown[] }>;
};

async function rows(query: ReturnType<typeof sql>): Promise<Row[]> {
  const result = await db.execute(query);
  return result.rows as Row[];
}

function num(v: unknown): number {
  return Number(v ?? 0);
}

async function report(days: number): Promise<void> {
  const since = sql`now() - make_interval(days => ${days})`;

  console.log(`\n=== Last ${days} days ===`);

  const byEvent = await rows(sql`
    SELECT event,
           count(*)                              AS total,
           count(*) FILTER (WHERE signed_in)     AS signed_in,
           count(*) FILTER (WHERE NOT signed_in) AS signed_out
    FROM funnel_events
    WHERE created_at >= ${since}
    GROUP BY event
  `);
  const eventMap = new Map(byEvent.map((r) => [String(r.event), r]));
  console.log("\nEvents (funnel order)");
  console.table(
    FUNNEL_ORDER.map((event) => {
      const r = eventMap.get(event);
      return {
        event,
        total: num(r?.total),
        signed_in: num(r?.signed_in),
        signed_out: num(r?.signed_out),
      };
    }),
  );

  const bySource = await rows(sql`
    SELECT event, coalesce(source, '(none)') AS source, count(*) AS total
    FROM funnel_events
    WHERE created_at >= ${since}
      AND event IN ('paywall_viewed', 'pass_cta_tapped')
    GROUP BY event, source
    ORDER BY event, total DESC
  `);
  console.log("\nPaywall views and pass taps by source");
  if (bySource.length === 0) console.log("  (none)");
  else
    console.table(
      bySource.map((r) => ({
        event: String(r.event),
        source: String(r.source),
        total: num(r.total),
      })),
    );

  const errors = await rows(sql`
    SELECT event, coalesce(error_code, '(none)') AS error_code, count(*) AS total
    FROM funnel_events
    WHERE created_at >= ${since}
      AND event IN ('offerings_load_failed', 'purchase_failed')
    GROUP BY event, error_code
    ORDER BY event, total DESC
  `);
  console.log("\nFailure error codes");
  if (errors.length === 0) console.log("  (none)");
  else
    console.table(
      errors.map((r) => ({
        event: String(r.event),
        error_code: String(r.error_code),
        total: num(r.total),
      })),
    );

  const byVersion = await rows(sql`
    SELECT platform, app_version, count(*) AS total
    FROM funnel_events
    WHERE created_at >= ${since}
    GROUP BY platform, app_version
    ORDER BY total DESC
  `);
  console.log("\nAll events by platform and app version");
  if (byVersion.length === 0) console.log("  (none)");
  else
    console.table(
      byVersion.map((r) => ({
        platform: String(r.platform),
        app_version: String(r.app_version),
        total: num(r.total),
      })),
    );
}

async function main(): Promise<void> {
  // One connection, inside a READ ONLY transaction that is rolled back at the
  // end: if anything here ever tried to write, Postgres would refuse it rather
  // than quietly change production data.
  const client = await pool.connect();
  try {
    db = drizzle(client);
    await client.query("BEGIN TRANSACTION READ ONLY");
    await report(7);
    await report(28);
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    client.release();
  }
}

main()
  .catch((err: unknown) => {
    console.error(
      "Funnel report failed:",
      err instanceof Error ? err.message : err,
    );
    process.exitCode = 1;
  })
  .finally(() => pool.end());
