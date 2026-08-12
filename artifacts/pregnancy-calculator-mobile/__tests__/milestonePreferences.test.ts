/**
 * Unit tests for milestone notification preferences
 * (lib/milestone-notifications.ts).
 *
 * Scenarios covered:
 *  - readMilestonePreferences: defaults when unset / corrupt
 *  - writeMilestonePreferences round-trip
 *  - isMilestoneEnabled: master + per-week logic
 *  - scheduleMilestoneNotifications respects disabled weeks and master toggle
 *  - resyncMilestoneNotifications: cancels + reschedules per current prefs
 *  - resyncMilestoneNotifications: no-op without stored state
 *  - cancelAllMilestoneNotifications clears preferences (sign-out scope rule)
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

jest.mock(
  "expo-notifications",
  () => ({
    SchedulableTriggerInputTypes: { DATE: "date" },
    scheduleNotificationAsync: jest.fn(async () => "notif-id-0"),
    cancelScheduledNotificationAsync: jest.fn(async () => {}),
    addNotificationResponseReceivedListener: jest.fn(() => ({
      remove: jest.fn(),
    })),
    getLastNotificationResponseAsync: jest.fn(async () => null),
  }),
  { virtual: true },
);

const mockNotifications = jest.requireMock("expo-notifications") as {
  scheduleNotificationAsync: jest.Mock;
  cancelScheduledNotificationAsync: jest.Mock;
};

import {
  DEFAULT_MILESTONE_PREFERENCES,
  updateMilestonePreferences,
  MILESTONE_SCHEDULE,
  cancelAllMilestoneNotifications,
  isMilestoneEnabled,
  readMilestonePreferences,
  resyncMilestoneNotifications,
  scheduleMilestoneNotifications,
  writeMilestonePreferences,
} from "@/lib/milestone-notifications";

const STORAGE_KEY = "@milestone_notif_v1";
const PREFS_KEY = "@milestone_prefs_v1";

/** Build a due date that is N weeks away from today. */
function makeFutureDate(weeksUntilDue: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + weeksUntilDue * 7);
  d.setHours(12, 0, 0, 0);
  return d;
}

/** Weeks that would be scheduled (future) for a given due date. */
function futureWeeks(dueDate: Date): number[] {
  const now = Date.now();
  return MILESTONE_SCHEDULE.filter((m) => {
    const daysFromToday = 280 - m.week * 7;
    const d = new Date(dueDate);
    d.setDate(d.getDate() - daysFromToday);
    d.setHours(9, 0, 0, 0);
    return d.getTime() > now;
  }).map((m) => m.week);
}

let idCounter = 0;

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  idCounter = 0;
  mockNotifications.scheduleNotificationAsync.mockImplementation(
    async () => `notif-${++idCounter}`,
  );
});

describe("readMilestonePreferences / writeMilestonePreferences", () => {
  it("returns defaults when nothing is stored", async () => {
    expect(await readMilestonePreferences()).toEqual(
      DEFAULT_MILESTONE_PREFERENCES,
    );
  });

  it("returns defaults for corrupt JSON", async () => {
    await AsyncStorage.setItem(PREFS_KEY, "{not json");
    expect(await readMilestonePreferences()).toEqual(
      DEFAULT_MILESTONE_PREFERENCES,
    );
  });

  it("round-trips written preferences", async () => {
    await writeMilestonePreferences({
      masterEnabled: false,
      disabledWeeks: [20, 28],
    });
    expect(await readMilestonePreferences()).toEqual({
      masterEnabled: false,
      disabledWeeks: [20, 28],
    });
  });

  it("sanitizes malformed stored values", async () => {
    await AsyncStorage.setItem(
      PREFS_KEY,
      JSON.stringify({ masterEnabled: "yes", disabledWeeks: [20, "x", null] }),
    );
    expect(await readMilestonePreferences()).toEqual({
      masterEnabled: true,
      disabledWeeks: [20],
    });
  });
});

describe("isMilestoneEnabled", () => {
  it("is false for any week when master is off", () => {
    expect(
      isMilestoneEnabled({ masterEnabled: false, disabledWeeks: [] }, 20),
    ).toBe(false);
  });

  it("is false for individually disabled weeks", () => {
    expect(
      isMilestoneEnabled({ masterEnabled: true, disabledWeeks: [20] }, 20),
    ).toBe(false);
    expect(
      isMilestoneEnabled({ masterEnabled: true, disabledWeeks: [20] }, 24),
    ).toBe(true);
  });
});

