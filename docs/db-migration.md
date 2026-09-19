# Moving the database off Replit

Phase 2 of `replit-exit-plan.md`. The database moves first and alone: hosting
depends on it, and doing them together means a failure has two possible causes.

Nothing here switches anything over. The cutover is a separate, later step —
this document ends with a verified copy and production still on Replit.

---

## What moves

Fifteen tables in `public`, all defined in `lib/db/src/schema`:

```
account_deletion_requests   journal_entries          support_contacts
ai_usage                    kick_sessions            symptom_logs
app_config                  prenatal_visits          user_profiles
birth_plan_answers          rate_limits              users
contraction_logs            scribe_idempotency_keys
hospital_bag_state
```

Two of them are operational state rather than user data — `rate_limits` is a
sliding window and `scribe_idempotency_keys` expires on its own — so their
contents are expected to differ between a dump and a comparison taken minutes
later. `compare-databases` reports them and does not fail on them.

**The `stripe.*` schema is not in that list and is not Drizzle's.** It belongs
to `stripe-replit-sync`, which creates it from `runMigrations` in
`artifacts/api-server/src/lib/stripe-init.ts`. See Phase 0 of the exit plan
before deciding what happens to it — it is a decision, not a copy.

---

## 1. Provision

Neon or Railway. Take a connection string for an empty database; nothing is
written to Replit at any point in this document.

## 2. Create the schema

Point Drizzle at the new database and let it build the tables from the schema
that is already the source of truth:

```bash
DATABASE_URL="<target>" pnpm --filter @workspace/db run push
```

Preferred over restoring a schema dump from Replit, which would faithfully
reproduce any drift that has accumulated there.

## 3. Copy the data

```bash
pg_dump --data-only --no-owner --no-privileges \
  --schema=public "<source>" > replit-data.sql

psql "<target>" < replit-data.sql
```

`--data-only` because step 2 already created the schema. `--schema=public`
keeps `stripe.*` out of it deliberately.

## 4. Verify before trusting it

```bash
SOURCE_DATABASE_URL="<replit>" TARGET_DATABASE_URL="<new>" \
  pnpm --filter @workspace/scripts run compare-databases
```

Reads only, from both. It prints each table's row count and compares a
content checksum over every row, so it catches the failure a row count cannot:
same number of rows, one value quietly different. Timestamps shifted by a time
zone, a truncated text column, a boolean that came back false — all show as
`counts match but CONTENTS DIFFER`.

The checksum does not depend on row or column order, so a restore that
reorders rows is not reported as a difference.

Exit code 0 means every compared table matches. Anything else means do not
proceed.

## 5. Re-run it immediately before the cutover

Whatever is written to Replit between step 3 and the switch is not in the copy.
With the app live, that window is real. Re-dump, re-restore, re-compare, and
switch promptly — or accept the gap knowingly, having seen exactly which tables
moved.

---

## What is deliberately not here

- **The cutover itself.** Changing `DATABASE_URL` on production belongs with
  the hosting move, and the app should be pointed at the new database once,
  not twice.
- **The Stripe webhook.** It is the one item that can silently break billing,
  and it is coupled to the API host rather than the database. Exit plan,
  Phase 2.
- **`migrate-deletion-integrity`.** The plan says to run it deliberately
  against the new database, with someone watching, after fixing the
  `created_at`/`requested_at` mismatch. Not part of the copy.
