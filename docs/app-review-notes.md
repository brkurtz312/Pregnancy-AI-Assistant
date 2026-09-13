# App Review Notes

Paste the "Notes" section below into App Store Connect → App Review Information,
and **fill in the demo-account username and password fields** with the
credentials in "Reviewer credentials".

This replaces the account-free demo-session flow used for the September 2026
submission. The app now has its own Clerk production instance, so a reviewer
can sign in the same way a real user does — which is what Apple prefers, and
what the two rejections before that approval were asking for.

---

## Notes (paste this)

```
Pregnancy AI Assistant helps expecting parents track their pregnancy, ask
health questions, log symptoms, time contractions and count kicks, with a
companion Apple Watch app.

SIGNING IN

Use the demo account credentials supplied in the fields above. Tap
"Sign In" (top right of the Home tab), enter the email and password, and
tap Sign In. No verification code or second factor is required.

The Full Pregnancy Pass is already active on this account, so every paid
feature is unlocked immediately — no purchase is needed to review paid
functionality.

SETTING UP A PREGNANCY

On the Home tab, enter any due date or last menstrual period date. The app
calculates gestational age and week-by-week content from it.

APPLE WATCH

The Watch app pairs automatically once the iPhone app is open. Contraction
Timer and Kick Counter sync live between the two.

IF THE PASS DOES NOT APPEAR

Go to the Profile tab, find the "Access Code" section, enter this code and
tap Redeem:  <REVIEW_ACCESS_CODE>
```

Replace `<REVIEW_ACCESS_CODE>` before pasting — see "The fallback access code"
for which value is the right one, because more than one thing is called the
reviewer code and only one of them works.

---

## Reviewer credentials

| Field    | Value                                                       |
| -------- | ----------------------------------------------------------- |
| Email    | `appreview@pregnancy-assistant.com`                         |
| Password | set in the Clerk dashboard — Production → Users → appreview |

The account lives in our own Clerk **production** instance
(`ins_3JFZzAp82jo7IrbO7T7IvJkYDJj`, Frontend API
`clerk.pregnancy-assistant.com`). Its pass is kept active by the reviewer
health check, which reads `app_config.reviewer_demo_user_id` — currently
`user_3JFjsV2goLIiceAVX1oRfHsQRLU`.

**That id is instance-specific.** If the Clerk instance ever changes again, the
reviewer account gets a new id and this row keeps pointing at the old one, so
the health check maintains a pass on an account nobody can sign into. See
`docs/ops-runbook.md` for how to re-read it.

---

## Preflight, before every submission

Sign in on a clean device with the exact TestFlight candidate and confirm each
of these. Every one has broken reviewer sign-in at least once.

1. **Password sign-in completes without a second factor.** Two settings on the
   Clerk production instance can break this and neither is visible from the app:
   - **Require multi-factor authentication** must be OFF. It is instance-wide
     and forces an `email_code` second factor on every password sign-in, even
     for accounts with no MFA enrolled. A reviewer cannot read that mailbox.
   - **Device Trust** must be OFF (Configure → User & authentication →
     Password). It demands extra verification from every new device, which is
     every reviewer, and the app has no screen for that step.
2. **The Full Pregnancy Pass shows as active** immediately after sign-in,
   without redeeming anything.
3. **Sign in with Apple** is visible and completes the native Apple sheet. It
   satisfies Guideline 4.8, and losing it while Google is present means
   rejection.
4. **Continue with Google** completes. It depends on the redirect allowlist in
   Clerk and the authorized redirect URI in Google Cloud; see the runbook.
5. Sign out, reinstall, sign in again. The pass survives without a purchase.

---

## The fallback access code

The "Access Code" section on the Profile tab calls
`POST /api/billing/redeem-code`, which grants the pass to the signed-in account.
It is a safety net: the pass should already be active, and a reviewer who has to
use this has hit a problem worth knowing about.

**The endpoint reads `process.env.DEV_ACCESS_CODE` and nothing else**
(`billing/index.ts:267`). Put that value in the notes.

⚠️ Do not use `scripts/rotate-reviewer-code` to change it. That script writes
`app_config.reviewer_access_code` and prints "effective immediately", but no
code path reads that row — the endpoint only ever consults the environment
variable. Rotating with it would leave the reviewer holding a code the server
rejects. Change `DEV_ACCESS_CODE` in the production app secrets instead.

---

## History — why the earlier submissions failed

Two submissions were rejected under Guideline 2.1 because Apple could not sign
in with the supplied credentials. The credentials were valid; the Clerk instance
had **Require multi-factor authentication** enabled instance-wide, so every
password sign-in returned `needs_second_factor` and the code went to a mailbox
the reviewer could not read.

That was resolved before the 11 September 2026 approval, and the submission that
followed used a demo-session flow that never contacted Clerk at all — a reviewer
entered an access code and got a token, with no account involved.

The demo flow is no longer needed. The app runs on a Clerk instance we control,
where MFA is off and stays off, so ordinary credentials work. Keeping a
second, parallel authentication path alive purely for App Review is a standing
risk it no longer earns.

Background: `.agents/memory/clerk-mfa-blocks-app-review.md`.

---

## Retiring demo mode

Once a submission has been approved using the credentials above, unset
`DEMO_SESSION_SECRET` on the production deployment. That single change disables
token minting, rejects every outstanding demo token, and hides the "App Review
access" link from the sign-in screen. No rebuild or resubmission is needed.

Leave it set until then: if a reviewer hits a sign-in problem mid-review, demo
mode is the only way to hand them a working session without a new build.
