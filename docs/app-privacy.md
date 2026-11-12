# App Privacy answers for App Store Connect

What to enter under App Store Connect → the app → **App Privacy**, and why.
Derived from the code on 2026-11-11: every database table in
`lib/db/src/schema/`, the outside services the app and server call, and the
device permissions the app uses.

**Update this file whenever the app starts storing or sending something new**,
then update the label to match. The label, the privacy policy and what the app
actually does must all say the same thing; App Review compares them.

## Status

The label published in mid-2026 said **"No, we do not collect data from this
app."** That was not accurate even then: account emails, health logs and
journal entries have been stored on the server since launch. Found on
2026-11-11 while declaring the new funnel events (PR #70). Replace it with
the answers below.

## Answers

Select **"Yes, we collect data from this app"**, tick the data types in the
table, save, then **Set Up** each one. Finish with **Publish**; until then the
changes are only a draft.

**Tracking: No, for every data type.** The app has no advertising or
third-party analytics SDK, and nothing is combined with other companies' data.

| Category → Data type              | What it is in this app                                                                                                                                             | Purpose           | Linked to user |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------- | -------------- |
| Contact Info → Name               | First name in the profile (`user_profiles.first_name`); name from Apple/Google sign-in, held by Clerk                                                              | App Functionality | Yes            |
| Contact Info → Email Address      | Account sign-in (Clerk); `users.email`                                                                                                                             | App Functionality | Yes            |
| Health & Fitness → Health         | Due/delivery date, pre-pregnancy weight, symptoms, kick counts, contractions, prenatal visits (weight, blood pressure, fetal heart rate), birth plan, journal mood | App Functionality | Yes            |
| User Content → Other User Content | Journal text and notes; questions sent to the AI assistant (processed by Anthropic, not stored by us)                                                              | App Functionality | Yes            |
| Contacts → Contacts               | Support people the user adds by hand (`support_contacts`: first name, phone)                                                                                       | App Functionality | Yes            |
| Location → Coarse Location        | ZIP code in the profile (`user_profiles.zip_code`)                                                                                                                 | App Functionality | Yes            |
| Purchases → Purchase History      | Whether and when the pass was bought (`users.has_pass`, `pass_purchased_at`; RevenueCat)                                                                           | App Functionality | Yes            |
| Identifiers → User ID             | Account ID (Clerk), also the RevenueCat app user ID                                                                                                                | App Functionality | Yes            |
| Usage Data → Product Interaction  | Anonymous purchase-funnel counts (`funnel_events`)                                                                                                                 | Analytics         | **No**         |

## Deliberately not declared

- **Precise Location.** The "am I at my provider's office or hospital?" check
  (`components/LocationModePrompt.tsx`) reads the device location and compares
  it on the phone. Coordinates are never sent anywhere. The provider's
  _address_ goes to OpenStreetMap to be geocoded; that is not the user's
  location.
- **Photos or Videos.** Journal media stays on the device; only text and
  metadata sync.
- **Audio.** Fetal heart rate recordings stay on the phone. The Scribe feature,
  which sent audio for transcription, is not reachable in the app. Declare
  Audio Data if it comes back.
- **Crash Data / Diagnostics.** No crash-reporting SDK.
- **Device ID.** Nothing in our code reads one. **Check RevenueCat's own App
  Privacy guidance** for whether its SDK requires it; that was not verified.
- **IP addresses.** Not one of Apple's data types. Signed-out users' IPs are
  stored in `ai_usage` (identifier `ip:<address>`) to apply the free weekly
  question limit, briefly in `rate_limits`, and in server logs. They are not
  used to work out location. The privacy policy says all of this.

## Judgment calls

All made on the cautious side. Declaring something that could have been left
off never causes a rejection; leaving off something that should be declared
can.

- **Coarse Location** for a typed ZIP code, and **Contacts** for support people
  entered by hand. Both arguable either way.
- **AI questions** count as collected even though our server does not store
  them, because Anthropic processes them and may retain them briefly.

## The privacy policy must match

The policy is the web app's `/privacy` page,
`artifacts/pregnancy-calculator/src/pages/privacy.tsx`, served at
**https://pregnancy-assistant.com/privacy**. That is the URL to enter in App
Store Connect → App Information → Privacy Policy URL.

It replaced the page at brk-services.com/privacy-policy-pregnancy-assistant
(effective 30 May 2026), which said the app collected nothing, stored
everything on the device and used no third-party services. App Store Connect
pointed at `privacy.brk-services.com`, which did not exist at all.

When this file changes, change the page in the same pull request and update
its `EFFECTIVE_DATE`. `src/__tests__/privacy-page.test.tsx` checks that the
page names every outside service that handles user data (Clerk, Railway,
Cloudflare, Anthropic, RevenueCat, Apple, OpenStreetMap); add a new one there
too.
