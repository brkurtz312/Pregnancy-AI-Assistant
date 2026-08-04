/**
 * Automatic pregnancy milestone notifications.
 *
 * Schedules local notifications for key gestational-week milestones derived
 * from the user's due date (anatomy scan, third-trimester start, GBS test,
 * etc.).  Tapping a notification deep-links into the relevant in-app screen
 * via the `url` field stored in the notification data payload.
 *
 * Uses the same safe-require guard as appointment-reminders.ts so that a
 * missing or mismatched native module never crashes the app.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { PREGNANCY_DURATION_DAYS } from "./pregnancy-math";

const STORAGE_KEY = "@milestone_notif_v1";

// ---------------------------------------------------------------------------
// Safe-require
// ---------------------------------------------------------------------------

let Notifications: typeof import("expo-notifications") | null = null;
try {
  Notifications = require("expo-notifications");
} catch {
  // Native module unavailable — all functions below will be no-ops.
}

// ---------------------------------------------------------------------------
// Milestone schedule
// ---------------------------------------------------------------------------

export interface MilestoneDefinition {
  /** Gestational week at which the notification fires (start-of-week). */
  week: number;
  title: string;
  body: string;
  /**
   * Expo Router path to open when the user taps the notification.
   * Stored in notification.request.content.data.url so the tap handler in
   * _layout.tsx can call router.push(url).
   */
  url: string;
}

/**
 * Key pregnancy milestones.  Notification fires at 9 AM on the first day the
 * user reaches that gestational week.
 */
export const MILESTONE_SCHEDULE: MilestoneDefinition[] = [
  {
    week: 10,
    title: "First Trimester Screening",
    body: "Week 10 — first-trimester blood tests and nuchal translucency ultrasound are typically offered now. Tap to learn more.",
    url: "/prenatal-testing",
  },
  {
    week: 13,
    title: "Almost at the End of Your First Trimester 🎉",
    body: "Week 13 — the first trimester is nearly over. Energy usually returns and nausea begins to ease.",
    url: "/development",
  },
  {
    week: 18,
    title: "Anatomy Scan Window Opens",
    body: "Week 18 — the 18–20 week anatomy scan is coming up. This detailed ultrasound checks all major organs.",
    url: "/development",
  },
  {
    week: 20,
    title: "Halfway There! 🎉",
    body: "Week 20 — you're at the halfway point! The anatomy scan is typically done around this week.",
    url: "/development",
  },
  {
    week: 24,
    title: "Viability Milestone This Week",
    body: "Week 24 — a significant milestone. Gestational diabetes screening is also offered around now.",
    url: "/development",
  },
  {
    week: 28,
    title: "Welcome to Your Third Trimester",
    body: "Week 28 — the final stretch begins! Prenatal visits now increase to every two weeks.",
    url: "/development",
  },
  {
    week: 35,
    title: "Group B Strep Test Coming Up",
    body: "Week 35 — your Group B Strep (GBS) swab is typically done between weeks 36–37. Ask your provider at your next visit.",
    url: "/prenatal-testing",
  },
  {
    week: 36,
    title: "Almost There — Weekly Visits Begin",
    body: "Week 36 — prenatal appointments move to weekly from now until delivery. You're in the final stretch!",
    url: "/development",
  },
];

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

interface MilestoneState {
  /** ISO date string of the due date these notifications were scheduled for. */
  dueDate: string;
  /** Map of gestational week → expo notification identifier. */
  notifIds: Record<number, string>;
}

async function readState(): Promise<MilestoneState | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as MilestoneState) : null;
  } catch {
    return null;
  }
}

async function writeState(state: MilestoneState): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // best-effort
  }
}

