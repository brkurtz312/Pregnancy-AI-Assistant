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

The companion Watch app runs on its own: Contraction Timer, Kick Counter
and the weekly tip for the current pregnancy week. Install it from the
iPhone's Watch app if it is not already on the Watch.

Sessions recorded on the Watch are not currently reflected in the iPhone
log. That is a known defect, present in the shipping version, and is
being worked on separately. Nothing in the review flow depends on it —
record on the iPhone to see entries appear in the log.

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
6. **The Watch app opens and runs.** Contraction Timer, Kick Counter and the
   weekly tip. Do not check for Watch sessions in the iPhone log — that path
   is broken (see "The Apple Watch sync defect") and the notes no longer
   claim it works.

---

## The Apple Watch sync defect

Contraction and kick sessions recorded on the Watch do not appear in the
iPhone log. The Watch keeps them in its own retry queue, so nothing is lost on
the Watch — they simply never arrive.

What has been established, on a clean 1.0.13 install with a freshly installed
Watch app:

- **Phone → Watch works.** Gestational age and weekly tips reach the Watch.
- ~~**Watch → phone receives nothing.**~~ Half of this was the event listener,
  fixed in 1.0.16 and confirmed on device 20 Sep 2026: the connectivity line
  now changes on its own as reachability comes and goes, where before it only
  refreshed when the app was re-entered. The app reached the module through
  `NativeModulesProxy` and wrapped it in the deprecated `EventEmitter`; on
  Expo SDK 54 the `addListener` that resolves is React Native's bridge stub,
  which ignores the callback. Function calls bridged fine throughout, which is
  why `setActiveWatchUser` succeeding was so misleading.
- **Contraction records still do not appear**, and the Watch's own Sync Status
  reports them acknowledged — which means they are durably stored on the
  phone under the right user, since the ack is only sent after that write.
- `setActiveWatchUser` succeeds, so the native bridge has an active user.
- The session reports `activated`.
- ~~A force-quit drains no pending receipts, so the native receipt store is
  empty — the records never reached the bridge at all.~~ **Wrong.** That was
  inferred before there was any instrumentation. The Watch now reports records
  acknowledged, and an ack is sent only when `persistContractionReceipt`
  returns `true` — after the write, and only with an `activeUserId` set. The
  records do reach the bridge and are stored.

**Found, 20 Sep 2026.** The drain never ran. Not once, in any session.

The device reported: `effect ran 1, registered 0, skipped 28`. The effect that
reads the native receipt store ran once and stopped at its first step —
`await setActiveWatchUser(userId)`, whose promise never settled. Every later
effect run hit the already-drained guard and returned, 28 times.

The native side was unaffected throughout: `setActiveUserId` is synchronous, so
the active user was set, records were persisted and acknowledged, and the Watch
was told everything had worked. Only the JavaScript `await` never returned, and
the drain chained behind it never ran.

The cause is the deprecated `NativeModulesProxy`. On Expo SDK 54 a
`Void`-returning `AsyncFunction` reached through it leaves its JS promise
unsettled. `getSessionState` returns a value and resolved fine, which is why
the connectivity badge worked while the drain did not — the same module, the
same bridge, different return types.

Fixed three ways in 1.0.18, because one was not enough to trust:

1. The module is reached with `requireNativeModule`, the supported route.
2. `setActiveWatchUser` and `acknowledgeContractionReceipt` return a value
   rather than `Void`.
3. The register step is raced against a one-second timeout, so a promise that
   does not settle can never block the drain again, whatever the reason.

**It is not a regression from the September 2026 Clerk migration.** Nothing in
that work touches WCSession, and the Watch holds records in its retry queue —
meaning it is attempting delivery and being told it failed. The defect is
present in 1.0.12, the approved and currently shipping version.

Diagnosing it needs instrumentation readable without a Mac. That instrumentation
now exists: **Sync Status**, on the Watch home screen.

Every `sendMessage` on the Watch took an error handler, and every one of them
discarded its error and fell back to `transferUserInfo`, which reports nothing
at all. A reply arriving without a matching ack UUID was dropped the same way —
the record stayed queued and nobody was told. `WatchDeliveryLog` keeps all of
it; `WatchDeliveryStatusView` reads it out.

### Reading it

Open the Watch app → **Sync Status**. The verdict line at the top is the answer:

| What it says               | What it means                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------------- |
| Records never acknowledged | The Watch is sending and the phone never confirms. The break is in delivery.                      |
| Records acknowledged       | Delivery works. If records still do not appear, the break is downstream of the ack, on the phone. |
| Nothing sent yet           | Record a contraction first; the counters only move for real sends.                                |

Below it: whether the phone is reachable, how many records are queued, the last
WCSession activation result, and the last send error with its domain and code —
`localizedDescription` alone is usually "The operation couldn't be completed",
which identifies nothing.

**"Replied, no ack" is the row to watch.** It means the phone answered but not
with a matching ack UUID, so the record stayed queued. It is indistinguishable
from success on the phone's side, which is exactly how this defect has stayed
invisible.

Counters are cleared on sign-out along with every other persisted Watch key, so
diagnose within one session.

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