describe("scheduleMilestoneNotifications with preferences", () => {
  it("skips individually disabled weeks", async () => {
    const dueDate = makeFutureDate(30); // most milestones are in the future
    const weeks = futureWeeks(dueDate);
    const disabled = weeks[0]!;
    await writeMilestonePreferences({
      masterEnabled: true,
      disabledWeeks: [disabled],
    });

    await scheduleMilestoneNotifications(dueDate);

    // Assert on the actual scheduling calls (robust against mock-return
    // quirks), then on the persisted state.
    const scheduledTitles =
      mockNotifications.scheduleNotificationAsync.mock.calls.map(
        (c) => (c[0] as { content: { title: string } }).content.title,
      );
    const disabledTitle = MILESTONE_SCHEDULE.find(
      (m) => m.week === disabled,
    )!.title;
    expect(scheduledTitles).not.toContain(disabledTitle);
    expect(scheduledTitles.length).toBe(weeks.length - 1);

    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const state = JSON.parse(raw!);
    expect(Object.keys(state.notifIds)).not.toContain(String(disabled));
    expect(Object.keys(state.notifIds).length).toBe(weeks.length - 1);
  });

  it("schedules nothing when the master toggle is off", async () => {
    await writeMilestonePreferences({
      masterEnabled: false,
      disabledWeeks: [],
    });

    await scheduleMilestoneNotifications(makeFutureDate(30));

    expect(mockNotifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    expect(JSON.parse(raw!).notifIds).toEqual({});
  });
});

describe("resyncMilestoneNotifications", () => {
  it("is a no-op when milestones were never scheduled", async () => {
    await resyncMilestoneNotifications();
    expect(mockNotifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    expect(
      mockNotifications.cancelScheduledNotificationAsync,
    ).not.toHaveBeenCalled();
  });

  it("cancels a newly disabled milestone and keeps the rest", async () => {
    const dueDate = makeFutureDate(30);
    const weeks = futureWeeks(dueDate);
    await scheduleMilestoneNotifications(dueDate);

    const before = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY))!);
    const oldIds = Object.values(before.notifIds) as string[];

    const disabled = weeks[1]!;
    await writeMilestonePreferences({
      masterEnabled: true,
      disabledWeeks: [disabled],
    });
    jest.clearAllMocks();
    mockNotifications.scheduleNotificationAsync.mockImplementation(
      async () => `notif-${++idCounter}`,
    );

    await resyncMilestoneNotifications();

    // Every previously scheduled notification was cancelled.
    for (const id of oldIds) {
      expect(
        mockNotifications.cancelScheduledNotificationAsync,
      ).toHaveBeenCalledWith(id);
    }

    const after = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY))!);
    expect(after.dueDate).toBe(before.dueDate);
    expect(Object.keys(after.notifIds)).not.toContain(String(disabled));
    expect(Object.keys(after.notifIds).length).toBe(weeks.length - 1);
  });

  it("cancels everything when master is turned off, reschedules when back on", async () => {
    const dueDate = makeFutureDate(30);
    const weeks = futureWeeks(dueDate);
    await scheduleMilestoneNotifications(dueDate);

    await writeMilestonePreferences({
      masterEnabled: false,
      disabledWeeks: [],
    });
    await resyncMilestoneNotifications();

    let state = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY))!);
    expect(state.notifIds).toEqual({});

    await writeMilestonePreferences({ masterEnabled: true, disabledWeeks: [] });
    await resyncMilestoneNotifications();

    state = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY))!);
    expect(Object.keys(state.notifIds).length).toBe(weeks.length);
  });
});

