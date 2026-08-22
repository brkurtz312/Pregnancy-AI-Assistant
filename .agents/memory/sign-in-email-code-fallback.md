---
name: Sign-in email-code fallback
description: Durable sign-in behavior for Clerk accounts that require an email verification step after password submission.
---

When Clerk accepts the password but leaves the sign-in incomplete, keep the user in the auth flow: send the email code, verify it, finalize the session, and replace the auth route with the app root. Validate missing credentials before starting sign-in.

**Why:** A real TestFlight account could authenticate successfully but still appear stuck on the sign-in screen when the incomplete Clerk state had no completion UI.

**How to apply:** Preserve this fallback when changing mobile Clerk sign-in navigation or error handling; direct password, Google, and Apple success paths should still activate the session and replace the auth route immediately.