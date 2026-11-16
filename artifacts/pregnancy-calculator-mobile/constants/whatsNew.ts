import { Ionicons } from "@expo/vector-icons";

export type WhatsNewPlatform = "ios" | "android";

export interface WhatsNewItem {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  title: string;
  body: string;
  /**
   * Platforms this item applies to. Omit for items that apply everywhere.
   * Use it for anything that names Apple or Google hardware or stores
   * (Apple Watch, iPhone Duo, App Store), so Android users never see it.
   */
  platforms?: WhatsNewPlatform[];
}

export interface WhatsNewEntry {
  headline: string;
  items: WhatsNewItem[];
}

/**
 * What's New content shown in the bottom sheet after an upgrade.
 *
 * ## HOW TO UPDATE
 * When you bump `expo.version` in `app.json`, add a matching key here with the
 * user-visible changes for that version. The key must be the exact version
 * string (e.g. "1.0.2"). If no entry exists for the current version the sheet
 * is silently skipped — so forgetting this step means users never see the
 * announcement.
 *
 * Run `pnpm --filter @workspace/scripts run check-whats-new` before committing
 * to verify that app.json's version is covered. The check is also wired into
 * the production EAS `prebuildCommand` (eas.json) so a missing entry blocks
 * the build before it reaches the App Store.
 */
