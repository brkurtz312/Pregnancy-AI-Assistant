# Manual Test: Apple Sign-In Cancellation — No Error Shown

## Purpose

Confirm that dismissing the Apple Sign-In sheet returns the user silently to the
sign-in/sign-up screen with **no error toast or message**, while a genuine auth
failure still surfaces a user-facing error.

This verifies the `isCancelError` helper's `ERR_CANCELED` branch in the
`onApplePress` handlers in:

- `app/(auth)/sign-in.tsx`
- `app/(auth)/sign-up.tsx`

---

## Prerequisites

- Physical iOS device running iOS 16 or later (Apple Sign-In requires a real
  device; the simulator does not present the native sheet)
- App installed via TestFlight or a local development build (`eas build
--profile development`)
- iCloud account configured on the device (required for Apple Sign-In to work)

---

## Test cases

### TC-1 — Dismiss Apple sheet from Sign-In (no error expected)

1. Open the app and navigate to **Sign In** (`/(auth)/sign-in`).
2. Tap **Continue with Apple**.
3. When the native Apple Sign-In sheet appears, tap **Cancel** (top-left corner)
   or swipe the sheet down to dismiss it.
4. **Expected:** The sheet closes and you are returned to the Sign-In screen.
   No error message or toast appears anywhere on screen.
5. **Pass/Fail:** \_\_\_

### TC-2 — Dismiss Apple sheet from Sign-Up (no error expected)

1. Navigate to **Create Account** (`/(auth)/sign-up`).
2. Tap **Continue with Apple**.
3. Dismiss the Apple Sign-In sheet by tapping **Cancel** or swiping it down.
4. **Expected:** Returned to the Sign-Up screen silently — no error message.
5. **Pass/Fail:** \_\_\_

### TC-3 — Genuine auth failure shows an error (error expected)

> This case is harder to trigger on a real device but can be simulated by
> temporarily revoking the app's Apple Sign-In permission in
> **Settings → [Your Name] → Password & Security → Apps Using Apple ID →
> [App Name] → Stop Using Apple ID**, then attempting sign-in.

1. Revoke the app's Apple ID permission as described above.
2. Return to the app and tap **Continue with Apple** on Sign-In or Sign-Up.
3. Attempt to complete the sign-in flow.
4. **Expected:** An error message is shown, e.g. _"Apple sign-in failed. Please
   try again."_
5. **Pass/Fail:** \_\_\_

---

## Result record

| Date | Device | iOS version | Build | TC-1 | TC-2 | TC-3 | Tester |
| ---- | ------ | ----------- | ----- | ---- | ---- | ---- | ------ |
|      |        |             |       |      |      |      |        |

---

## Automated regression coverage

The component-level tests in
`__tests__/appleSignInCancel.test.tsx` cover the same logical branches
(ERR_CANCELED → silent, real error → message shown) in a unit-test harness so
future regressions are caught in CI without requiring a physical device.