describe("race conditions (serialized mutation queue)", () => {
  it("rapid toggles compose: final state reflects both updates", async () => {
    const dueDate = makeFutureDate(30);
    const weeks = futureWeeks(dueDate);
    await scheduleMilestoneNotifications(dueDate);

    // Slow down scheduling so the two updates would interleave without the
    // queue.
    mockNotifications.scheduleNotificationAsync.mockImplementation(
      async () =>
        new Promise((resolve) =>
          setTimeout(() => resolve(`notif-${++idCounter}`), 5),
        ),
    );

    const wA = weeks[0]!;
    const wB = weeks[1]!;
    // Fire both without awaiting the first.
    const p1 = updateMilestonePreferences((c) => ({
      ...c,
      disabledWeeks: [...c.disabledWeeks, wA],
    }));
    const p2 = updateMilestonePreferences((c) => ({
      ...c,
      disabledWeeks: [...c.disabledWeeks, wB],
    }));
    await Promise.all([p1, p2]);

    expect(await readMilestonePreferences()).toEqual({
      masterEnabled: true,
      disabledWeeks: [wA, wB],
    });
    const state = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY))!);
    expect(Object.keys(state.notifIds).map(Number).sort()).toEqual(
      weeks.filter((w) => w !== wA && w !== wB).sort(),
    );
  });

  it("sign-out during an in-flight preference update leaves no stale state", async () => {
    const dueDate = makeFutureDate(30);
    await scheduleMilestoneNotifications(dueDate);

    mockNotifications.scheduleNotificationAsync.mockImplementation(
      async () =>
        new Promise((resolve) =>
          setTimeout(() => resolve(`notif-${++idCounter}`), 5),
        ),
    );

    // Start an update, then request sign-out cancellation WITHOUT awaiting
    // the update first.
    const update = updateMilestonePreferences((c) => ({
      ...c,
      masterEnabled: true,
    }));
    const cancel = cancelAllMilestoneNotifications();
    await Promise.all([update, cancel]);

    // Cancellation ran last in the queue: nothing may survive.
    expect(await AsyncStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(await AsyncStorage.getItem(PREFS_KEY)).toBeNull();

    // Every notification that was ever scheduled must have been cancelled.
    const scheduledIds =
      mockNotifications.scheduleNotificationAsync.mock.results.map(
        (r) => r.value,
      );
    for (const idPromise of scheduledIds) {
      const id = await idPromise;
      expect(
        mockNotifications.cancelScheduledNotificationAsync,
      ).toHaveBeenCalledWith(id);
    }
  });

  it("a queued update from the previous session is dropped once sign-out is requested", async () => {
    const dueDate = makeFutureDate(30);

    // Slow scheduling keeps the first op in flight so the update sits in the
    // queue when the sign-out generation bump happens.
    mockNotifications.scheduleNotificationAsync.mockImplementation(
      async () =>
        new Promise((resolve) =>
          setTimeout(() => resolve(`notif-${++idCounter}`), 5),
        ),
    );

    const schedule = scheduleMilestoneNotifications(dueDate);
    // Previous-session toggle, queued behind the slow schedule…
    const update = updateMilestonePreferences((c) => ({
      ...c,
      disabledWeeks: [20],
    }));
    // …then sign-out is requested before the update has run.
    const cancel = cancelAllMilestoneNotifications();
    const [, result] = await Promise.all([schedule, update, cancel]);

    // The stale-session update must have been dropped without persisting.
    expect(result).toBeNull();
    expect(await AsyncStorage.getItem(PREFS_KEY)).toBeNull();
    expect(await AsyncStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("a schedule requested before sign-out cannot resurrect notifications", async () => {
    const dueDate = makeFutureDate(30);

    mockNotifications.scheduleNotificationAsync.mockImplementation(
      async () =>
        new Promise((resolve) =>
          setTimeout(() => resolve(`notif-${++idCounter}`), 5),
        ),
    );

    // Schedule (previous session), then sign out before it settles.
    const schedule = scheduleMilestoneNotifications(dueDate);
    const cancel = cancelAllMilestoneNotifications();
    await Promise.all([schedule, cancel]);

    expect(await AsyncStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(await AsyncStorage.getItem(PREFS_KEY)).toBeNull();
  });
});

describe("sign-out clears preferences", () => {
  it("clears the prefs key on web too (before the platform early-return)", async () => {
    // Mutate the same Platform instance the module under test imported.
    const { Platform } = require("react-native") as {
      Platform: { OS: string };
    };
    const originalOS = Platform.OS;
    try {
      Object.defineProperty(Platform, "OS", {
        value: "web",
        configurable: true,
      });

      await writeMilestonePreferences({
        masterEnabled: false,
        disabledWeeks: [20, 28],
      });

      await cancelAllMilestoneNotifications();

      // The user-scoped preference key must be gone even though native
      // notification cancellation is a no-op on web.
      expect(await AsyncStorage.getItem(PREFS_KEY)).toBeNull();
      expect(await readMilestonePreferences()).toEqual(
        DEFAULT_MILESTONE_PREFERENCES,
      );
      expect(
        mockNotifications.cancelScheduledNotificationAsync,
      ).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(Platform, "OS", {
        value: originalOS,
        configurable: true,
      });
    }
  });

  it("cancelAllMilestoneNotifications removes the prefs key", async () => {
    await writeMilestonePreferences({
      masterEnabled: false,
      disabledWeeks: [20],
    });
    await scheduleMilestoneNotifications(makeFutureDate(30));

    await cancelAllMilestoneNotifications();

    expect(await AsyncStorage.getItem(PREFS_KEY)).toBeNull();
    expect(await readMilestonePreferences()).toEqual(
      DEFAULT_MILESTONE_PREFERENCES,
    );
  });
});
