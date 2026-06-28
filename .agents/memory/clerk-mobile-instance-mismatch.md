---
name: Clerk mobile production key mismatch
description: EAS production build was using the dev Clerk publishable key, causing all authenticated API calls to return 401 in the deployed app.
---

## The problem

EAS production environment had `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...` (the dev Clerk key).
The production API server uses `sk_live_...`. Tokens issued by the dev Clerk instance cannot be verified
by a server using the live Clerk secret key → every authenticated API call returns 401.

Additionally, the mobile app had no `EXPO_PUBLIC_CLERK_PROXY_URL` set, so even with the right key,
Clerk SDK calls went directly to `clerk.pregnancy-calc--brkurtz.replit.app` which may not be a
separately configured DNS entry.

## The fix

Updated EAS production environment variables:
- `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_Y2xlcmsucHJlZ25hbmN5LWNhbGMtLWJya3VydHoucmVwbGl0LmFwcCQ`
  (decodes to `clerk.pregnancy-calc--brkurtz.replit.app$`)
- `EXPO_PUBLIC_CLERK_PROXY_URL=https://pregnancy-calc--brkurtz.replit.app/api/__clerk`

## How to derive the live publishable key

Clerk publishable key format: `pk_<env>_<base64(fapi_url + "$")>`

For the Replit production domain `pregnancy-calc--brkurtz.replit.app`, the live FAPI URL is:
`clerk.pregnancy-calc--brkurtz.replit.app`

So: `pk_live_` + `Buffer.from("clerk.pregnancy-calc--brkurtz.replit.app$").toString("base64url")`

**Why:** The dev key was set when the EAS env was first configured and never updated to the live key.
The EAS build warning "No environment variables found for production" was misleading — env vars
existed but were dev keys. The `pk_test` vs `pk_live` prefix distinction is the signal.

## Symptoms of this mismatch

- All authenticated API calls return 401 even when the user appears signed in
- `requireAuth` logs `hasAuthHeader=true` but `getAuth(req).userId` is null
- Reviewer sign-in fails because reviewer demo user only exists in the live Clerk instance
- User can "sign in" successfully in the app UI (Clerk SDK accepts it) but API calls fail

## Ticket strategy > password strategy for server-controlled accounts

After fixing the Clerk key mismatch, the password strategy still failed with
"Cannot finalize sign-in without a created session." Root cause: Clerk's
**client-trust check** fires when a password was recently changed server-side
(PATCH /v1/users/:id), setting signIn.status to needs_client_trust instead
of complete. finalize() throws if status != complete.

**Fix:** Use Clerk's sign-in token (ticket) strategy instead:
1. Server: POST /v1/sign_in_tokens with { user_id } → get { token }
2. Mobile: signIn.create({ strategy: 'ticket', ticket: token })
3. Check signIn.status === 'complete', then call signIn.finalize()

Ticket strategy bypasses password auth and client-trust entirely. Always use
this for server-managed accounts where you control the Clerk credentials.
