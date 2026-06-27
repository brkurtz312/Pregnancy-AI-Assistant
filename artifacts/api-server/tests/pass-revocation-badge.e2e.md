# E2E test: Pass badge disappears on server-side revocation (live session)

Verifies that a signed-in user's Full Pass badge (`badge-pass-active`) is replaced by
the free-questions badge (`badge-free-remaining`) the moment `has_pass` is flipped to
`false` in the database, **without** a manual page reload or sign-out.

## Why

The sign-out test (`session-watcher-signout.e2e.md`) covers cache clearing on sign-out.
This test covers the complementary scenario: a refund or manual DB change revokes the
pass while the user is actively browsing. The `useGetPassStatus` React Query hook is
configured with `staleTime = 0` and `refetchOnWindowFocus = true` (React Query defaults).
TanStack Query v5's `FocusManager` (installed version: `@tanstack/query-core@5.100.14`)
listens for a **`visibilitychange`** event on `window` and reads `document.visibilityState`
to determine focus. Dispatching `window.dispatchEvent(new Event('visibilitychange'))` when
`document.visibilityState === 'visible'` (the Playwright default) is sufficient to trigger
a fresh `/api/billing/pass-status` fetch in a live session with no hard reload.

## How to run

Use the `testing` skill: call
`runTest({ testPlan, relevantTechnicalDocumentation, testClerkAuth: true })`.

## Shared technical context (pass as `relevantTechnicalDocumentation`)

- Web app lives at path `/`; the main app page is at `/app`.
- Account bar testids:
  - Signed-in, **with** pass → `badge-pass-active` ("Full Pass") is visible;
    `badge-free-remaining` and `button-unlock-pass` are NOT visible.
  - Signed-in, **without** pass → `badge-free-remaining` (e.g. "5/5 free questions left")
    and `button-unlock-pass` are visible; `badge-pass-active` is NOT visible.
- **Refetch trigger**: TanStack Query v5's `FocusManager` listens for `visibilitychange`
  on `window` — NOT `focus`/`blur`. When `document.visibilityState === 'visible'`
  (the Playwright page default), dispatching:
  ```js
  window.dispatchEvent(new Event("visibilitychange"));
  ```
  causes the focus manager to call `isFocused()` → `true`, which notifies all query
  observers. Since `staleTime = 0`, any stale query with `refetchOnWindowFocus = true`
  immediately fires a new request. Wait up to 5 seconds for the UI to update.
- Pass status endpoint: `GET /api/billing/pass-status` (requires Clerk session).
- DB schema:
  - `users` table: `id text PK` (Clerk user id), `email text`, `has_pass boolean NOT NULL DEFAULT false`.
  - Grant the pass: `UPDATE users SET has_pass = true WHERE email = '<email>'`.
  - Revoke the pass: `UPDATE users SET has_pass = false WHERE email = '<email>'`.
  - Check the pass: `SELECT has_pass FROM users WHERE email = '<email>'`.
- The `users` row is created automatically once the user signs in and the pass status
  query completes; wait for `badge-free-remaining` or `badge-pass-active` before any
  `[DB]` step.

## Plan — revoke has_pass in DB → badge disappears in the live session

1. `[New Context]` Create a fresh browser context.
2. `[Clerk Auth]` Sign in as a new user with a unique email like
   `revoke_test_${nanoid(6)}@example.com`. Note the email (say `${email}`).
3. `[Browser]` Navigate to `/app`.
4. `[Verify]` Wait for the account bar to reach the signed-in, no-pass state:
   - `badge-free-remaining` is visible.
   - `button-unlock-pass` is visible.
   - `badge-pass-active` is NOT visible.
5. `[DB]` Grant the pass directly in the database:
   ```sql
   UPDATE users SET has_pass = true WHERE email = '${email}';
   ```
6. `[DB]` Confirm the grant:
   ```sql
   SELECT has_pass FROM users WHERE email = '${email}';
   ```
   Assert `has_pass = true`.
7. `[Browser]` Trigger a React Query `refetchOnWindowFocus` refetch by dispatching a
   `visibilitychange` event on `window` (TanStack Query v5 listens specifically for this
   event, not `focus`/`blur`):
   ```js
   window.dispatchEvent(new Event("visibilitychange"));
   ```
   Wait up to 5 seconds for the UI to update.
8. `[Verify]` The account bar now shows the pass-active state:
   - `badge-pass-active` ("Full Pass") is visible.
   - `badge-free-remaining` is NOT visible.
   - `button-unlock-pass` is NOT visible.
9. `[DB]` Revoke the pass (simulate a refund / manual DB change):
   ```sql
   UPDATE users SET has_pass = false WHERE email = '${email}';
   ```
10. `[DB]` Confirm the revocation:
    ```sql
    SELECT has_pass FROM users WHERE email = '${email}';
    ```
    Assert `has_pass = false`.
11. `[Browser]` Trigger another React Query refetch with the same `visibilitychange`
    technique:
    ```js
    window.dispatchEvent(new Event("visibilitychange"));
    ```
    Wait up to 5 seconds for the UI to update.
12. `[Verify]` The account bar has reverted to the free state **without** a page reload
    or sign-out:
    - `badge-free-remaining` is visible (e.g. "5/5 free questions left").
    - `button-unlock-pass` is visible.
    - `badge-pass-active` is NOT visible anywhere on the page.

## Notes / gotchas

- **Use `visibilitychange` on `window`, not `focus`/`blur`.** TanStack Query v5's
  `FocusManager` setup function explicitly binds to `window.addEventListener('visibilitychange', ...)`.
  Dispatching `blur`/`focus` events on `window` does nothing because the v5 listener was
  removed. This changed from v4.
- The refetch fires when `isFocused()` returns `true` at the time of the event.
  `isFocused()` reads `document.visibilityState !== 'hidden'`. In Playwright, pages are
  always `'visible'` by default, so no state manipulation is needed.
- There is no polling interval; background refetches only happen via `visibilitychange`.
  Simply waiting N seconds without dispatching the event will not work.
- Steps 5–8 (grant → verify badge appears) confirm the refetch mechanism works before
  testing the revocation direction. If step 8 fails, the mechanism is broken and
  subsequent steps are unreliable.
- Use unique `nanoid` emails to avoid collisions with other test runs.
- The `users` row is lazily created on first pass-status fetch after sign-in; always
  wait for the account bar badges (step 4) before issuing `[DB]` mutations.
