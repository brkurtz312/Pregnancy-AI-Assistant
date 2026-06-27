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
