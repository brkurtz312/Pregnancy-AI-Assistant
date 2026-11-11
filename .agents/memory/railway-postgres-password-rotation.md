---
name: Rotating the Railway Postgres password
description: No button; ALTER USER + POSTGRES_PASSWORD + redeploy. The Data tab's SELECT 1 does not prove the app can log in, and a mismatch stays hidden until the next fresh deploy. 20-min DB outage on 2026-11-11.
---

Rule: after changing the Postgres password, prove the **app** can log in with a
request to the live site that touches the database, and do it **after a fresh
deploy has started**, not before.

**Why:** on 2026-11-11 the password was rotated (variable set, `ALTER USER`
believed run) and everything looked fine for over an hour:

- Railway's **Database → Data** tab ran `SELECT 1` successfully. That was taken
  as proof the database accepted the new password. It was not: the Data tab
  connects its own way, not with the app's `DATABASE_URL`.
- The running deployments kept working because their connections were opened
  **before** the change. Postgres checks the password only when a connection
  opens, so existing pooled connections hid the mismatch.
- The first deployment to start fresh (17:00 CST, an unrelated docs merge) was
  refused by the database. `/api/healthz` does not touch the database, so
  Railway marked it green and switched traffic to it. Every database request
  failed for about 20 minutes, until `ALTER USER postgres WITH PASSWORD '…'`
  was run again with the value from `DATABASE_URL`. The app recovered by itself
  within seconds, with no redeploy.

**How to apply:**
- Rotation, in order: run `ALTER USER postgres WITH PASSWORD '…'` in
  Postgres → Database → Data; set `POSTGRES_PASSWORD` to the same value (the
  variable alone changes nothing); redeploy the app. Use letters and digits
  only. First confirm a build can succeed (see
  [[railway-config-as-code-deprecated]]).
- Then verify against the live site. An invalid event,
  `POST /api/events` with `{"event":"not_a_real_event"}`, answers **400** when
  the database works and **500** when it does not, because its rate limiter
  writes to Postgres first. It stores nothing.
- The quickest recovery from a mismatch is to make the database match the app,
  not the other way round. Reveal Postgres's `DATABASE_URL`, take the part
  between `postgres:` and `@`, and run `ALTER USER` with it. No build or deploy
  is involved.
- Deploy logs show only drizzle's `Failed query: …` wrapper, not Postgres's
  reason. Don't spend an outage looking for the reason there.
