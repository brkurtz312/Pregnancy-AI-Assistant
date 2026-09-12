# App Review Notes

Paste the "Notes" section below into App Store Connect → App Review Information.
Leave the demo-account username and password fields **empty** — there is no
account to sign into. See "Why no demo account" for the reasoning.

---

## Notes (paste this)

```
Pregnancy AI Assistant helps expecting parents track their pregnancy, ask
health questions, log symptoms, time contractions and count kicks, with a
companion Apple Watch app.

TO ACCESS ALL FEATURES — no account or email required:

1. Launch the app and tap "Sign In" (top right of the Home tab).
2. At the bottom of the sign-in screen, tap "App Review access".
3. Enter this access code:  <REVIEW_ACCESS_CODE>
4. Tap "Open Demo".

This opens the app with the Full Pregnancy Pass active and every paid
feature unlocked. To set up a pregnancy, enter any due date or last
menstrual period date on the Home tab — the app calculates gestational
age and week-by-week content from it.

APPLE WATCH: the Watch app pairs automatically once the iPhone app is
open. Contraction Timer and Kick Counter sync live between the two.

IN-APP PURCHASE: the Full Pregnancy Pass is already granted in the demo
session, so no purchase is needed to review paid functionality.
```

Replace `<REVIEW_ACCESS_CODE>` with the value of the `demo_access_code` row in
`app_config` (or the `DEMO_ACCESS_CODE` env var).

---

## Why no demo account

The previous two submissions were rejected under Guideline 2.1 because Apple
could not sign in with the supplied credentials. The credentials were valid.

The Clerk instance has **"Require multi-factor authentication"** enabled
instance-wide. That policy forces an `email_code` second factor on _every_
password sign-in, including accounts with no MFA enrolled — so the sign-in
verifies the password and then returns `needs_second_factor`. The reviewer has
no way to read the mailbox the code is sent to, so no credential-based demo
account can ever complete sign-in.

Turning that policy off requires Clerk dashboard access, which is Pro-gated on
this Replit-managed instance. Demo mode removes the dependency entirely: it
never contacts Clerk.

Full detail: `.agents/memory/clerk-mfa-blocks-app-review.md`.

## Server configuration required before submitting

Both must be set on the **production** deployment:

| Setting               | Where                                          | Notes                                                                |
| --------------------- | ---------------------------------------------- | -------------------------------------------------------------------- |
| `DEMO_SESSION_SECRET` | env var                                        | 32+ chars, random. Demo mode is disabled entirely when unset.        |
| `demo_access_code`    | `app_config` table (or `DEMO_ACCESS_CODE` env) | The code that goes in the review notes. Rotatable without a rebuild. |

Verify before submitting:

```sh
curl -s https://<your-domain>/api/demo/available
# expect {"available":true}

curl -s -X POST https://<your-domain>/api/demo/session \
  -H 'Content-Type: application/json' \
  -d '{"code":"<REVIEW_ACCESS_CODE>"}'
# expect {"token":"v1....","expiresInSeconds":86400}
```

If `available` is false, `DEMO_SESSION_SECRET` is missing or shorter than 32
characters. The "App Review access" link is hidden from the sign-in screen
whenever that endpoint reports false, so this check also confirms the reviewer
will actually see the entry point.

## After approval

Unset `DEMO_SESSION_SECRET` on production. That single change disables token
minting, rejects every outstanding demo token, and hides the sign-in entry
point — no rebuild or resubmission needed.
