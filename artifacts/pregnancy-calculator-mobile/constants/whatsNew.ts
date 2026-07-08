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
