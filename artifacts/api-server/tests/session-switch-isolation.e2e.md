# E2E test: My Info profile data never bleeds to the wrong user after an account switch

Verifies that when user A signs out and user B signs in on the same device/browser,
user B never sees user A's `providerName` or any other profile data — not even as a
brief flash — because `SessionWatcher` calls `queryClient.clear()` on sign-out and
`queryClient.invalidateQueries()` on the subsequent sign-in.

## Why

The React Query cache holds the signed-in user's profile (provider name, hospital name,
phone numbers, address). Without the clear→invalidate sequence in `SessionWatcher`, the
stale cache would momentarily serve user A's data to user B during the time between
sign-in and the first successful profile fetch. This test guards against that regression.

## How to run

Use the `testing` skill: call
`runTest({ testPlan, relevantTechnicalDocumentation, testClerkAuth: true })`.

## Shared technical context (pass as `relevantTechnicalDocumentation`)

- Web app lives at path `/`; the calculator/app page is at `/app`.
- Sign-in page is at `/sign-in`.
- "My Info" nav tab (Heart icon) only renders when `isSignedIn` is true. It appears as
  a button with text "My Info" inside the navigation pill row.
- Profile endpoint: `PUT /api/profile` — accepts `{ providerName, providerPhone,
hospitalName, hospitalPhone, hospitalAddress }` (all optional strings or null).
  Requires the current Clerk session cookie; returns the saved profile.
- `GET /api/profile` — returns the current user's profile fields (same shape as PUT).
- My Info page input IDs: `#providerName`, `#providerPhone`, `#hospitalName`,
  `#hospitalPhone`, `#hospitalAddress`.
- Sign out: click the Clerk UserButton avatar (`.cl-userButtonTrigger`), then click
  "Sign out" in the popup menu. Wait for Clerk to redirect away from `/app`.
- Account bar testids (on `/app`):
  - Signed-in, no pass → `badge-free-remaining` + `button-unlock-pass` visible.
  - `button-sign-in` is NOT visible when signed in.
- `SessionWatcher` in `App.tsx` calls `queryClient.clear()` on sign-out and
  `queryClient.invalidateQueries()` on sign-in. These two calls together ensure that:
  1. Stale data from user A is purged from cache immediately on sign-out.
  2. All queries re-fetch fresh data scoped to user B on sign-in.

## Plan — user A's profile data is never shown to user B after an account switch

1. `[New Context]` Create a fresh browser context.
2. `[Clerk Auth]` Sign in as user A with a unique email like
   `switch_user_a_${nanoid(6)}@example.com`. Note the email (say `${user_a_email}`).
3. `[API]` While authenticated as user A, PUT `/api/profile` with a uniquely generated
   `providerName` (say `Dr_SwitchTest_${nanoid(6)}`). Note the value (say
   `${user_a_provider}`). Expect HTTP 200.
4. `[Browser]` Navigate to `/app`.
5. `[Browser]` Click the "My Info" navigation tab in the pill row.
6. `[Verify]`
   - The `#providerName` input is visible.
   - The `#providerName` input value equals `${user_a_provider}`.
7. `[Browser]` Sign out: click the Clerk UserButton avatar, then click "Sign out".
   Wait for the redirect away from `/app`.
8. `[Clerk Auth]` Sign in as a new user B with a unique email like
   `switch_user_b_${nanoid(6)}@example.com`.
9. `[Browser]` Navigate to `/app`.
10. `[Browser]` Click the "My Info" navigation tab in the pill row.
11. `[Verify]`
    - The `#providerName` input is visible (My Info rendered for user B).
    - The `#providerName` input value is `""` (empty — user B has no saved profile).
    - The text `${user_a_provider}` does NOT appear anywhere on the page.
    - The "My Info" nav tab is visible (user B is signed in).
    - `button-sign-in` is NOT visible (confirms we are authenticated as user B).
