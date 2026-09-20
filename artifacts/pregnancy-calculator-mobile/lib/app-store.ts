/**
 * Where the Full Pregnancy Pass is sold.
 *
 * On iOS and Android the pass is bought with the platform's in-app purchase,
 * from the account sheet. This URL is for the Expo web build only, which has
 * no in-app purchase and no longer has a web checkout either
 * (docs/stripe-removal-plan.md).
 */
export const APP_STORE_URL = "https://apps.apple.com/app/id6774959007";

/** Where a purchase happens in the app, for copy that has to point at it. */
export const PURCHASE_LOCATION_HINT =
  "Tap the account icon at the top of the Home or Ask tab to get the Full Pregnancy Pass.";
