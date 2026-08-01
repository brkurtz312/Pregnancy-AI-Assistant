import { Ionicons } from "@expo/vector-icons";

export interface WhatsNewItem {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  title: string;
  body: string;
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
