---
name: Clerk instance-wide MFA blocks App Review sign-in
description: Clerk "Require multi-factor authentication" is an instance-wide policy, not a per-user opt-in — it forces an email_code second factor on every password sign-in even for accounts with two_factor_enabled=false, and this is a recurring root cause of App Store Guideline 2.1 "unable to sign in with demo account" rejections.
---

## What happened

Apple rejected the Pregnancy AI Assistant app under Guideline 2.1, saying the supplied
demo account credentials (`appreview@...`) failed to sign in. The Clerk user record
looked completely healthy: `password_enabled: true`, `two_factor_enabled: false`,
`totp_enabled: false`, not banned, not locked, email verified.

Simulating the exact sign-in the app performs (Clerk Frontend API, `strategy: "password"`)
against the Development instance revealed the real cause: the sign-in attempt correctly
verified the password but came back with `status: "needs_second_factor"` and
`supported_second_factors: [{ strategy: "email_code" }]` — even though the user has no
personal MFA enrolled. This is Clerk's instance-wide "Require multi-factor authentication"
setting (Configure → User & authentication → Multi-factor in the Clerk dashboard), which
applies to every user regardless of individual enrollment.

**Why this breaks App Review specifically:** the app already has a UI fallback that shows
a code-entry screen when sign-in needs a second factor, but Apple's reviewer has no way to
read the email that Clerk sends the code to. A demo account can never complete a
password-only sign-in on an app with this setting enabled — no code fix in the app can work
around it. The fix has to happen in the Clerk dashboard (turn the requirement off, or off in
Production specifically), not in app code.

## How to apply

When a demo/reviewer account "fails to sign in" and the user object itself looks fine,
reproduce the actual sign-in via Clerk's Frontend API (decode the frontend-api host from
the publishable key: `base64decode(pk_..._<b64>)` minus the trailing `$`) rather than just
inspecting the Backend API user object — the user object won't show instance-wide policies
like this one. A `needs_second_factor` result with `email_code` as the only second factor,
on a user with no MFA enrolled, means the instance-wide requirement is on.

Development and Production are separate Clerk instances with separate user stores (and
separate `reviewer_demo_user_id` app_config rows / separate DB rows in this project). The
workspace's `CLERK_SECRET_KEY` only reaches the Development instance — verifying/fixing this
for the actual App Store build requires the user to check the Production instance in the
Clerk dashboard themselves (environment switcher, or the `clerkDashboard/prod/multiFactor`
pane marker).
