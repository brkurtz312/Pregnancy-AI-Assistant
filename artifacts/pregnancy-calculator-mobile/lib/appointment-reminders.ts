/**
 * Local notification scheduling for prenatal appointment reminders.
 *
 * Uses a safe IIFE require() so that a missing or mismatched native module
 * does not crash the process at import time (TurboModule lazy-init on iOS).
 * All public functions degrade gracefully to no-ops when the module is absent.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

const STORAGE_KEY = "@appointment_notif_ids_v1";

type NotifMap = Record<string, string>;

// Safe-require: catch any native TurboModule init failure so that importing
// this file on an incompatible binary does not hard-crash the app.
let Notifications: typeof import("expo-notifications") | null = null;
try {
  Notifications = require("expo-notifications");
} catch {
  // Native module unavailable — all functions below will be no-ops.
}

// Without a handler, expo-notifications suppresses foreground alerts by default.
// Register one at module load time (after the safe-require guard) so users see
// the reminder even when the app is open at the scheduled time.
if (Notifications) {
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  } catch {
    // best-effort — if the handler registration fails the module is unusable
    Notifications = null;
  }
}

async function readMap(): Promise<NotifMap> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as NotifMap) : {};
  } catch {
    return {};
  }
}

async function writeMap(map: NotifMap): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // best-effort
  }
}

/**
 * Request notification permissions.  Returns true if granted.
 * No-op and returns false when expo-notifications is unavailable.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!Notifications || Platform.OS === "web") return false;
  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    if (existing === "granted") return true;
    const { status } = await Notifications.requestPermissionsAsync();
    return status === "granted";
  } catch {
    return false;
  }
}

/**
 * Schedule a day-before reminder for a future appointment.
 * Persists the notification identifier so it can be cancelled later.
 * No-op when expo-notifications is unavailable or the reminder time is past.
 */
export async function scheduleAppointmentReminder(
  appointmentId: number,
  appointmentDate: Date,
  gestationalWeeks: number,
): Promise<void> {
  if (!Notifications || Platform.OS === "web") return;

  // Fire reminder at 9 AM the day before the appointment.
  const reminderDate = new Date(appointmentDate);
  reminderDate.setDate(reminderDate.getDate() - 1);
  reminderDate.setHours(9, 0, 0, 0);

  // Don't schedule if reminder time is already in the past.
  if (reminderDate.getTime() <= Date.now()) return;

  try {
    // Cancel any existing reminder for this appointment first.
    await cancelAppointmentReminder(appointmentId);

    const apptTimeStr = appointmentDate.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });

    const notifId = await Notifications.scheduleNotificationAsync({
      content: {
        title: "Prenatal Appointment Tomorrow",
        body: `Your prenatal appointment is tomorrow at ${apptTimeStr} (week ${gestationalWeeks}). Don't forget!`,
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: reminderDate,
      },
    });

    const map = await readMap();
    map[String(appointmentId)] = notifId;
    await writeMap(map);
  } catch {
    // best-effort — a scheduling failure should never block the save flow
  }
}

/**
 * Cancel a previously scheduled reminder for an appointment.
 * Clears the persisted identifier whether or not the module is available,
 * so the map stays clean even across binary upgrades.
 */
export async function cancelAppointmentReminder(
  appointmentId: number,
): Promise<void> {
  if (Platform.OS === "web") return;
  const map = await readMap();
  const notifId = map[String(appointmentId)];
  if (notifId) {
    if (Notifications) {
      try {
        await Notifications.cancelScheduledNotificationAsync(notifId);
      } catch {
        // best-effort
      }
    }
    delete map[String(appointmentId)];
    await writeMap(map);
  }
}

/**
 * Cancel all scheduled appointment reminders (e.g. on sign-out).
 *
 * Cancels each notification by its stored ID rather than calling
 * cancelAllScheduledNotificationsAsync(), which would also cancel unrelated
 * notifications the app may have scheduled for other purposes. Clears the
 * persisted map whether or not cancellation succeeds so that stale IDs do not
 * accumulate and cannot fire for a different user on a shared device.
 */
export async function cancelAllAppointmentReminders(): Promise<void> {
  if (Platform.OS === "web") return;
  const map = await readMap();
  if (Notifications) {
    for (const notifId of Object.values(map)) {
      try {
        await Notifications.cancelScheduledNotificationAsync(notifId);
      } catch {
        // best-effort — keep iterating even if one cancellation fails
      }
    }
  }
  await writeMap({});
}
