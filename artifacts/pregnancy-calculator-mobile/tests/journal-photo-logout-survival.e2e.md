# E2E test: Journal photos reappear after signing out and back in

Verifies that photos attached to journal entries remain visible after the user
signs out and signs back in with the same account.

## Why

When a user signs back in, the app loads journal entries from the server. Server
entries do not carry local file URIs (photos are stored on-device only). The app
must consult the media index — a separate AsyncStorage key
(`JOURNAL_MEDIA_INDEX_KEY`) that is intentionally **not** wiped by
`clearJournalCache` — to re-attach photos to their entries. Without this fallback,
every journal entry would appear without photos after a sign-out/sign-in cycle even
though the photo files are still on disk.

Unit tests in `__tests__/journalPhotoLogoutSurvival.test.tsx` confirm the
storage-layer invariants (write path, index survival after `clearJournalCache`,
ID re-keying). This checklist confirms the end-to-end user-visible outcome on a
real device.

## How to run

> **Automated Playwright testing is not possible for this flow.** The Expo web
> preview routes Clerk sign-in through an OAuth/bot-detection path that Playwright
> cannot complete headlessly (see `.agents/memory/expo-web-e2e-clerk-block.md`).
>
> Run this test **manually on a real iOS or Android device (or simulator) using
> Expo Go or the installed development build**. The steps below are written for a
> human tester.

## App navigation context

- **Tools tab** — gated; shows "Sign in to use Tools" when the user is signed out.
  While signed in it contains the **Journal** entry point.
- **Journal list screen** — shows all journal entry cards. Each card with photos
  shows a media count badge such as **"1 photo"** or **"2 photos/videos"** below
  the entry text.
- **Account sheet** — opens from the account icon in any tab's header. While signed
  in it shows the user's email and a **"Sign Out"** button.

## Relevant source files

- `artifacts/pregnancy-calculator-mobile/lib/journal.ts`
  (`upsertEntry`, `loadMediaIndex`, `clearJournalCache`, `JOURNAL_MEDIA_INDEX_KEY`)
- `artifacts/pregnancy-calculator-mobile/app/journal.tsx`
  (merge step lines ~397–404: `mediaIndex[se.id]` fallback)
- `artifacts/pregnancy-calculator-mobile/__tests__/journalPhotoLogoutSurvival.test.tsx`

## Pre-conditions — create a journal entry with a photo

1. Sign in as the test user.
2. `[Navigate]` Go to the **Tools tab** → tap the **Journal** card.
3. `[Action]` Tap **"New Entry"**.
4. `[Action]` Write any entry text (e.g. "Bump photo test entry").
5. `[Action]` Tap the photo attachment button and attach any photo from the device
   library or take a new one. Confirm the photo thumbnail appears in the composer.
6. `[Action]` Save the entry.
7. `[Verify]` The new entry card appears in the Journal list. The card shows:
   - The entry text ("Bump photo test entry").
   - A media count badge: **"1 photo"**.

## Plan — sign out then sign back in

### Step 1 — Note the media count badge while signed in

1. `[Verify]` On the Journal list screen, confirm the entry created in pre-conditions
   shows the **"1 photo"** badge. This is the baseline that must survive the cycle.

### Step 2 — Sign out

2. `[Action]` Tap the **account icon** in the header to open the Account sheet.
3. `[Verify]` The sheet shows the test user's email and a **"Sign Out"** button.
4. `[Action]` Tap **"Sign Out"**.
5. `[Verify]` The sheet dismisses. The app shows the sign-out state (Home tab shows
   "Sign in to get started", or the Tools tab shows "Sign in to use Tools").

### Step 3 — Sign back in with the same account

6. `[Action]` Tap **"Sign In"** (from the Home tab or the Tools tab sign-in prompt).
7. `[Action]` Complete sign-in with the **same account credentials** used in
   pre-conditions.
8. `[Verify]` The app returns to the signed-in state. The Home tab and Tools tab are
   both accessible.

### Step 4 — Verify the photo is still visible

9. `[Navigate]` Go to the **Tools tab** → tap the **Journal** card.
10. `[Verify]` The entry card is present in the list:
    - The entry text ("Bump photo test entry") is visible.
    - The media count badge **"1 photo"** is visible below the text.
11. `[Action]` Tap the entry card to open the detail view.
12. `[Verify]` Inside the detail view:
    - The photo thumbnail is visible (not broken, not blank).
    - The full-size photo opens if tapped.

### Step 5 — Verify the photo survives a second sign-out/sign-in (regression guard)

13. `[Action]` Sign out a second time (same steps as Step 2).
14. `[Action]` Sign back in (same steps as Step 3).
15. `[Navigate]` Go to the **Tools tab** → tap the **Journal** card.
16. `[Verify]` The **"1 photo"** badge is still visible on the entry card.

---

## Pass / Fail criteria

| Check                               | Pass                                                                                         | Fail                                                                       |
| ----------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Media badge visible before sign-out | "1 photo" badge shown on the entry card                                                      | No badge; photos not attached                                              |
| Entry card visible after sign-in    | Entry card with text "Bump photo test entry" is present in the Journal list                  | Entry card is missing                                                      |
| Media badge visible after sign-in   | "1 photo" badge is shown on the entry card after signing back in                             | Badge is absent even though the photo file is still on disk                |
| Photo viewable in detail view       | Photo thumbnail is visible inside the entry detail; opens to full size when tapped           | Thumbnail is broken (grey/blank) or missing                                |
| Survives second cycle               | "1 photo" badge still present after a second sign-out/sign-in cycle                          | Badge disappears on the second cycle (index lost on second clearJournalCache) |
