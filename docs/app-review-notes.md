# App Review Notes

Paste the "Notes" section below into App Store Connect → App Review Information,
and **fill in the demo-account username and password fields** with the
credentials in "Reviewer credentials".

**Re-read the notes against the build you are submitting.** The paragraph about
Watch sync claimed the feature was broken for four builds while it was; it was
still claiming that after 1.0.19 fixed it. A note that understates the app is
not a safe default — it invites a reviewer to treat a working feature as a
defect.

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

The companion Watch app runs on its own: Contraction Timer, Kick Counter
and the weekly tip for the current pregnancy week. Install it from the
iPhone's Watch app if it is not already on the Watch.

Contractions recorded on the Watch appear in the iPhone's session
history. This did not work in earlier versions and is the main fix in
this build. To check it: record a short contraction session on the
Watch, then open the Tools tab on the iPhone. The line under the Watch
badge reports how many records arrived and how many were saved.

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
   - **Device Trust** must be OFF (Protect → Rules → the Device Trust row →
     Manage → toggle off Enable → Save). It demands extra verification from
     every new device, which is every reviewer, and the app has no screen for
     that step.
2. **The Full Pregnancy Pass shows as active** immediately after sign-in,
   without redeeming anything.
3. **Sign in with Apple** is visible and completes the native Apple sheet. It
   satisfies Guideline 4.8, and losing it while Google is present means
   rejection.
4. **Continue with Google** completes. It depends on the redirect allowlist in
   Clerk and the authorized redirect URI in Google Cloud; see the runbook.
5. Sign out, reinstall, sign in again. The pass survives without a purchase.
6. **The Watch app opens and runs**, and a contraction recorded on it reaches
   the iPhone log. Contraction Timer, Kick Counter and the weekly tip. This
   path was broken until 1.0.19 and the notes did not claim it worked; it does
   now, so check it. The line under the Watch badge on the Tools screen reports
   what arrived and what was saved.

---

## The Apple Watch sync defect — fixed 20 Sep 2026

Contraction sessions recorded on the Watch never appeared in the iPhone log.
Resolved in **1.0.19**, and confirmed on device: eleven held records were read
out of the phone's native store on launch and seven appeared in the session
history immediately, without recording anything new. The remaining four went
to the offline queue, which is the designed fallback when the API save fails.

### The cause

`const gen = ++drainGenRef.current` in `WatchBackgroundListener` was claimed at
the top of the effect, **above the guard that decides whether the run does any
work at all**.

That effect re-runs constantly — its dependencies include
`handleContractionUpdate`, whose identity changes with Clerk's `getToken` on
every render. Each do-nothing re-run bumped the generation token and
invalidated the one chain that was actually draining. That chain then
abandoned itself at its first generation check, which returned **before any
counter or log**, on every launch since the feature shipped.

The fix is to claim the token only after the guards, so that only a run which
proceeds can invalidate an earlier one — which is what the mechanism was for.

### Why it took four builds

Every symptom pointed somewhere else, and each wrong turn was reasonable on
the evidence available at the time:

| Believed                                                      | Why it was wrong                                                                                                                                                                         |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Records never reached the phone                               | The Watch reported them acknowledged, and an ack is only sent after `persistContractionReceipt` writes the record. They were on the phone the whole time.                                |
| The break is at or below the native layer                     | Same premise. Delivery worked.                                                                                                                                                           |
| The event listener was dead                                   | It was — `NativeModulesProxy` plus the deprecated `EventEmitter` on SDK 54 attaches React Native's bridge stub, which ignores the callback. Real, fixed in 1.0.16, and **not** this bug. |
| A `Void`-returning `AsyncFunction` left its promise unsettled | Plausible, and it explained `registered 0`. Disproved by 1.0.18: the register timeout never fired either, and a `setTimeout` cannot fail.                                                |

### The lesson worth keeping

Every single one of these failures was a **silent early return**. The
generation check. The `continue` for a record missing a field. `await
getToken()` outside its `try`. The `addListener` catch returning a dead
subscription. Four separate paths that did nothing and said nothing.

The bug was found the moment silence became impossible — when the phone
started counting what succeeded rather than only what failed, and when
`watchBridgeSummary` stopped returning `null` for "nothing happened". That
null was itself an instance of the same mistake, written into the instrument
built to catch it.

If Watch sync regresses, read the line under the Watch badge on the Tools
screen first. It names the stage reached and never says nothing.

---

## The fallback access code

The "Access Code" section on the Profile tab calls
`POST /api/billing/redeem-code`, which grants the pass to the signed-in account.
It is a safety net: the pass should already be active, and a reviewer who has to
use this has hit a problem worth knowing about.

The endpoint resolves the code from `app_config.reviewer_access_code` first,
then `REVIEWER_ACCESS_CODE`, then `DEV_ACCESS_CODE` — the same order
`check-reviewer-pass` uses, so the health check's verdict is about the code the
server would actually accept.

The live code is never written down here. This file is in git; the code is a
working credential. It goes in App Store Connect and in the production database,
nowhere else.

### Rotating it

**Writing the row is a cutover, not an addition.** Once
`app_config.reviewer_access_code` exists, it outranks `DEV_ACCESS_CODE` and the
old code stops working the moment the row lands. Don't rotate while a
submission is in review with the old code in its notes — the reviewer's fallback
would break under them mid-review.

Order that works:

1. Confirm production is running a build that reads the row. It was added on
   13 Sep 2026; a deployment older than that reads `DEV_ACCESS_CODE` only, and
   rotating against it writes a row nothing consults — the new code would be
   refused while `check-reviewer-pass` called the setup healthy.
2. Rotate against the **production** database. `scripts/rotate-reviewer-code`
   prints the host it wrote to; check it. The Replit workspace Shell's
   `DATABASE_URL` is the development database, so a run from there updates the
   wrong `app_config` and reports success either way.
3. Paste the printed code into the App Store Connect notes.
4. Run `check-reviewer-pass` to confirm, then redeem it once on a real device.

From the production database pane instead of the script, this generates the code
server-side and returns it once, so it never passes through a shell history or a
chat log:

```sql
INSERT INTO app_config (key, value)
VALUES ('reviewer_access_code', replace(gen_random_uuid()::text, '-', ''))
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
RETURNING value;
```

Don't also set `REVIEWER_ACCESS_CODE` or `DEV_ACCESS_CODE` to the new value. The
row wins, so a stale env var is a second answer to "what is the code" with
nothing to say which one the server picked.

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
