# Ops Runbook

## Reviewer Pass Health Check Scheduler

### What it does

On every production deploy the API server starts a background scheduler that
verifies the Apple reviewer sign-in system is fully operational:

1. A reviewer access code is configured (checked in `app_config` table, then
   env vars `REVIEWER_ACCESS_CODE` / `DEV_ACCESS_CODE`).
2. `CLERK_SECRET_KEY` is present.
3. The Clerk API is reachable and responds 2xx to an authenticated probe.

The first run fires **30 seconds after boot**. Subsequent runs fire every
**60 minutes** (overridable via `REVIEWER_CHECK_INTERVAL_MS` env var).

### Where to look in production logs

Use the Replit deployment log viewer (or the `fetch_deployment_logs` agent
tool) and filter for these strings:

| Event                         | Log message                                                  | Severity |
| ----------------------------- | ------------------------------------------------------------ | -------- |
| Scheduler started at boot     | `Reviewer pass health check scheduler started`               | info     |
| Check passed (system healthy) | `Reviewer pass check passed`                                 | info     |
| Check failed (non-fatal)      | `Scheduled reviewer pass check failed`                       | warn     |
| Check crashed                 | `Scheduled reviewer pass check crashed`                      | error    |
| Access code missing           | `Reviewer access code not configured`                        | error    |
| Clerk key missing             | `CLERK_SECRET_KEY missing`                                   | error    |
| Clerk unreachable             | `Clerk API returned non-OK status` / `Clerk API unreachable` | error    |

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

This endpoint reflects in-memory state — it resets to all-`null` on a server
restart. Use the log-search approach above if you need the historical record.

### Source files

- `artifacts/api-server/src/index.ts` — scheduler wiring and startup log
- `artifacts/api-server/src/lib/reviewer-check.ts` — check logic and per-run logs
- `artifacts/api-server/src/routes/admin.ts` — `GET /api/admin/reviewer-check/status` and auth middleware
