# Ops Runbook

## App Review Access Preflight

App Review needs a genuine **Production Clerk** email/password account. The
reviewer access code is not a password: it unlocks the Full Pregnancy Pass only
after that account has signed in.

Before every App Store resubmission:

1. In Replit’s Auth settings, choose the **Production** environment and verify
   the Apple provider is configured with the Apple Developer Services ID and
   private key. This requires access to the managed Clerk configuration.
2. Install the exact TestFlight candidate on a clean iPhone or iPad.
3. Create or reset a dedicated Production reviewer account, complete any
   required email verification, then record its Clerk user ID as
   `reviewer_demo_user_id` in `app_config` (or `REVIEWER_DEMO_USER_ID` in the
   production API environment).
4. Sign in with the reviewer account’s email and password, then redeem the
   reviewer access code from **Profile → Redeem access code** and
   confirm the Full Pregnancy Pass is active.
5. Sign out, reinstall, and repeat the email/password sign-in. Confirm the
   pass remains active without another purchase.
6. Sign out, then verify **Sign in with Apple** is visible and completes the
   native Apple sheet. Test “Hide My Email” if available.
7. Put only the tested Production email/password in App Store Connect. Put the
   post-sign-in redemption step and access code in the reviewer notes, never in
   the password field.

## Scheduled reviewer-account pass repair

### What it does

On every production deploy the API server starts a background scheduler that
checks the configured reviewer account’s local pass record:

1. It resolves the account ID from `app_config.reviewer_demo_user_id`, falling
   back to `REVIEWER_DEMO_USER_ID`.
2. It verifies that user’s `hasPass` flag in the production database.
3. If the row is absent or the pass was revoked, it restores `hasPass=true`.

This job does **not** verify the reviewer’s Clerk password, the Apple provider,
the reviewer access code, or Clerk API connectivity. Those are separate
preflight checks.

The first run fires **30 seconds after boot**. Subsequent runs fire every
**60 minutes** (overridable via `REVIEWER_CHECK_INTERVAL_MS` env var).

### Where to look in production logs

Use the Replit deployment log viewer (or the `fetch_deployment_logs` agent
tool) and filter for these strings:

| Event                         | Log message                                            | Severity |
| ----------------------------- | ------------------------------------------------------ | -------- |
| Scheduler started at boot     | `Reviewer pass health check scheduler started`         | info     |
| Check passed (system healthy) | `Reviewer pass check passed`                           | info     |
| Check failed (non-fatal)      | `Scheduled reviewer pass check failed`                 | warn     |
| Check crashed                 | `Scheduled reviewer pass check crashed`                | error    |
| Demo user ID missing          | `Demo user ID not configured`                          | error    |
| Demo user row restored        | `Demo user row was missing; created with hasPass=true` | warn     |
| Revoked pass restored         | `Demo user hasPass was false; healed to true`          | warn     |

**Confirmed healthy in production** (verified 2026-07-12): the startup log and
the 30-second initial "Reviewer pass check passed" entry both appear consistently
across all recent deploys with `intervalMs=3600000`.

### How to verify after a deploy

1. Open the Replit deployment log viewer for the **API Server** service.
2. Search for `Reviewer pass health check scheduler started` — it must appear
   within the first few seconds of the deploy timestamp.
3. Search for `Reviewer pass check passed` — it must appear roughly 30 seconds
   after the startup entry.
4. If either entry is missing, check for the error/warn log messages in the
   table above.

### Disabling the scheduler

Set `REVIEWER_CHECK_INTERVAL_MS=0` in the server's environment to suppress
the background scheduler (useful for unit-test environments). The scheduler
does **not** run when this var is `0`.

### Querying the last check result without digging through logs

Use the admin status endpoint to inspect the most recent scheduled-check outcome
directly, without a log search:

```
GET /api/admin/reviewer-check/status
Authorization: Bearer <ADMIN_CHECK_TOKEN>
```

**Response (200)**

```json
{
  "lastRunAt": "2026-07-12T14:00:03.210Z", // ISO-8601, or null if not yet run
  "lastResult": "ok", // "ok" | "fail" | null
  "lastReason": null // reason code when lastResult is "fail"
}
```

Possible `lastReason` values: `no_demo_user_id`, `user_missing`, `pass_revoked`.

**Auth notes**

- Requires `Authorization: Bearer <token>` where the token matches the
  `ADMIN_CHECK_TOKEN` env var on the server.
- Returns **401** for a missing or wrong token, **503** if no token is configured
  on the server.

**Example (curl)**

```sh
curl -s \
  -H "Authorization: Bearer $ADMIN_CHECK_TOKEN" \
  https://<your-domain>/api/admin/reviewer-check/status | jq .
```

The service persists the most recent status in `app_config`, so it survives a
server restart when the database is available. Before the scheduler has ever
run, or when that storage is unavailable, the fields can be `null`.

## Code-redemption configuration check

The `Reviewer Pass Health Check` workflow runs the separate command below. It
checks that a pass-unlock code is configured, `CLERK_SECRET_KEY` is present,
and the Clerk API accepts that key:

```sh
pnpm --filter @workspace/scripts run check-reviewer-pass
```

This command does **not** verify the reviewer demo user’s `hasPass` row or
authenticate the App Store account email/password. Run the clean-device
TestFlight preflight above to test those credentials and the native Apple flow.

### Source files

- `artifacts/api-server/src/index.ts` — scheduler wiring and startup log
- `artifacts/api-server/src/lib/reviewer-check.ts` — check logic and per-run logs
- `artifacts/api-server/src/routes/admin.ts` — `GET /api/admin/reviewer-check/status` and auth middleware
