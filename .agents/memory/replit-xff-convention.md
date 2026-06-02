---
name: Replit X-Forwarded-For client IP convention
description: How to derive the real client IP behind the Replit proxy, and why leftmost XFF is correct here.
---

# Replit proxy X-Forwarded-For convention

Behind the Replit edge/shared proxy, the **leftmost** entry of `X-Forwarded-For`
is the real client IP. Replit's own shipped template code relies on this — the
Clerk proxy middleware extracts `xff.split(",")[0]` as the client IP it forwards
to Clerk. Use the same `(xff?.split(",")[0]?.trim())` pattern for rate-limit /
metering keys.

**Why:** the Replit edge sets/sanitizes the leftmost XFF entry to the connecting
client IP. A code reviewer may flag "leftmost XFF is spoofable" as a generic
concern — that premise (upstream *appends* client-supplied XFF) does NOT hold on
Replit. Do NOT rewrite to rightmost or a hop-count `trust proxy`: behind internal
Replit hops the rightmost is an internal IP, which would collapse all users onto
one key and break legitimate per-IP limiting.

**How to apply:** trust leftmost XFF for client identity in this environment.
Note that testing by cur/curl-ing `localhost:80` from *inside* the container
bypasses the edge, so a spoofed XFF there is honored — that is NOT representative
of external traffic and is not a real bypass.

Anonymous per-IP metering is inherently a soft limit; the unspoofable enforcement
is per-user (signed-in via verified Clerk session) and the paid pass.
