---
name: Railway build settings are in the UI, not railway.json
description: Railway deprecated Config as Code; a rebuild ignored railway.json, used Railpack and failed "No start command detected". Settings now live in the service UI.
---

Rule: the API service's build command, start command and `/api/healthz` health
check are set in Railway → service → Settings, and recorded in
`docs/railway-deploy.md`. There is no `railway.json` any more.

**Why:** on 2026-11-11 a variable change (rotating the Postgres password)
triggered a rebuild of a commit that had deployed fine 30 minutes earlier. It
came up with the Railpack builder and none of railway.json's commands, and
failed with "No start command detected". Railway's settings page says Config as
Code is deprecated: existing files stop working 2026-12-01, and services that
never set a config file path (ours had none) cannot opt in after 2026-08-28.

**How to apply:**
- A failed build never takes the site down — the health check keeps the old
  deployment serving — but it does block anything that needs a fresh deploy,
  such as a database password change. Check a build succeeds *before* rotating
  credentials the running app depends on.
- Rotating the Postgres password on Railway has no button: run
  `ALTER USER postgres WITH PASSWORD '…'` in Database → Data, set
  `POSTGRES_PASSWORD` to the same value (the variable alone changes nothing),
  then redeploy the app. Letters and digits only.
- Public database access (Settings → Networking → TCP Proxy) is off by default
  now; enable it only to run the push or `funnel-report` from a laptop, then
  remove it.
