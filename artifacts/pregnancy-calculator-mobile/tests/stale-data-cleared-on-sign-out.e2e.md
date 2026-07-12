# E2E test: Stale tool data is cleared immediately after signing out

Verifies that Journal entries, Hospital Bag items, and Birth Plan answers from a
signed-in session are not visible immediately after the user signs out — confirming
that `AuthTokenBridge` clears all AsyncStorage tool caches on sign-out before the
next user (or the same user after re-opening the app) can see them.

## Why

`AuthTokenBridge` calls `clearJournalCache`, `clearHospitalBagCache`, and
`clearBirthPlanCache` when the Clerk session transitions from an active session to
`null`. Unit tests in `__tests__/authTokenBridge.test.tsx` cover the function
calls; this test covers the user-visible outcome: that the screens actually render
empty / default content rather than the previous user's data.

A regression here would silently expose one user's pregnancy journal, hospital-bag
customisations, and birth-plan answers to whoever picks up the device next.

## How to run

> **Automated Playwright testing is not possible for this flow.** The Expo web
> preview routes Clerk sign-in through an OAuth/bot-detection path that Playwright
> cannot complete headlessly (see `.agents/memory/expo-web-e2e-clerk-block.md`).
>
> Run this test **manually on a real device or simulator** using Expo Go or the
> installed development build. The steps below are written for a human tester.

## App navigation context

Understanding of the tab bar and routing is required to follow the steps:

- **Tools tab** — gated; shows "Sign in to use Tools" when the user is signed out.
  While signed in, it contains the **Journal** entry point.
- **Visit Prep tab** ("Get Ready" icon) — accessible when signed out. Opens a
  section picker modal with:
  - **Prenatal Care** → navigates to `/prenatal-care`, which contains a
    **"Prepare Your Birth Plan"** card → `/birth-plan`.
  - **Labor and Delivery** → navigates to `/labor-delivery`, which contains a
    **"Hospital Bag"** card → `/hospital-bag`.
- **Account sheet** — opens from the account icon in any tab's header. When signed
  in it shows the user's email and a **"Sign Out"** button.

Because the Tools tab is gated when signed out, the Journal screen is verified
**before** sign-out (while still navigated to it), not after. Hospital Bag and
Birth Plan are verified **after** sign-out via the Visit Prep tab (which remains
accessible without a session).

## Relevant source files

- `artifacts/pregnancy-calculator-mobile/components/AuthTokenBridge.tsx`
- `artifacts/pregnancy-calculator-mobile/components/AccountSheet.tsx`
- `artifacts/pregnancy-calculator-mobile/app/journal.tsx`
- `artifacts/pregnancy-calculator-mobile/app/hospital-bag.tsx`
- `artifacts/pregnancy-calculator-mobile/app/birth-plan.tsx`
- `artifacts/pregnancy-calculator-mobile/app/(tabs)/tools.tsx`
- `artifacts/pregnancy-calculator-mobile/app/(tabs)/visit-prep.tsx`

## Pre-conditions — seed data before running the test

The test user must have at least one piece of data in each tool. Seed fresh data at
the start of each run:

1. Sign in as the test user.
2. **Journal**: Go to the **Tools tab** → tap the **Journal** card →
   tap **"New Entry"** → write any text (e.g. "Test entry for sign-out test") →
   save. Confirm the entry card appears in the list.
