/**
 * Local notification scheduling for prenatal appointment reminders.
 *
 * The day before each upcoming appointment, the user receives a local
 * notification at 9 am with a summary of what to expect based on their
 * gestational age at that visit.
 *
 * Notification IDs are persisted in AsyncStorage so they can be cancelled
 * when an appointment is deleted or rescheduled.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

import { getVisitExpectation } from "@/constants/prenatal-visit-expectations";

// Safe guard: expo-notifications native module may not initialize correctly
// when there is a version mismatch between the JS package and the native
// binary (e.g. expo-notifications@57 installed while the binary was built
// with Expo SDK 54). A module-level crash here propagates to office-visit.tsx
// and brings down the whole screen. Wrapping in try/catch prevents that.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NotificationsModule = typeof import("expo-notifications");
const Notifications: NotificationsModule | null = (() => {
  try {
    return require("expo-notifications") as NotificationsModule;
  } catch {
    return null;
  }
})();

const STORAGE_KEY = "@appointment_notif_ids_v1";

type NotifMap = Record<string, string>;

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
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === "web" || !Notifications) return false;
  // expo-notifications' PermissionResponse has `granted` at runtime even
  // though TS types from the 'expo' base class don't always expose it.
  type Granted = { granted: boolean };
  const existing =
    (await Notifications.getPermissionsAsync()) as unknown as Granted;
  if (existing.granted) return true;
  const result =
    (await Notifications.requestPermissionsAsync()) as unknown as Granted;
  return result.granted;
}

/**
 * Schedule a day-before reminder for a future appointment.
 *
 * @param appointmentId  DB id of the prenatal visit row
 * @param appointmentDate  The appointment date/time
 * @param gestationalWeeks  Expected gestational week at the appointment
 *
 * Silently no-ops if:
 *  – the appointment is today or in the past
 *  – the platform is web
 *  – notification permission is not granted
 *  – expo-notifications native module is unavailable
 */
export async function scheduleAppointmentReminder(
  appointmentId: number,
  appointmentDate: Date,
  gestationalWeeks: number,
): Promise<void> {
  if (Platform.OS === "web" || !Notifications) return;

  // Fire at 9 am the day before the appointment
  const reminderDate = new Date(appointmentDate);
  reminderDate.setDate(reminderDate.getDate() - 1);
  reminderDate.setHours(9, 0, 0, 0);

  // Don't schedule if the reminder time is in the past
  if (reminderDate.getTime() <= Date.now()) return;

  const granted = await requestNotificationPermission();
  if (!granted) return;

  const expectation = getVisitExpectation(gestationalWeeks);
  const apptTime = appointmentDate.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

  try {
    const notifId = await Notifications.scheduleNotificationAsync({
      content: {
        title: "Appointment Tomorrow 🩺",
        body: `Your prenatal visit is tomorrow at ${apptTime}. At ${gestationalWeeks} weeks your provider may discuss: ${expectation.highlights[0]}.`,
        data: {
          appointmentId,
          screen: "/office-visit",
        },
      },
      trigger: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        type: (Notifications as any).SchedulableTriggerInputTypes?.DATE ?? "date",
        date: reminderDate,
      },
    });

    // Persist the mapping so we can cancel later
    const map = await readMap();
    map[String(appointmentId)] = notifId;
    await writeMap(map);
  } catch {
    // Notification scheduling failed — silently ignore so the appointment
    // save still completes.
  }
}

/**
 * Cancel a previously scheduled reminder.
 * Safe to call even if no reminder was scheduled.
 */
export async function cancelAppointmentReminder(
  appointmentId: number,
): Promise<void> {
  if (Platform.OS === "web" || !Notifications) return;
  const map = await readMap();
  const notifId = map[String(appointmentId)];
  if (notifId) {
    try {
      await Notifications.cancelScheduledNotificationAsync(notifId);
    } catch {
      // Already fired or invalid — ignore
    }
    delete map[String(appointmentId)];
    await writeMap(map);
  }
}

/**
 * Cancel all scheduled appointment reminders (e.g. on sign-out).
 */
export async function cancelAllAppointmentReminders(): Promise<void> {
  if (Platform.OS === "web" || !Notifications) return;
  const map = await readMap();
  await Promise.all(
    Object.values(map).map((id) =>
      Notifications!.cancelScheduledNotificationAsync(id).catch(() => {}),
    ),
  );
  await writeMap({});
}