export const WHATS_NEW: Record<string, WhatsNewEntry> = {
  "1.1.1": {
    headline: "Helping us improve the Pass",
    items: [
      {
        icon: "analytics-outline",
        title: "Anonymous Usage Counts",
        body: "The app now counts a few steps anonymously, such as opening the Full Pregnancy Pass screen, so we can see where getting the Pass goes wrong and fix it. Nothing that identifies you or your device is sent.",
      },
    ],
  },
  "1.1.0": {
    headline: "Ready for iOS 27 and iPhone Duo",
    items: [
      {
        icon: "phone-portrait-outline",
        title: "Made for iPhone Duo",
        platforms: ["ios"],
        body: "Unfold your iPhone Duo and the app uses the bigger screen, with the sidebar layout from iPad. Fold it again and everything resizes to fit.",
      },
      {
        icon: "sparkles-outline",
        title: "Updated for iOS 27",
        platforms: ["ios"],
        body: "The app has been rebuilt on Apple's latest tools for iOS 27, with improvements to audio and video playback along the way.",
      },
    ],
  },
  "1.0.19": {
    headline: "Watch contractions reach your log",
    items: [
      {
        icon: "watch-outline",
        title: "Contractions From the Watch Now Save",
        body: "Contraction sessions recorded on the Apple Watch reached your phone and were stored there, but the step that saved them into your log cancelled itself every time. Your phone now reads them, including any it has been holding.",
      },
    ],
  },
  "1.0.18": {
    headline: "Watch recordings reach your phone",
    items: [
      {
        icon: "watch-outline",
        title: "Contractions From the Watch Now Save",
        body: "Contraction sessions recorded on the Apple Watch were reaching your phone and being stored, but the step that saved them to your log never ran \u2014 so they never appeared. They do now, including any the Watch has been holding.",
      },
    ],
  },
  "1.0.17": {
    headline: "Watch connection status is live",
    items: [
      {
        icon: "pulse-outline",
        title: "The Watch Status Is Now Accurate",
        body: "The connection line on the Tools screen only updated when you left the screen and came back, so it was often wrong. It now updates as the connection actually changes.",
      },
    ],
  },
  "1.0.16": {
    headline: "Chasing the Watch sync problem",
    items: [
      {
        icon: "search-outline",
        title: "More Detail On Watch Records",
        body: "The Tools screen now reports how many contraction records arrived from the Watch and how many were saved. If the two numbers disagree, it says why \u2014 which is the part that has been invisible while this problem has been chased.",
      },
    ],
  },
  "1.0.15": {
    headline: "Buying the pass, and the Watch",
    items: [
      {
        icon: "bag-check-outline",
        title: "The Pass Is Bought In the App",
        body: "Getting the Full Pregnancy Pass used to open a web browser to pay. It is now an ordinary App Store purchase, made from the account icon at the top of the Home or Ask tab \u2014 faster, and it uses the payment method your Apple ID already has.",
      },
      {
        icon: "watch-outline",
        title: "Watch Sync Status",
        body: "A new Sync Status screen on the Watch shows whether contractions and kick sessions recorded there are reaching your phone, and says what went wrong when they are not.",
      },
    ],
  },
  "1.0.14": {
    headline: "Fewer silent failures",
    items: [
      {
        icon: "alert-circle-outline",
        title: "Sign-In Tells You What Went Wrong",
        body: "When a sign-in was refused \u2014 a wrong password, an account that needs a different method, a code that had expired \u2014 the screen sometimes just sat there with no explanation. The reason is now shown on the screen you are looking at.",
      },
      {
        icon: "refresh-outline",
        title: "Restore Purchases Reports Its Result",
        body: "Restore Purchases gave no indication whether it had found anything. It now tells you either that your purchases were restored, or that no previous purchase was found for this Apple ID.",
      },
      {
        icon: "watch-outline",
        title: "Watch Problems Are Visible",
        body: "If the link to the Apple Watch fails, contractions and kick sessions recorded on the Watch cannot reach your phone. That used to happen silently. The Tools screen now says so instead of leaving you to discover missing records later.",
      },
    ],
  },
  "1.0.13": {
    headline: "Accuracy and sign-in fixes",
    items: [
      {
        icon: "calendar-outline",
        title: "Dates Land on the Right Day",
        body: "Due dates, appointments and visit records were shifting by a day depending on your time zone, which moved gestational age and everything calculated from it. Dates are now read and saved as calendar days, so they stay exactly as you entered them.",
      },
      {
        icon: "log-in-outline",
        title: "More Reliable Sign-In",
        body: "Signing in with email, Apple or Google is handled directly by the app now. Sessions hold up properly instead of occasionally dropping you back to the sign-in screen.",
      },
    ],
  },
  "1.0.12": {
    headline: "Now on Apple Watch",
    items: [
      {
        icon: "watch-outline",
        title: "Contraction Timer on Your Wrist",
        body: "Start, stop, and track contractions right from your Apple Watch — no need to reach for your phone during labor.",
      },
      {
        icon: "fitness-outline",
        title: "Kick Counter on Your Wrist",
        body: "Log baby kicks from your Watch and keep an eye on movement patterns without unlocking your phone.",
      },
      {
        icon: "bulb-outline",
        title: "Weekly Tips on Your Watch",
        body: "Get bite-sized pregnancy tips for your current week, always available at a glance on your wrist.",
      },
    ],
  },
  "1.0.7": {
    headline: "Appointment Reminders",
    items: [
      {
        icon: "calendar-outline",
        title: "Schedule Upcoming Appointments",
        body: "Add future prenatal visits in Office Visits or right from In-Office Mode. Your upcoming appointments are shown at the top of the Office Visits screen.",
      },
      {
        icon: "notifications-outline",
        title: "Day-Before Reminders",
        body: "The morning before each appointment you'll receive a reminder with a preview of what your provider is likely to discuss based on your gestational age.",
      },
    ],
  },
  "1.0.6": {
    headline: "What's new in this update",
    items: [
      {
        icon: "mic-circle-outline",
        title: "New: Visit Notes Scribe",
        body: "Record your prenatal appointment and get a warm, plain-language summary — what was discussed, your next steps, and what to remember. Your recording never leaves your device.",
      },
      {
        icon: "book-outline",
        title: "New: Pregnancy Journal",
        body: "Write journal entries throughout your pregnancy, capture your mood, and attach baby bump or ultrasound photos. Your journal lives privately on your device.",
      },
      {
        icon: "document-text-outline",
        title: "New: Visit Report",
        body: "Your prep questions, appointment log, and scribe notes now come together in one shareable visit report you can view or save as a PDF.",
      },
      {
        icon: "star-outline",
        title: "New: Full Pregnancy Pass",
        body: "Unlock unlimited AI questions, unlimited journal entries and photos, and unlimited scribe sessions with a one-time upgrade.",
      },
    ],
  },
  "1.0.5": {
    headline: "What's new in this update",
    items: [
      {
        icon: "play-circle-outline",
        title: "New: Video Vault",
        body: "Browse a curated library of trusted pregnancy and newborn education videos from ACOG, AAP, CDC, and other leading health organizations, organized by topic.",
      },
    ],
  },
  "1.0.4": {
    headline: "What's new in this update",
    items: [
      {
        icon: "clipboard-outline",
        title: "New: Visit Prep tab",
        body: "Prepare for your next appointment with a doctor question checklist, a countdown to your upcoming visit, and a log to track weight, blood pressure, and notes from past visits.",
      },
    ],
  },
  "1.0.3": {
    headline: "What's new in this update",
    items: [
      {
        icon: "sparkles-outline",
        title: "Easier access to Ask a Question",
        body: "A new banner on your Home tab now takes you straight to the AI assistant, so you can get answers about your pregnancy in one tap.",
      },
    ],
  },
  "1.0.11": {
    headline: "What's new in this update",
    items: [
      {
        icon: "heart-outline",
        title: "Fetal Heart Rate Recording",
        body: "Record your baby's heartbeat during appointments with a 30-second countdown, then play it back or save it anytime from the Tools tab.",
      },
    ],
  },
  "1.0.10": {
    headline: "What's new in this update",
    items: [
      {
        icon: "business-outline",
        title: "In-Office Mode — questions improved",
        body: "Office Mode now shows only the questions you selected during visit prep. Tap each one to check it off as you ask it — the list resets fresh for each visit.",
      },
    ],
  },
  "1.0.9": {
    headline: "What's new in this update",
    items: [
      {
        icon: "calendar-outline",
        title: "Office Visits — crash fixed",
        body: "A native module conflict on iOS 26 that caused the Office Visits screen to crash has been fully resolved in this build.",
      },
    ],
  },
  "1.0.8": {
    headline: "What's new in this update",
    items: [
      {
        icon: "calendar-outline",
        title: "Prenatal Office Visits — fixed",
        body: "A crash that prevented the Office Visits screen from loading has been resolved. You can now log appointments, track vitals, and schedule reminders without issues.",
      },
    ],
  },
  "1.0.2": {
    headline: "What's new in this update",
    items: [
      {
        icon: "body-outline",
        title: "New: Maternal View",
        body: "Switch between Fetal and Maternal views on the Development tab to see how your body changes alongside your baby, week by week.",
      },
      {
        icon: "medkit-outline",
        title: "New: Clinical Reference",
        body: "Expand the Clinical Reference panel on any fetal stage for ultrasound biometry, developmental milestones, and clinical action notes.",
      },
    ],
  },
  "1.0.1": {
    headline: "What's new in this update",
    items: [
      {
        icon: "flash-outline",
        title: "Sign-in is now faster and more reliable",
        body: 'We fixed a timing issue that could leave you looking at a loading spinner after tapping "Sign In". You should be in instantly.',
      },
      {
        icon: "shield-checkmark-outline",
        title: "Fewer unexpected sign-outs",
        body: "Session handling is more resilient, so you stay signed in across app restarts.",
      },
    ],
  },
};

/**
 * The What's New entry for `version` as it should appear on `platform`, with
 * items for other platforms removed. Returns null when nothing is left, so the
 * sheet is skipped (and marked seen) rather than shown empty.
 */
export function getWhatsNew(
  version: string,
  platform: string,
): WhatsNewEntry | null {
  const entry = WHATS_NEW[version];
  if (!entry) return null;
  const items = entry.items.filter(
    (item) =>
      !item.platforms || item.platforms.includes(platform as WhatsNewPlatform),
  );
  if (items.length === 0) return null;
  return { ...entry, items };
}
