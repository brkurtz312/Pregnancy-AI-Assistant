/**
 * Custom user-created reminders.
 *
 * Stores reminders in AsyncStorage and schedules local notifications using
 * the same safe-require guard as appointment-reminders.ts so that a missing
 * or mismatched native module never crashes the app at import time.
 *
 * All public functions degrade gracefully to storage-only when the
 * expo-notifications module is absent.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

const STORAGE_KEY = "@custom_reminders_v1";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RepeatInterval = "none" | "daily" | "weekly";

export interface CustomReminder {
  id: string;
  title: string;
  /** ISO date-time string of when the reminder should fire. */
  scheduledAt: string;
  repeat: RepeatInterval;
  /** expo-notifications identifier, stored so we can cancel later. */
  notifId?: string;
}

// ---------------------------------------------------------------------------
// Safe-require (lazy)
//
// Module-level eager require runs during the Jest worker's module evaluation
// and can execute before virtual mocks are registered, leaving Notifications
// null for the rest of the test file.  A lazy getter defers the require to
// the first actual call site so the mock is always in place by then.
// ---------------------------------------------------------------------------

let _notifications: typeof import("expo-notifications") | null | undefined =
  undefined;

function getNotifications(): typeof import("expo-notifications") | null {
  if (_notifications !== undefined) return _notifications;
  let resolved: typeof import("expo-notifications") | null = null;
  try {
    resolved = require("expo-notifications");
  } catch {
    // Native module unavailable — notifications will be skipped.
  }
  _notifications = resolved;
  return resolved;
}

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

async function readAll(): Promise<CustomReminder[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CustomReminder[]) : [];
  } catch {
    return [];
  }
}

async function writeAll(reminders: CustomReminder[]): Promise<void> {
  try {
    if (reminders.length === 0) {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } else {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(reminders));
    }
  } catch {
    // best-effort
  }
}

// ---------------------------------------------------------------------------
// Notification helpers
// ---------------------------------------------------------------------------

async function scheduleNotification(
  reminder: CustomReminder,
): Promise<string | undefined> {
  const Notifications = getNotifications();
  if (!Notifications || Platform.OS === "web") return undefined;

  const fireAt = new Date(reminder.scheduledAt);
  const isPast = fireAt.getTime() <= Date.now();

  // One-time reminders in the past can never fire — skip scheduling.
  // Recurring reminders use calendar triggers whose next occurrence is always
  // in the future even when the anchor time is already past, so allow them.
  if (isPast && reminder.repeat === "none") return undefined;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let trigger: any;

    if (reminder.repeat === "daily") {
      trigger = {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: fireAt.getHours(),
        minute: fireAt.getMinutes(),
      };
    } else if (reminder.repeat === "weekly") {
      trigger = {
        type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
        weekday: fireAt.getDay() + 1, // expo-notifications weekday is 1-indexed Sunday=1
        hour: fireAt.getHours(),
        minute: fireAt.getMinutes(),
      };
    } else {
      trigger = {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: fireAt,
      };
    }

    return await Notifications.scheduleNotificationAsync({
      content: {
        title: "Reminder",
        body: reminder.title,
        sound: true,
      },
      trigger,
    });
  } catch {
    return undefined;
  }
}

async function cancelNotification(notifId: string | undefined): Promise<void> {
  const Notifications = getNotifications();
  if (!notifId || !Notifications || Platform.OS === "web") return;
  try {
    await Notifications.cancelScheduledNotificationAsync(notifId);
  } catch {
    // best-effort
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load all stored custom reminders, sorted by scheduledAt ascending.
 */
export async function loadReminders(): Promise<CustomReminder[]> {
  const list = await readAll();
  return list.sort(
    (a, b) =>
      new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
  );
}

/**
 * Create a new custom reminder and schedule its notification.
 * Returns the saved reminder (with notifId populated if scheduling succeeded).
 */
export async function createReminder(
  input: Omit<CustomReminder, "id" | "notifId">,
): Promise<CustomReminder> {
  const reminder: CustomReminder = {
    ...input,
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  };

  reminder.notifId = await scheduleNotification(reminder);

  const list = await readAll();
  list.push(reminder);
  await writeAll(list);

  return reminder;
}

/**
 * Update an existing reminder (e.g. after editing title or date).
 * Cancels the old notification and schedules a new one.
 */
export async function updateReminder(
  updated: CustomReminder,
): Promise<CustomReminder> {
  const list = await readAll();
  const idx = list.findIndex((r) => r.id === updated.id);
  if (idx === -1) return updated;

  // Cancel the old notification.
  await cancelNotification(list[idx].notifId);

  // Schedule a fresh notification.
  const withNewNotif: CustomReminder = {
    ...updated,
    notifId: await scheduleNotification(updated),
  };

  list[idx] = withNewNotif;
  await writeAll(list);

  return withNewNotif;
}

/**
 * Delete a reminder and cancel its notification.
 */
export async function deleteReminder(id: string): Promise<void> {
  const list = await readAll();
  const target = list.find((r) => r.id === id);
  if (target?.notifId) {
    await cancelNotification(target.notifId);
  }
  await writeAll(list.filter((r) => r.id !== id));
}

/**
 * Cancel all custom reminder notifications and clear storage.
 * Call on sign-out so reminders cannot fire for the next user on a shared device.
 *
 * Storage is always cleared on every platform so that a subsequent sign-in
 * (same or different user) never sees the previous user's reminders.
 * Native notification cancellation is only attempted on platforms that support it.
 */
export async function clearAllCustomReminders(): Promise<void> {
  const list = await readAll();
  // Cancel native notifications only where supported.
  if (Platform.OS !== "web") {
    for (const reminder of list) {
      await cancelNotification(reminder.notifId);
    }
  }
  // Always wipe storage regardless of platform.
  await writeAll([]);
}
