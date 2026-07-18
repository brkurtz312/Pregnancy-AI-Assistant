/**
 * Local notification scheduling for prenatal appointment reminders.
 *
 * NOTE: expo-notifications@57 is installed while the binary is Expo SDK 54.
 * On iOS 26, this version mismatch triggers a native TurboModule crash that
 * cannot be caught in JavaScript. All functions here are no-ops until a new
 * native build is made with the correct expo-notifications version (~0.32.17).
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

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
 * No-op until expo-notifications is version-aligned with the binary.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  return false;
}

/**
 * Schedule a day-before reminder for a future appointment.
 * No-op until expo-notifications is version-aligned with the binary.
 */
export async function scheduleAppointmentReminder(
  _appointmentId: number,
  _appointmentDate: Date,
  _gestationalWeeks: number,
): Promise<void> {
  if (Platform.OS === "web") return;
  // expo-notifications@57 cannot be safely required in SDK 54 binary on iOS 26.
  // Reminders will resume after the SDK 57 upgrade.
}

/**
 * Cancel a previously scheduled reminder.
 * Clears any persisted mapping but does not call expo-notifications.
 */
export async function cancelAppointmentReminder(
  appointmentId: number,
): Promise<void> {
  if (Platform.OS === "web") return;
  const map = await readMap();
  if (map[String(appointmentId)]) {
    delete map[String(appointmentId)];
    await writeMap(map);
  }
}

/**
 * Cancel all scheduled appointment reminders (e.g. on sign-out).
 * Clears persisted mapping only.
 */
export async function cancelAllAppointmentReminders(): Promise<void> {
  await writeMap({});
}
