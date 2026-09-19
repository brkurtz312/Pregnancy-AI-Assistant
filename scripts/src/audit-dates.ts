/**
 * Read-only audit of the date fields affected by the timezone bugs fixed in
 * "Treat session dates as calendar days" and "Treat due dates as calendar days".
 *
 * Runs SELECTs only. It never writes, and it prints what it cannot determine as
 * plainly as what it can.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run audit-dates
 *   pnpm --filter @workspace/scripts run audit-dates -- --tz=Europe/London
 *   pnpm --filter @workspace/scripts run audit-dates -- --tz=America/Chicago --limit=50
 *
 * --tz is the timezone the people using the app were in. It has to be supplied
 * because the database does not record it, and without it no row can be judged.
 */

import { pool } from "@workspace/db";

const args = process.argv.slice(2);

function flag(name: string, fallback: string): string {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

const TZ = flag("tz", "America/New_York");
const LIMIT = Number(flag("limit", "20"));

function heading(text: string): void {
  console.log(`\n${text}\n${"─".repeat(text.length)}`);
}

/**
 * Profiles: how many exist, and why none of them can be judged from here.
 *
 * The write bug stored a due date one day early for clients east of Greenwich.
 * `user_profiles` keeps only the computed `due_date` — never the LMP,
 * conception or ultrasound date it came from — so there is nothing to
 * recompute against, and a wrong date is identical to a right one.
 */
async function auditProfiles(): Promise<void> {
  heading("Profiles");

  const { rows } = await pool.query<{
    profiles: string;
    with_due_date: string;
    with_delivery_date: string;
  }>(`
    SELECT count(*)::text AS profiles,
           count(due_date)::text AS with_due_date,
           count(delivery_date)::text AS with_delivery_date
    FROM user_profiles
  `);
  const { profiles, with_due_date, with_delivery_date } = rows[0];
  console.log(`profiles                 ${profiles}`);
  console.log(`  with a due date        ${with_due_date}`);
  console.log(`  with a delivery date   ${with_delivery_date}`);

  if (Number(with_due_date) === 0) {
    console.log("\nNo due dates stored — nothing to check.");
    return;
  }

  const listing = await pool.query<{
    user_id: string;
    due_date: string | null;
    delivery_date: string | null;
    edd_method: string | null;
    zip_code: string | null;
    updated_at: Date;
  }>(
    `SELECT user_id, due_date, delivery_date, edd_method, zip_code, updated_at
       FROM user_profiles
      WHERE due_date IS NOT NULL
      ORDER BY updated_at DESC
      LIMIT $1`,
    [LIMIT],
  );

  console.log("");
  for (const r of listing.rows) {
    const parts = [
      `due ${r.due_date}`,
      r.delivery_date ? `delivered ${r.delivery_date}` : null,
      r.edd_method ? `via ${r.edd_method}` : null,
      r.zip_code ? `zip ${r.zip_code}` : null,
      `saved ${r.updated_at.toISOString().slice(0, 10)}`,
    ].filter(Boolean);
    console.log(`  ${r.user_id}  ${parts.join("  ")}`);
  }

  console.log(
    [
      "",
      "These cannot be verified from the database. Only the computed due date is",
      "stored, never the date it was derived from, so a date that was saved a day",
      "early looks exactly like a correct one.",
      "",
      "What narrows it: the write bug only triggered east of Greenwich. A profile",
      "whose owner used the app from the Americas was always stored correctly —",
      "a US zip code above is good evidence of that. The wrong dates those users",
      "saw came from the read side, which never touched storage and is now fixed.",
      "",
      "For the rest, the reliable check is asking the person whether the date",
      "shown matches the one their provider gave them.",
    ].join("\n"),
  );
}

/**
 * Contractions: the one table where the error is visible.
 *
 * `session_date` was written as the UTC date at save time, so an evening
 * session in the Americas was filed under the following day. Because
 * `started_at` is kept alongside it, the local date can be recomputed and
 * compared — given a timezone to assume.
 */
async function auditContractions(): Promise<void> {
  heading(`Contraction sessions (assuming ${TZ})`);

  const { rows } = await pool.query<{
    total: string;
    mismatched: string;
    users_affected: string;
  }>(
    `SELECT count(*)::text AS total,
            count(*) FILTER (
              WHERE session_date
                 <> ((started_at AT TIME ZONE 'UTC') AT TIME ZONE $1)::date::text
            )::text AS mismatched,
            count(DISTINCT user_id) FILTER (
              WHERE session_date
                 <> ((started_at AT TIME ZONE 'UTC') AT TIME ZONE $1)::date::text
            )::text AS users_affected
       FROM contraction_logs`,
    [TZ],
  );

  const { total, mismatched, users_affected } = rows[0];
  console.log(`contractions logged      ${total}`);
  console.log(`  filed under wrong day  ${mismatched}`);
  console.log(`  people affected        ${users_affected}`);

  if (Number(mismatched) === 0) {
    console.log("\nEvery session is filed under the day it actually happened.");
    return;
  }

  const examples = await pool.query<{
    user_id: string;
    session_date: string;
    local_date: string;
    started_at: Date;
  }>(
    `SELECT user_id,
            session_date,
            ((started_at AT TIME ZONE 'UTC') AT TIME ZONE $1)::date::text AS local_date,
            started_at
       FROM contraction_logs
      WHERE session_date
         <> ((started_at AT TIME ZONE 'UTC') AT TIME ZONE $1)::date::text
      ORDER BY started_at DESC
      LIMIT $2`,
    [TZ, LIMIT],
  );

  console.log("");
  for (const r of examples.rows) {
    const localTime = r.started_at.toLocaleString("en-US", { timeZone: TZ });
    console.log(
      `  ${r.user_id}  filed ${r.session_date}  actually ${r.local_date}  (${localTime} ${TZ})`,
    );
  }

  console.log(
    [
      "",
      "These are evening sessions: the save happened after midnight UTC, so the",
      "old code filed them under the next day. The contractions themselves are",
      "intact — only the day they are grouped under is wrong, which also means",
      "they did not show up in that evening's list at the time.",
      "",
      "Correcting them is a single UPDATE per row setting session_date to the",
      "local date. This script does not write; the count above is what decides",
      "whether it is worth doing.",
    ].join("\n"),
  );
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error(
      "DATABASE_URL is not set. Point it at the database you want to audit:\n" +
        '  $env:DATABASE_URL="postgres://..."   (PowerShell)',
    );
    process.exitCode = 1;
    return;
  }

  if (!Number.isFinite(LIMIT) || LIMIT < 1) {
    console.error(`--limit must be a positive number (got "${LIMIT}")`);
    process.exitCode = 1;
    return;
  }

  console.log("Read-only audit. No rows are modified.");

  try {
    await auditProfiles();
    await auditContractions();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/time zone/i.test(message)) {
      console.error(
        `\nPostgres does not recognise the timezone "${TZ}".\n` +
          "Use an IANA name such as America/New_York or Europe/London.",
      );
    } else {
      console.error(`\nAudit failed: ${message}`);
    }
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

await main();
