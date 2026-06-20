---
name: AI rate limiting & free-quota on autoscale
description: Why AI/cost-control rate limits and free-quota gating must use shared state, not per-process counters.
---

# Cost-control limits must be cross-instance and reserve-before-call

The public API deploys as Replit **autoscale** (multiple Node processes behind a
load balancer). Two classes of bug follow from that and both let a public user
exceed intended AI usage / drive extra paid Anthropic spend:

**1. In-memory rate limits are per-instance, i.e. bypassable.**
`express-rate-limit`'s default store keeps counters in the current process only.
On autoscale each warm instance grants the same client its own full budget, so
the effective limit is `limit × instances`.
**Why:** discovered as a Medium vuln on the AI endpoints.
**How to apply:** any rate limiter that exists for cost/abuse control (not just
UX smoothing) must use a **shared** store. We back ours with a Postgres
`rate_limits` table via a custom `Store` (fixed-window upsert). Give each limiter
a distinct key prefix so different limiters don't share a counter. A Redis store
would work too, but we already have Postgres and no Redis.

**2. Check-then-increment quota gating has a TOCTOU race.**
Reading usage, comparing to the limit, making the paid call, then incrementing
lets N parallel requests all observe the same pre-increment count and slip past
the cap — each making its own paid call.
**Why:** the free weekly AI question limit could be exceeded by firing requests
in parallel.
**How to apply:** **reserve atomically before** the expensive call with a single
conditional statement (`INSERT ... ON CONFLICT DO UPDATE SET count = count + 1
WHERE count < limit RETURNING`); no returned row = denied. **Refund** (decrement,
floored at 0) if the paid call fails so an upstream outage doesn't burn quota.
Don't rely on the burst limiter to prevent this — it still allows enough
parallelism to blow the weekly cap several times over.

Client IP for keying comes from leftmost `X-Forwarded-For` (Replit edge
overwrites it); see the XFF memory entry.
