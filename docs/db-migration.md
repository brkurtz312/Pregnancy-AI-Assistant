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

Replit's production database is itself Neon — the host is
`…​.us-east-1.aws.neon.tech` — so this is Postgres to Postgres between two
managed providers, with no engine differences to account for. It is in
Replit's Neon account rather than yours, which is why the data has to be
copied rather than adopted.

**On Railway specifically:** databases are private by default. The
`DATABASE_URL` on the Postgres service points at `postgres.railway.internal`
and will not resolve from a laptop. Enable Settings → Networking → Public
Networking → TCP Proxy on port 5432, which creates `DATABASE_PUBLIC_URL`.
That is the one to use for every step here; `DATABASE_URL` is what the API
server will use later, from inside Railway.

Leave `DATABASE_PUBLIC_URL` as the template Railway generates
(`postgresql://${{PGUSER}}:${{PGPASSWORD}}@…`) rather than replacing it with a
literal. The template tracks a password rotation; a literal is a second copy
that silently goes stale.

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
pg_dump --data-only --no-owner --no-privileges --schema=public \
  --file=replit-data.sql "<source>"

psql "<target>" -f replit-data.sql
```

`--data-only` because step 2 already created the schema. `--schema=public`
keeps `stripe.*` out of it deliberately.

**Use `--file=`, not `>`.** PowerShell's redirection writes UTF-16 with a byte
order mark, so psql reads the first line as `ÿ_` and refuses the whole file.
The dump looks fine until you try to load it — `Select-String` reads it happily
because PowerShell recognises its own encoding. Letting `pg_dump` open the file
avoids the shell entirely. Same for `-f` over `<` on the way back in.

Two checks worth doing before loading, because a bad dump is cheap to spot and
expensive to discover halfway through a restore:

```powershell
(Get-Item replit-data.sql).Length          # a UTF-16 file is ~double the size
Get-Content replit-data.sql -TotalCount 3  # should be readable SQL comments
Select-String -Path replit-data.sql -Pattern '^COPY ' |
  Select-Object -ExpandProperty Line       # one line per table with data
```

A successful load prints one `COPY n` per table and a `setval` per sequence,
with no `ERROR` lines among them.

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

A pg deprecation warning about SSL modes may appear above the results. It is
about `sslmode` aliasing in a future pg release, not about this migration, and
does not affect the comparison.

The 19 September 2026 run, for reference — 73 rows across thirteen compared
tables, all matching:

```
  ✅ users              23 → 23
  ✅ user_profiles      12 → 12
  ✅ ai_usage           11 → 11
  ✅ support_contacts    6 → 6
  ✅ contraction_logs    5 → 5
  ✅ journal_entries     5 → 5
  ✅ app_config          4 → 4
  ✅ kick_sessions       3 → 3
  ✅ hospital_bag_state  2 → 2
  ✅ symptom_logs        2 → 2
  … three empty tables, two volatile
```

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
