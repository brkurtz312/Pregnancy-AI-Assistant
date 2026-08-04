/**
 * Unit tests for lib/custom-reminders.ts
 *
 * expo-notifications is a native-only binary module absent from the test
 * environment. We register a virtual Jest mock so the safe-require inside
 * custom-reminders.ts resolves and Notifications is non-null during tests.
 *
 * Scenarios covered:
 *  - createReminder: one-time reminder with FUTURE date schedules a notification
 *  - createReminder: one-time reminder with PAST date does NOT schedule
 *  - createReminder: daily repeat with past anchor DOES schedule (next occurrence)
 *  - createReminder: weekly repeat with past anchor DOES schedule (next occurrence)
 *  - updateReminder: cancels old notification and schedules a new one
 *  - deleteReminder: cancels the stored notification and removes from storage
 *  - clearAllCustomReminders: cancels notifications and wipes storage on native
 *  - clearAllCustomReminders: always wipes storage even on web (no native cancel)
 *  - Sign-out / account-switch: after clear, a new user sees empty reminders
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

// ---------------------------------------------------------------------------
// Virtual mock for expo-notifications
// ---------------------------------------------------------------------------
jest.mock(
  "expo-notifications",
  () => ({
    SchedulableTriggerInputTypes: {
      DATE: "date",
      DAILY: "daily",
      WEEKLY: "weekly",
    },
    scheduleNotificationAsync: jest.fn(async () => "notif-id-0"),
    cancelScheduledNotificationAsync: jest.fn(async () => {}),
    setNotificationHandler: jest.fn(),
  }),
  { virtual: true },
);

const mockNotifications = jest.requireMock("expo-notifications") as {
  scheduleNotificationAsync: jest.Mock;
  cancelScheduledNotificationAsync: jest.Mock;
};

// ---------------------------------------------------------------------------
// Mock react-native Platform so we can toggle web vs native
// ---------------------------------------------------------------------------
jest.mock("react-native", () => ({
  Platform: { OS: "ios" },
}));

import { Platform } from "react-native";

// ---------------------------------------------------------------------------
// Module under test — imported AFTER mocks
// ---------------------------------------------------------------------------
import {
  loadReminders,
  createReminder,
  updateReminder,
  deleteReminder,
  clearAllCustomReminders,
} from "@/lib/custom-reminders";

const STORAGE_KEY = "@custom_reminders_v1";

function futureDate(minutesFromNow = 60): string {
  return new Date(Date.now() + minutesFromNow * 60_000).toISOString();
}

function pastDate(minutesAgo = 30): string {
  return new Date(Date.now() - minutesAgo * 60_000).toISOString();
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  // Reset to native platform for most tests.
  (Platform as { OS: string }).OS = "ios";
  mockNotifications.scheduleNotificationAsync.mockResolvedValue("notif-id-1");
});

// ---------------------------------------------------------------------------
// createReminder — one-time
// ---------------------------------------------------------------------------

describe("createReminder — one-time", () => {
  it("schedules a notification for a future date", async () => {
    const reminder = await createReminder({
      title: "Take vitamins",
      scheduledAt: futureDate(60),
      repeat: "none",
    });

    expect(mockNotifications.scheduleNotificationAsync).toHaveBeenCalledTimes(
      1,
    );
    expect(reminder.notifId).toBe("notif-id-1");

    const stored = await loadReminders();
    expect(stored).toHaveLength(1);
    expect(stored[0].title).toBe("Take vitamins");
  });

  it("does NOT schedule a notification for a past date", async () => {
    const reminder = await createReminder({
      title: "Missed appointment",
      scheduledAt: pastDate(60),
      repeat: "none",
    });

    expect(mockNotifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    expect(reminder.notifId).toBeUndefined();

    // Reminder is still persisted in storage.
    const stored = await loadReminders();
    expect(stored).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// createReminder — recurring (past anchor should still schedule)
// ---------------------------------------------------------------------------

describe("createReminder — recurring with past anchor time", () => {
  it("schedules a daily repeat even when scheduledAt is in the past", async () => {
    const reminder = await createReminder({
      title: "Iron supplement",
      scheduledAt: pastDate(30),
      repeat: "daily",
    });

    expect(mockNotifications.scheduleNotificationAsync).toHaveBeenCalledTimes(
      1,
    );
    expect(reminder.notifId).toBe("notif-id-1");

    const [call] = mockNotifications.scheduleNotificationAsync.mock.calls;
    expect(call[0].trigger.type).toBe("daily");
  });

  it("schedules a weekly repeat even when scheduledAt is in the past", async () => {
    const reminder = await createReminder({
      title: "Prenatal yoga",
      scheduledAt: pastDate(120),
      repeat: "weekly",
    });

    expect(mockNotifications.scheduleNotificationAsync).toHaveBeenCalledTimes(
      1,
    );
    expect(reminder.notifId).toBe("notif-id-1");

    const [call] = mockNotifications.scheduleNotificationAsync.mock.calls;
    expect(call[0].trigger.type).toBe("weekly");
  });
});

// ---------------------------------------------------------------------------
// updateReminder
// ---------------------------------------------------------------------------

describe("updateReminder", () => {
  it("cancels the old notification and schedules a new one", async () => {
    mockNotifications.scheduleNotificationAsync
      .mockResolvedValueOnce("notif-old")
      .mockResolvedValueOnce("notif-new");

    const original = await createReminder({
      title: "Old title",
      scheduledAt: futureDate(60),
      repeat: "none",
    });

    const updated = await updateReminder({
      ...original,
      title: "New title",
      scheduledAt: futureDate(120),
    });

    expect(
      mockNotifications.cancelScheduledNotificationAsync,
    ).toHaveBeenCalledWith("notif-old");
    expect(updated.notifId).toBe("notif-new");

    const stored = await loadReminders();
    expect(stored).toHaveLength(1);
    expect(stored[0].title).toBe("New title");
    expect(stored[0].notifId).toBe("notif-new");
  });
});

// ---------------------------------------------------------------------------
// deleteReminder
// ---------------------------------------------------------------------------

describe("deleteReminder", () => {
  it("cancels the notification and removes the reminder from storage", async () => {
    mockNotifications.scheduleNotificationAsync.mockResolvedValueOnce(
      "notif-to-delete",
    );

    const reminder = await createReminder({
      title: "To delete",
      scheduledAt: futureDate(60),
      repeat: "none",
    });

    await deleteReminder(reminder.id);

    expect(
      mockNotifications.cancelScheduledNotificationAsync,
    ).toHaveBeenCalledWith("notif-to-delete");

    const stored = await loadReminders();
    expect(stored).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// clearAllCustomReminders — native platform
// ---------------------------------------------------------------------------

describe("clearAllCustomReminders — native (iOS)", () => {
  it("cancels all notification IDs and wipes storage", async () => {
    mockNotifications.scheduleNotificationAsync
      .mockResolvedValueOnce("notif-A")
      .mockResolvedValueOnce("notif-B");

    await createReminder({
      title: "Reminder A",
      scheduledAt: futureDate(30),
      repeat: "none",
    });
    await createReminder({
      title: "Reminder B",
      scheduledAt: futureDate(60),
      repeat: "daily",
    });

    jest.clearAllMocks();
    await clearAllCustomReminders();

    expect(
      mockNotifications.cancelScheduledNotificationAsync,
    ).toHaveBeenCalledWith("notif-A");
    expect(
      mockNotifications.cancelScheduledNotificationAsync,
    ).toHaveBeenCalledWith("notif-B");

    expect(await AsyncStorage.getItem(STORAGE_KEY)).toBeNull();
    const stored = await loadReminders();
    expect(stored).toHaveLength(0);
  });

  it("is a no-op on notifications but still clears storage when there are no reminders", async () => {
    await clearAllCustomReminders();

    expect(
      mockNotifications.cancelScheduledNotificationAsync,
    ).not.toHaveBeenCalled();
    expect(await AsyncStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// clearAllCustomReminders — web platform (no native cancellation)
// ---------------------------------------------------------------------------

describe("clearAllCustomReminders — web platform", () => {
  beforeEach(() => {
    (Platform as { OS: string }).OS = "web";
  });

  it("always wipes storage even when Platform.OS is web", async () => {
    // Seed storage directly to simulate a prior session on web.
    const seed = [
      {
        id: "r1",
        title: "Old web reminder",
        scheduledAt: futureDate(60),
        repeat: "none",
        notifId: "notif-web-1",
      },
    ];
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(seed));

    await clearAllCustomReminders();

    // Storage must be wiped.
    expect(await AsyncStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("does NOT call cancelScheduledNotificationAsync on web", async () => {
    const seed = [
      {
        id: "r1",
        title: "Old",
        scheduledAt: futureDate(60),
        repeat: "none",
        notifId: "notif-web-2",
      },
    ];
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(seed));

    await clearAllCustomReminders();

    expect(
      mockNotifications.cancelScheduledNotificationAsync,
    ).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Sign-out / account-switch storage isolation
// ---------------------------------------------------------------------------

describe("sign-out / account-switch isolation", () => {
  it("after clearAllCustomReminders, a new user session sees no reminders", async () => {
    // User A creates a reminder.
    await createReminder({
      title: "User A reminder",
      scheduledAt: futureDate(60),
      repeat: "none",
    });
    expect(await loadReminders()).toHaveLength(1);

    // Sign-out (as AuthTokenBridge does).
    await clearAllCustomReminders();

    // User B signs in — storage must be empty.
    const stored = await loadReminders();
    expect(stored).toHaveLength(0);
  });

  it("after clearAllCustomReminders, a new reminder from the next user is isolated", async () => {
    // User A creates a reminder and signs out.
    await createReminder({
      title: "User A",
      scheduledAt: futureDate(60),
      repeat: "none",
    });
    await clearAllCustomReminders();

    // User B creates their own reminder.
    jest.clearAllMocks();
    mockNotifications.scheduleNotificationAsync.mockResolvedValueOnce(
      "notif-userB",
    );
    await createReminder({
      title: "User B",
      scheduledAt: futureDate(90),
      repeat: "none",
    });

    const stored = await loadReminders();
    expect(stored).toHaveLength(1);
    expect(stored[0].title).toBe("User B");
  });
});