async function clearState(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // best-effort
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Cancel all previously scheduled milestone notifications and clear persisted
 * state.  Call on sign-out or before rescheduling after a due-date change.
 */
export async function cancelAllMilestoneNotifications(): Promise<void> {
  if (Platform.OS === "web") return;
  const state = await readState();
  if (!state) return;
  if (Notifications) {
    for (const notifId of Object.values(state.notifIds)) {
      try {
        await Notifications.cancelScheduledNotificationAsync(notifId);
      } catch {
        // best-effort — keep iterating even if one cancellation fails
      }
    }
  }
  await clearState();
}

/**
 * Set of known in-app routes that milestone notifications are allowed to
 * deep-link to.  Used as an allow-list when routing notification taps, so
 * that arbitrary URLs in a notification payload cannot hijack navigation.
 */
export const MILESTONE_KNOWN_URLS = new Set(
  MILESTONE_SCHEDULE.map((m) => m.url),
);

/**
 * Return the in-app URL from a notification response, or null if the URL is
 * absent or not in the allow-list of known milestone routes.
 */
function extractMilestoneUrl(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  response: any,
): string | null {
  const url = response?.notification?.request?.content?.data?.url;
  if (
    typeof url === "string" &&
    url.length > 0 &&
    MILESTONE_KNOWN_URLS.has(url)
  ) {
    return url;
  }
  return null;
}

/**
 * Register a listener that fires whenever the user taps a milestone
 * notification while the app is foregrounded or backgrounded.  The `handler`
 * receives the validated in-app URL stored in the notification's data payload.
 * Returns a cleanup function — call it from a useEffect cleanup.
 *
 * For cold-start taps (app launched from a terminated state by a notification),
 * use `getInitialMilestoneNotificationUrl()` instead on mount.
 *
 * Safe no-op on web or when expo-notifications is unavailable.
 */
export function addNotificationTapListener(
  handler: (url: string) => void,
): () => void {
  if (!Notifications || Platform.OS === "web") return () => {};
  try {
    const subscription = Notifications.addNotificationResponseReceivedListener(
      // expo-notifications module type is unresolved by TS (same as
      // appointment-reminders.ts); cast to any so the parameter is typed.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (response: any) => {
        const url = extractMilestoneUrl(response);
        if (url) handler(url);
      },
    );
    return () => subscription.remove();
  } catch {
    return () => {};
  }
}

/**
 * Read the last notification response that was pending when the app launched
 * (cold-start tap).  Returns the validated in-app URL, or null if there is no
 * pending response or its URL is not a known milestone route.
 *
 * Call once on mount (after the router is ready) to handle the case where a
 * user taps a milestone notification that launches a terminated app.
 *
 * Safe no-op on web or when expo-notifications is unavailable.
 */
export async function getInitialMilestoneNotificationUrl(): Promise<
  string | null
> {
  if (!Notifications || Platform.OS === "web") return null;
  try {
    const response = await Notifications.getLastNotificationResponseAsync();
    return extractMilestoneUrl(response);
  } catch {
    return null;
  }
}

/**
 * Schedule local notifications for all upcoming milestones based on the
 * user's due date.
 *
 * - Idempotent: if the due date hasn't changed since the last call, exits
 *   immediately without scheduling duplicates.
 * - On a due-date change: cancels all previously scheduled milestones and
 *   reschedules from scratch.
 * - Only schedules milestones whose notification date is still in the future.
 *
 * Safe no-op on web or when expo-notifications is unavailable.
 */
export async function scheduleMilestoneNotifications(
  dueDate: Date,
): Promise<void> {
  if (!Notifications || Platform.OS === "web") return;

  const dueDateISO = dueDate.toISOString().slice(0, 10);
  const existing = await readState();

  // If due date hasn't changed, nothing to do.
  if (existing?.dueDate === dueDateISO) return;

  // Due date changed (or first run) — cancel old notifications first.
  if (existing) {
    for (const notifId of Object.values(existing.notifIds)) {
      try {
        await Notifications.cancelScheduledNotificationAsync(notifId);
      } catch {
        // best-effort
      }
    }
  }

  const notifIds: Record<number, string> = {};
  const now = Date.now();

  for (const milestone of MILESTONE_SCHEDULE) {
    // Notification fires at 9 AM on the first day of the milestone week.
    // milestone week start = dueDate − (PREGNANCY_DURATION_DAYS − week * 7)
    const daysFromToday = PREGNANCY_DURATION_DAYS - milestone.week * 7;
    const milestoneDate = new Date(dueDate);
    milestoneDate.setDate(milestoneDate.getDate() - daysFromToday);
    milestoneDate.setHours(9, 0, 0, 0);

    // Skip milestones that are already past.
    if (milestoneDate.getTime() <= now) continue;

    try {
      const notifId = await Notifications.scheduleNotificationAsync({
        content: {
          title: milestone.title,
          body: milestone.body,
          sound: true,
          data: { url: milestone.url },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: milestoneDate,
        },
      });
      notifIds[milestone.week] = notifId;
    } catch {
      // best-effort — a single scheduling failure should not block the rest
    }
  }

  await writeState({ dueDate: dueDateISO, notifIds });
}
