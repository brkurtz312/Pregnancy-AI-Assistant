/**
 * Where the Full Pregnancy Pass is sold.
 *
 * The web app does not sell it. Purchases happen in the App Store, through
 * Apple's in-app purchase, and the entitlement that results is recorded
 * against the account — so a pass bought on an iPhone is active here the
 * moment its owner signs in.
 *
 * See docs/stripe-removal-plan.md for why web checkout was removed rather
 * than moved to another processor.
 */
export const APP_STORE_URL = "https://apps.apple.com/app/id6774959007";

/** The Android app's Google Play listing (package com.pregnancyassistant.app). */
export const GOOGLE_PLAY_URL =
  "https://play.google.com/store/apps/details?id=com.pregnancyassistant.app";

/** The app's name as it appears in the App Store and Google Play. */
export const APP_NAME = "Pregnancy AI Assistant";

/**
 * The current mobile release, shown on the landing page. Keep it in step with
 * `expo.version` in artifacts/pregnancy-calculator-mobile/app.json.
 */
export const APP_VERSION = "1.1.1";

/** What every "buy" affordance in the web app says. */
export const GET_PASS_LABEL = "Get the Pass in the App Store";

/** The line that explains why a purchase is not happening on this page. */
export const ALREADY_PURCHASED_HINT =
  "Already bought it on your iPhone? Sign in and it's active here.";
