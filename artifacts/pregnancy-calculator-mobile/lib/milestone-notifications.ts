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
const PREFS_KEY = "@milestone_prefs_v1";

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
// Serialization of mutations
//
// All operations that read-modify-write the scheduled notifications or the
// persisted state/preferences run through a single promise queue so they can
// never interleave (e.g. an in-flight resync scheduling notifications after a
// sign-out cancellation started).  A generation counter — bumped synchronously
// when sign-out cancellation is REQUESTED — additionally invalidates any
// already-queued schedule/resync work from the previous session so it becomes
// a no-op instead of scheduling and then being cancelled.
// ---------------------------------------------------------------------------

let opChain: Promise<unknown> = Promise.resolve();
let generation = 0;

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const run = opChain.then(fn, fn);
  // Keep the chain alive regardless of individual op failures.
  opChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

// ---------------------------------------------------------------------------
// Preferences
// ---------------------------------------------------------------------------

export interface MilestonePreferences {
  /** Master switch — when false, no milestone notifications are scheduled. */
  masterEnabled: boolean;
  /** Gestational weeks the user has individually disabled. */
  disabledWeeks: number[];
}

export const DEFAULT_MILESTONE_PREFERENCES: MilestonePreferences = {
  masterEnabled: true,
  disabledWeeks: [],
};

/** Read persisted milestone notification preferences (defaults if unset). */
export async function readMilestonePreferences(): Promise<MilestonePreferences> {
  try {
    const raw = await AsyncStorage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_MILESTONE_PREFERENCES };
    const parsed = JSON.parse(raw) as Partial<MilestonePreferences>;
    return {
      masterEnabled:
        typeof parsed.masterEnabled === "boolean" ? parsed.masterEnabled : true,
      disabledWeeks: Array.isArray(parsed.disabledWeeks)
        ? parsed.disabledWeeks.filter((w): w is number => typeof w === "number")
        : [],
    };
  } catch {
    return { ...DEFAULT_MILESTONE_PREFERENCES };
  }
}

/** Persist milestone notification preferences. */
export async function writeMilestonePreferences(
  prefs: MilestonePreferences,
): Promise<void> {
  try {
    await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // best-effort
  }
}

async function clearMilestonePreferences(): Promise<void> {
  try {
    await AsyncStorage.removeItem(PREFS_KEY);
  } catch {
    // best-effort
  }
}

/** True when the given milestone week should be scheduled under `prefs`. */
export function isMilestoneEnabled(
  prefs: MilestonePreferences,
  week: number,
): boolean {
  return prefs.masterEnabled && !prefs.disabledWeeks.includes(week);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Cancel all previously scheduled milestone notifications and clear persisted
 * state.  Call on sign-out or before rescheduling after a due-date change.
 */
export function cancelAllMilestoneNotifications(): Promise<void> {
  // Invalidate any queued/in-flight schedule/resync work from the previous
  // session synchronously, before this cancellation is even queued.
  generation += 1;
  return enqueue(async () => {
    // Preferences are user-scoped: always clear them on sign-out — on EVERY
    // platform, including web — so they never leak to the next account on a
    // shared device.
    await clearMilestonePreferences();
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
  });
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
export function scheduleMilestoneNotifications(dueDate: Date): Promise<void> {
  const gen = generation;
  return enqueue(async () => {
    // A sign-out happened after this scheduling was requested — the request
    // belongs to the previous session, so drop it.
    if (gen !== generation) return;
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

    const prefs = await readMilestonePreferences();
    const notifIds = await scheduleForDueDate(dueDate, prefs);
    await writeState({ dueDate: dueDateISO, notifIds });
  });
}

/**
 * Return the local trigger date (9 AM, first day of the milestone week) for a
 * milestone given the user's due date.
 */
export function getMilestoneDate(dueDate: Date, week: number): Date {
  const daysFromToday = PREGNANCY_DURATION_DAYS - week * 7;
  const milestoneDate = new Date(dueDate);
  milestoneDate.setDate(milestoneDate.getDate() - daysFromToday);
  milestoneDate.setHours(9, 0, 0, 0);
  return milestoneDate;
}

/** Schedule all enabled, still-future milestones. Returns week → notif id. */
async function scheduleForDueDate(
  dueDate: Date,
  prefs: MilestonePreferences,
): Promise<Record<number, string>> {
  const notifIds: Record<number, string> = {};
  if (!Notifications) return notifIds;
  const now = Date.now();

  for (const milestone of MILESTONE_SCHEDULE) {
    // Skip milestones the user has disabled (individually or via master).
    if (!isMilestoneEnabled(prefs, milestone.week)) continue;

    const milestoneDate = getMilestoneDate(dueDate, milestone.week);

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
      // Guard against a falsy id (some platforms/mocks may return
      // undefined) — storing it would silently drop the entry on JSON
      // round-trip and make the notification uncancellable.
      if (notifId) notifIds[milestone.week] = notifId;
    } catch {
      // best-effort — a single scheduling failure should not block the rest
    }
  }

  return notifIds;
}

/**
 * Re-apply the current milestone preferences to the already-scheduled
 * notifications: cancels everything previously scheduled and reschedules
 * only the milestones that are enabled and still in the future.
 *
 * Call after any preference change.  No-op if milestones have never been
 * scheduled (no stored due date), on web, or when expo-notifications is
 * unavailable.
 */
export function resyncMilestoneNotifications(): Promise<void> {
  const gen = generation;
  return enqueue(() => resyncLocked(gen));
}

async function resyncLocked(gen: number): Promise<void> {
  // A sign-out happened after this resync was requested — drop it so it
  // cannot re-schedule the previous user's reminders.
  if (gen !== generation) return;
  if (!Notifications || Platform.OS === "web") return;
  const state = await readState();
  if (!state) return;

  for (const notifId of Object.values(state.notifIds)) {
    try {
      await Notifications.cancelScheduledNotificationAsync(notifId);
    } catch {
      // best-effort
    }
  }

  // Parse the stored YYYY-MM-DD as a LOCAL date (new Date("YYYY-MM-DD")
  // would parse as UTC midnight and can shift the day in negative-offset
  // timezones).
  const [y, m, d] = state.dueDate.split("-").map(Number);
  const dueDate = new Date(y!, m! - 1, d!, 12, 0, 0, 0);

  const prefs = await readMilestonePreferences();
  const notifIds = await scheduleForDueDate(dueDate, prefs);
  await writeState({ dueDate: state.dueDate, notifIds });
}

/**
 * Atomically update the persisted milestone preferences and re-apply them to
 * the scheduled notifications.  The read-modify-write and the resync run as
 * one serialized operation, so rapid successive toggles cannot interleave and
 * a sign-out requested before this update runs invalidates it entirely.
 */
export function updateMilestonePreferences(
  update: (current: MilestonePreferences) => MilestonePreferences,
): Promise<MilestonePreferences | null> {
  const gen = generation;
  return enqueue(async () => {
    // Sign-out was requested after this update — the toggle belonged to the
    // previous session; do not re-persist its preferences.
    if (gen !== generation) return null;
    const current = await readMilestonePreferences();
    const next = update(current);
    await writeMilestonePreferences(next);
    await resyncLocked(gen);
    return next;
  });
}
