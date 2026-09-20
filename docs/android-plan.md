# Shipping an Android build

A map, not a commitment. Written 20 Sep 2026, after 1.0.15 went to App Store
Connect. Everything under "What already works" was verified against the
repository; everything under "What needs checking outside the repo" was not,
and is marked as such.

The short version: the app is more Android-ready than it looks, the billing
model needs no redesign, and the real work is account setup, store assets and
a device you have never tested on.

---

## What already works

Verified in the code, not assumed:

- **`Platform.OS === "android"` branches already exist** in the sign-in and
  sign-up screens, `office-visit.tsx`, `scribe.tsx` and the date pickers. The
  app was written platform-aware rather than iOS-only.
- **RevenueCat already selects the Android key.** `getRevenueCatApiKey()`
  returns `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY` when
  `Platform.OS === "android"`. It also _throws unless all three keys are
  present_, so that variable is already set in the EAS production
  environment — an iOS build would fail without it.
- **The Watch native module has an Android no-op stub.**
  `modules/WatchConnectivity.ts` exports a stub when the native module is
  absent, so nothing throws at runtime.
- **The Watch UI is already hidden off-iOS.** `app/(tabs)/tools.tsx` gates the
  Watch card with `Platform.OS === "ios"`, and the status row returns `null`
  on any other platform.
- **Kick Counter and Contraction Timer are full sections of the phone app**,
  not Watch-only features. Android loses the companion, not the function.
- **The iOS-only config plugins are platform-scoped.** `withWatchExtension`,
  `withAppleSignIn` and `withValidateIOSIconCatalog` operate through
  iOS-scoped mods, so an Android build does not run them.
- **One entitlement covers both stores.** `users.has_pass` is per account, and
  `/billing/revenuecat/reconcile` grants it from whichever store the purchase
  came from. Nothing about the server changes for Android.

---

## Decide before the first publish

### The package name — decided 20 Sep 2026

```json
"android": { "package": "com.pregnancyassistant.app" }
```

**A Play Store package name cannot be changed after the first publish.** A
different one means a different listing, with no path for existing installs.
So this was settled before any build exists.

It was `app.replit.pregnancycalculator`, matching the iOS bundle identifier.
The iOS one is shipped and therefore permanent, `replit` and all; Android had
not shipped, so it was the one chance not to carry a departed vendor's name
forever. It was taken.

**The two identifiers are now deliberately unequal.** Play and the App Store
are separate namespaces, so nothing breaks. Every remaining
`app.replit.pregnancycalculator` in the repository is iOS — the Watch bundle
id, the app group, `withWatchExtension`'s `MAIN_BUNDLE_ID`,
`validate-eas-provisioning`'s fallback, `seedRevenueCat`'s
`APP_STORE_BUNDLE_ID` — and none of them may move. `CLAUDE.md` records this so
the mismatch does not get "corrected" later.

Note `com.pregnancyassistant.app` also exists in EAS credentials as an
abandoned iOS identifier. That is an Apple-side artefact and does not conflict
with an Android package, but expect to see the string in credential listings
for a reason unrelated to Android.

### The upload keystore is unrecoverable

EAS can generate and hold it. **If it is lost and Play App Signing is not
enrolled, the app can never be updated again** — only republished under a new
package name. Back it up (`eas credentials`) somewhere that is not only EAS,
and enrol in Play App Signing so Google holds the app signing key.

---

## Build configuration gaps

None of these are hard; all of them are missing.

| Gap                      | Where                                                                           |
| ------------------------ | ------------------------------------------------------------------------------- |
| No Android build profile | `eas.json` — `build.production` has `ios` only                                  |
| No Android submit config | `eas.json` — `submit.production` has only `ascAppId`                            |
| No adaptive icon         | `assets/images/` has no Android icon set                                        |
| No notification icon     | `expo-notifications` renders a white square without one                         |
| No `android.permissions` | `RECORD_AUDIO` for the scribe (`expo-av`), `POST_NOTIFICATIONS` for Android 13+ |

`appVersionSource: "remote"` and `autoIncrement` already handle `versionCode`
once the profile exists.

---

## Auth

- **Google sign-in needs the signing certificate's SHA-1** registered against
  the Android OAuth client in Google Cloud. With an EAS-managed keystore, read
  it from `eas credentials`. This is the single most common reason Google
  sign-in works on iOS and fails on Android.
- **Sign in with Apple is currently gated to iOS** (`Platform.OS === "ios"` in
  the auth screens). Clerk can offer it on Android through a web flow. Apple's
  rule requiring it applies to iOS apps offering other social logins, so this
  is a product choice, not a requirement.
- Clerk's redirect allowlist needs the Android scheme added.

---

## Billing

The model needs no redesign — the pass is a one-time non-consumable on both
stores, attached to the same `pass` entitlement.

The order is fixed by Google's tooling:

1. Create the app in Play Console and **upload a signed build first** — the
   in-app products page is not available until a build exists.
2. Create the one-time product at $9.99, matching the App Store price and
   `docs/stripe-removal-plan.md`.
3. Add the Play Store app in RevenueCat, upload the Play service account
   credentials, and attach the product to the **existing `pass` entitlement**.
   Same entitlement is the whole point: `has_pass` stays one flag.
4. Verify a test purchase reconciles through
   `/billing/revenuecat/reconcile` and grants the pass on the account.

Note `scripts/src/seedRevenueCat.ts` seeds the RevenueCat _test store_ only.
Real Play products are created in Play Console.

---

## The Watch

There is no Android counterpart and none is planned here. The Tools tab
already hides the Watch card off-iOS, so nothing needs writing — but the
marketing copy, the store listing and `docs/app-review-notes.md` all describe
a Watch app, and the Play listing must not.

---

## What needs checking outside the repo

Stated as questions because I could not verify them from here, and the answers
change:

- **Play Console developer account.** A one-time fee, plus identity
  verification that can take days. Register as the same entity as the Apple
  account, or knowingly not.
- **Closed-testing requirement.** Google has required new personal developer
  accounts to run a closed test with a minimum number of testers for a
  minimum period before production access. Whether it applies depends on
  account type and registration date — check the current policy before
  planning a date, because it is measured in weeks, not days.
- **Health and medical app declarations.** A pregnancy app giving AI-assisted
  guidance may attract extra policy review. The Data Safety form, content
  rating questionnaire and privacy policy URL are all required regardless.

---

## Untested surface

No part of this app has ever run on an Android device. The following are
unverified rather than known-broken, and a first device session should walk
them deliberately:

- Fonts (`Inter_*` loaded via `expo-font`)
- Date and time pickers — the code already branches on platform, so the
  Android path exists but has not been seen
- The audio recorder in the scribe, including the permission prompt
- Notifications, including the Android 13+ runtime permission
- Deep links and the OAuth redirect round trip
- Keyboard avoidance — several screens use
  `behavior={Platform.OS === "ios" ? "padding" : undefined}`, which is the
  usual source of Android keyboard problems

---

## Suggested order

1. ~~Decide the package name.~~ Done 20 Sep 2026 —
   `com.pregnancyassistant.app`.
2. Play Console account and verification — start it first, it is the longest
   pole and nothing else depends on the outcome.
3. Add the Android build profile, permissions and icons; produce an internal
   build.
4. Device session against the untested surface above.
5. Google sign-in SHA-1 and the Clerk redirect.
6. Play product, RevenueCat wiring, verified test purchase.
7. Store listing, Data Safety, content rating.
8. Closed test, then production.

Steps 1–4 are repository work and can start immediately. Steps 2 and 6 are
account work with external waiting periods, so start them early even though
they appear late in the dependency order.
