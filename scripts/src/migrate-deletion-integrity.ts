import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pool } from "@workspace/db";

const execFileAsync = promisify(execFile);

async function ensureDeletionTombstones(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS account_deletion_requests (
      user_id text PRIMARY KEY,
      status text NOT NULL DEFAULT 'pending',
      attempt_count integer NOT NULL DEFAULT 0,
      next_attempt_at timestamptz NOT NULL DEFAULT now(),
      last_attempt_at timestamptz,
      last_error text,
      clerk_deleted_at timestamptz,
      completed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT account_deletion_requests_status_check
        CHECK (status IN ('pending', 'completed'))
    );
    CREATE INDEX IF NOT EXISTS account_deletion_requests_retry_idx
      ON account_deletion_requests (status, next_attempt_at);
  `);
}

async function backfillUserParents(): Promise<void> {
  await pool.query(`
    WITH user_ids AS (
      SELECT user_id AS id FROM birth_plan_answers
      UNION SELECT user_id FROM contraction_logs
      UNION SELECT user_id FROM hospital_bag_state
      UNION SELECT user_id FROM journal_entries
      UNION SELECT user_id FROM kick_sessions
      UNION SELECT user_id FROM prenatal_visits
      UNION SELECT user_id FROM scribe_idempotency_keys
      UNION SELECT user_id FROM support_contacts
      UNION SELECT user_id FROM symptom_logs
      UNION SELECT user_id FROM user_profiles
      UNION
      SELECT regexp_replace(identifier, '^(user|scribe):', '')
      FROM ai_usage
      WHERE identifier ~ '^(user|scribe):'
    )
    INSERT INTO users (id)
    SELECT DISTINCT user_ids.id
    FROM user_ids
    WHERE user_ids.id <> ''
      AND NOT EXISTS (
        SELECT 1
        FROM account_deletion_requests
        WHERE account_deletion_requests.user_id = user_ids.id
      )
    ON CONFLICT (id) DO NOTHING;
  `);
}

async function associateLegacyAiUsage(): Promise<void> {
  await pool.query(`
    UPDATE ai_usage
    SET user_id = regexp_replace(identifier, '^(user|scribe):', '')
    WHERE user_id IS NULL
      AND identifier ~ '^(user|scribe):'
      AND NOT EXISTS (
        SELECT 1
        FROM account_deletion_requests
        WHERE account_deletion_requests.user_id =
          regexp_replace(ai_usage.identifier, '^(user|scribe):', '')
      );
  `);
}

async function main(): Promise<void> {
  // This is intentionally safe to run before Drizzle sees the new FKs. It
  // prevents legacy tool/profile rows from blocking production schema updates.
  await ensureDeletionTombstones();
  await backfillUserParents();

  const { stdout, stderr } = await execFileAsync(
    "pnpm",
    ["--filter", "@workspace/db", "run", "push"],
    { cwd: process.cwd() },
  );
  process.stdout.write(stdout);
  process.stderr.write(stderr);

  // user_id is introduced by the schema push; associate legacy account-keyed
  // metering rows only after the column and FK exist.
  await associateLegacyAiUsage();
  console.log("Account-deletion integrity migration completed.");
}

main()
  .catch((error: unknown) => {
    console.error("Account-deletion integrity migration failed.", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
