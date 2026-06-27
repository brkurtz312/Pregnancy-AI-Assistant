# E2E test: Stale pass data disappears immediately on sign-out

Verifies that the `SessionWatcher` component calls `queryClient.clear()` on sign-out so
no authenticated data (pass status, free-question badge, "My Info" tab) lingers for the
next user of the same browser session.

## Why

The React Query cache holds pass status and profile data fetched while signed in. Without
`SessionWatcher` clearing the cache on sign-out, a subsequent anonymous visitor on the
same device would momentarily see the previous user's pass badge and "My Info" nav tab.
This test guards against that regression.

## How to run

Use the `testing` skill: call
`runTest({ testPlan, relevantTechnicalDocumentation, testClerkAuth: true })`.

## Shared technical context (pass as `relevantTechnicalDocumentation`)

- Web app lives at path `/`; the calculator/app page is at `/app`.
- Account bar testids:
  - Signed-out → `button-sign-in` + `button-sign-up` visible
  - Signed-in, no pass → `badge-free-remaining` + `button-unlock-pass` visible
  - Signed-in, with pass → `badge-pass-active` ("Full Pass") visible
- "My Info" nav tab (Heart icon) only renders when `isSignedIn` is true. It appears as
  a button with text "My Info" inside the navigation pill row (Calculator | Tools |
  Development | My Info).
- Sign out: click the Clerk UserButton avatar (circular avatar top-right of account-bar),
  then click "Sign out" in the popup menu.
- The `SessionWatcher` component in `App.tsx` calls `queryClient.clear()` when the Clerk
  session transitions from active to `null`. This wipes the entire React Query cache so
  stale pass status and profile data cannot linger.
- The `AccountBar` uses Clerk `<Show when="signed-in">` / `<Show when="signed-out">` —
  authenticated badges are fully unmounted after sign-out, not merely hidden.
- After sign-out Clerk redirects to `/` (landing page). The landing page nav uses
  `data-testid="button-nav-sign-in"`. The app page (`/app`) AccountBar uses
  `data-testid="button-sign-in"`. Either confirms the signed-out state.

## Plan — signed-in user signs out; all authenticated data disappears immediately

1. `[New Context]` Create a fresh browser context.
2. `[Clerk Auth]` Sign in as a new user with a unique email like
   `signout_test_${nanoid(6)}@example.com`.
3. `[Browser]` Navigate to `/app`.
4. `[Verify]` After the page loads, wait for the account bar to show the signed-in state:
   - `badge-free-remaining` is visible (e.g. "5/5 free questions left").
   - `button-unlock-pass` is visible ("Unlock Pass" button).
   - The "My Info" navigation tab is visible in the nav pill.
   - `button-sign-in` is NOT visible.
5. `[Browser]` Click the Clerk UserButton avatar in the top-right corner of the account
   bar to open the account popup menu. Click "Sign out". Wait for the sign-out to
   complete (the page should update to show the signed-out state).
6. `[Verify]` Immediately after sign-out, without reloading the page:
   - `button-sign-in` is visible.
   - `badge-free-remaining` is NOT visible anywhere on the page.
   - `badge-pass-active` is NOT visible anywhere on the page.
   - `button-unlock-pass` is NOT visible.
   - The "My Info" navigation tab is NOT visible in the nav pill.