3. **Hospital Bag**: Go to the **Visit Prep tab** → tap **"Labor and Delivery"** →
   tap the **"Hospital Bag"** card → check at least one item (e.g. "Insurance
   card"). The header should update to show at least **1 of N packed**.
4. **Birth Plan**: Go to the **Visit Prep tab** → tap **"Prenatal Care"** → tap the
   **"Prepare Your Birth Plan"** card → type text into at least one field →
   tap elsewhere to save.

## Plan — sign-out clears all three tool screens

### Step 1 — Verify Journal data is visible while signed in

1. `[Device]` Confirm you are still signed in as the test user.
2. `[Navigate]` Go to the **Tools tab** → tap the **Journal** card.
3. `[Verify]`
   - At least one journal entry card is visible with the text entered during
     pre-conditions.
   - The text **"Your journal is empty"** is **not** shown.

### Step 2 — Sign out while on the Journal screen

4. `[Device]` While on the Journal screen, tap the **account icon** in the header
   to open **AccountSheet**. (The account icon appears in the tab bar / header,
   accessible from any screen.)
5. `[Verify]` The sheet shows the test user's email address and a
   **"Sign Out"** button.
6. `[Device]` Tap **"Sign Out"**.
7. `[Verify]` The sheet dismisses.

### Step 3 — Journal shows empty state immediately after sign-out

8. `[Verify]` While still viewing the Journal screen (or immediately after the
   sheet closes and the screen is still in view):
   - The text **"Your journal is empty"** is now visible.
   - The text **"Tap 'New Entry' to capture your first moment."** is visible.
   - No entry cards from the previous session are shown.

   > If the sign-out triggers a navigation reset and the Journal screen is no
   > longer in view (the app returns to the Home tab), confirm the Home tab shows
   > **"Sign in to get started"** — this confirms the session was cleared — and
   > proceed to Step 9 to verify the other two screens. The Journal screen is
   > inaccessible to signed-out users via normal navigation (Tools tab shows "Sign
   > in to use Tools"), which itself prevents data exposure; the unit tests in
   > `__tests__/authTokenBridge.test.tsx` verify the cache clear fired.

### Step 4 — Hospital Bag shows default unchecked checklist

9. `[Navigate]` Go to the **Visit Prep tab** → tap **"Labor and Delivery"** → tap
   the **"Hospital Bag"** card.
10. `[Verify]`
    - The header shows **"0 of N packed"** (zero checked items; N is the total
      default item count, typically around 30–40).
    - All checklist items are **unchecked** (empty checkbox icons, no filled
      indicators).
    - No custom items that were added by the signed-in user during pre-conditions
      appear in the list. Only default category items are present.

### Step 5 — Birth Plan shows blank answers

11. `[Navigate]` Go back, then go to **Visit Prep tab** → tap **"Prenatal Care"**
    → tap the **"Prepare Your Birth Plan"** card.
12. `[Verify]`
    - All text fields that were filled in during pre-conditions are **empty** (they
      show placeholder text, not the previously saved answers).
    - The privacy note reads: **"Your answers are saved on this device only when
      you're not signed in."** (This confirms the signed-out branch is active.)
    - The page title **"Prepare Your Birth Plan"** and subtitle **"Based on the
      ACOG Sample Birth Plan"** are visible.

### Step 6 — No data reappears after re-navigation

13. `[Device]` Navigate away from Birth Plan (tap the back arrow), then tap
    **"Prepare Your Birth Plan"** again.
14. `[Verify]` The fields remain empty — the cleared state persists across
    navigation (no stale AsyncStorage read rehydrates the previous user's answers).
15. `[Navigate]` Repeat for Hospital Bag: navigate away and return.
16. `[Verify]` Hospital Bag still shows **"0 of N packed"** with all items
    unchecked.

---

## Pass / Fail criteria

| Check                             | Pass                                                                                    | Fail                                                          |
| --------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Journal empty after sign-out      | "Your journal is empty" shown, no entry cards visible                                   | Any entry card from the previous session is visible on screen |
| Hospital Bag reset after sign-out | Header shows "0 of N packed", all items unchecked, no custom items                      | Any item is checked, or a user-added custom item persists     |
| Birth Plan blank after sign-out   | All fields empty (placeholder text only), privacy note says "saved on this device only" | Any previously typed answer is still shown in a text field    |
| State persists on re-navigation   | Cleared state stays after navigating away and back to each screen                       | Data reappears when returning to a screen                     |
