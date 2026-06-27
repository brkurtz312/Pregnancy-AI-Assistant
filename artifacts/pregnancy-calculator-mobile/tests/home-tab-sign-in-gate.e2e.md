# E2E test: Home tab shows sign-in prompt for unauthenticated users

Verifies that a signed-out user sees the sign-in prompt card on the Home tab and
that tapping "Sign In" navigates to the sign-in screen — not the full calculator UI.

## Why

The Home tab renders one of two states based on `isSignedIn` from `@clerk/expo`:

- **Signed out** → sign-in prompt card ("Sign in to get started" + "Sign In" button)
- **Signed in** → pregnancy calculator with "CALCULATE BY" method selector

A regression here would silently expose the calculator UI to unauthenticated users or
break the only navigation path to sign-in from the Home tab.

## How to run

Use the `testing` skill: call
`runTest({ testPlan, relevantTechnicalDocumentation, testClerkAuth: false })`.

The mobile app is an Expo app that serves its web version at a dedicated Expo dev domain
(not through the shared `/mobile/` proxy). Retrieve the base URL from
`$REPLIT_EXPO_DEV_DOMAIN` before running.

## Shared technical context (pass as `relevantTechnicalDocumentation`)

- App URL: `https://$REPLIT_EXPO_DEV_DOMAIN/` (Expo web, react-native-web)
- The default tab on load is the Home tab.
- Signed-out state: card with heading "Sign in to get started", body text about tracking
  your pregnancy journey, and a "Sign In" button that navigates to `/(auth)/sign-in`.
- Signed-in state: pregnancy calculator with a "CALCULATE BY" section and method pills.
- Auth: Clerk (`@clerk/expo`). A fresh browser context with no cookies is signed out.
- Relevant source: `artifacts/pregnancy-calculator-mobile/app/(tabs)/index.tsx`

## Plan — sign-in prompt renders and Sign In button navigates correctly

1. `[New Context]` Create a fresh browser context (no cookies, not signed in).
2. `[Browser]` Navigate to `https://$REPLIT_EXPO_DEV_DOMAIN/` and wait up to 12 seconds
   for the page to fully render.
3. `[Verify]`
   - The text "Sign in to get started" is visible.
   - The text "CALCULATE BY" is NOT present.
   - A "Sign In" button is visible.
4. `[Browser]` Click the "Sign In" button.
5. `[Verify]`
   - The sign-in / authentication screen is displayed (Clerk UI, email or phone input,
     or a "Sign in" heading is visible).
