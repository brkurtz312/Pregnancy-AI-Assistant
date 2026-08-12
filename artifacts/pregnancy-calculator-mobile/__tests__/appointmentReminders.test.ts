/**
 * Unit tests for lib/appointment-reminders.ts
 *
 * expo-notifications is a native-only binary module absent from the test
 * environment. We register a virtual Jest mock so the safe-require inside
 * appointment-reminders.ts resolves and Notifications is non-null.
 *
 * Scenarios covered:
 *  - scheduleAppointmentReminder schedules at 9 AM the day before
 *  - notification body includes the gestational week count
 *  - notification ID is persisted to AsyncStorage under the appointment ID
 *  - cancelAppointmentReminder removes the entry and cancels the notification
 *  - no scheduling occurs when the reminder time is already past
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

// expo-notifications IS installed, so mock it non-virtually: jest resolves the
// real module path and registers the factory there, which keeps the mock in
// effect even when the safe-require inside appointment-reminders.ts runs in a
// fully-installed environment (a virtual mock can miss under that resolution).
jest.mock("expo-notifications", () => ({
  SchedulableTriggerInputTypes: { DATE: "date" },
  scheduleNotificationAsync: jest.fn(async () => "notif-id-1"),
  cancelScheduledNotificationAsync: jest.fn(async () => {}),
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
  requestPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
}));

const mockNotifications = jest.requireMock("expo-notifications") as {
  scheduleNotificationAsync: jest.Mock;
  cancelScheduledNotificationAsync: jest.Mock;
};

jest.mock("react-native", () => ({
  Platform: { OS: "ios" },
}));

// Module under test — imported AFTER mocks
import {
  scheduleAppointmentReminder,
  cancelAppointmentReminder,
} from "../lib/appointment-reminders";

const STORAGE_KEY = "@appointment_notif_ids_v1";

async function readStoredMap(): Promise<Record<string, string>> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : {};
}

function futureAppointment(): Date {
  // 10 days from now at 14:30 local time — reminder is safely in the future.
  const d = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
  d.setHours(14, 30, 0, 0);
  return d;
}

describe("appointment-reminders", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    mockNotifications.scheduleNotificationAsync.mockResolvedValue("notif-id-1");
  });

  it("schedules the reminder at 9 AM the day before the appointment", async () => {
    const appt = futureAppointment();
    await scheduleAppointmentReminder(42, appt, 24);

    expect(mockNotifications.scheduleNotificationAsync).toHaveBeenCalledTimes(
      1,
    );
    const arg = mockNotifications.scheduleNotificationAsync.mock.calls[0][0];
    expect(arg.trigger.type).toBe("date");

    const triggerDate: Date = arg.trigger.date;
    const expected = new Date(appt);
    expected.setDate(expected.getDate() - 1);
    expected.setHours(9, 0, 0, 0);
    expect(triggerDate.getTime()).toBe(expected.getTime());
  });

  it("includes the gestational week count in the notification body", async () => {
    await scheduleAppointmentReminder(42, futureAppointment(), 27);

    const arg = mockNotifications.scheduleNotificationAsync.mock.calls[0][0];
    expect(arg.content.body).toContain("week 27");
  });

  it("persists the notification ID under the appointment ID key", async () => {
    mockNotifications.scheduleNotificationAsync.mockResolvedValue(
      "notif-abc-123",
    );
    await scheduleAppointmentReminder(7, futureAppointment(), 24);

    const map = await readStoredMap();
    expect(map["7"]).toBe("notif-abc-123");
  });

  it("cancelAppointmentReminder cancels the notification and removes the stored entry", async () => {
    mockNotifications.scheduleNotificationAsync.mockResolvedValue(
      "notif-to-cancel",
    );
    await scheduleAppointmentReminder(9, futureAppointment(), 30);
    expect((await readStoredMap())["9"]).toBe("notif-to-cancel");

    await cancelAppointmentReminder(9);

    expect(
      mockNotifications.cancelScheduledNotificationAsync,
    ).toHaveBeenCalledWith("notif-to-cancel");
    expect((await readStoredMap())["9"]).toBeUndefined();
  });

  it("does not schedule when the reminder time is already past", async () => {
    // Appointment tomorrow at 8 AM → reminder would be 9 AM today only if
    // that is still ahead; use an appointment later today so the day-before
    // 9 AM reminder is definitely in the past.
    const appt = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2h from now
    await scheduleAppointmentReminder(5, appt, 20);

    expect(mockNotifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    expect((await readStoredMap())["5"]).toBeUndefined();
  });
});
