/**
 * Task-focused tests: milestone notifications must reschedule correctly when
 * the due date is updated mid-pregnancy (e.g. after a late ultrasound
 * correction).
 *
 * Complements milestoneNotifications.test.ts with stricter assertions:
 *  - due date A → B: every old notification ID is individually cancelled
 *  - new notifications are scheduled with trigger dates shifted by exactly
 *    the due-date delta in local calendar days (DST-safe assertion)
 *  - persisted state reflects due date B and exactly the IDs returned by the
 *    new scheduling calls
 *  - calling twice with the same due date is a strict no-op (no schedules,
 *    no cancels, no storage write)
 *
 * Time is frozen with Jest fake timers so past/future milestone boundaries
 * are deterministic regardless of the wall-clock time the suite runs at.
 *
 * expo-notifications is not installed in the test environment, so a virtual
 * Jest mock is registered (same pattern as milestoneNotifications.test.ts).
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

import { scheduleMilestoneNotifications } from "@/lib/milestone-notifications";

const STORAGE_KEY = "@milestone_notif_v1";

/** Due date N weeks from the (frozen) current time, at noon local time. */
function makeFutureDate(weeksUntilDue: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + weeksUntilDue * 7);
  d.setHours(12, 0, 0, 0);
  return d;
}

/** Local calendar-day shift between two dates (DST-safe, unlike raw ms). */
function calendarDayDelta(from: Date, to: Date): number {
  const a = new Date(from);
  const b = new Date(to);
  a.setHours(12, 0, 0, 0);
  b.setHours(12, 0, 0, 0);
  return Math.round((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000));
}

async function readPersistedState(): Promise<{
  dueDate: string;
  notifIds: Record<number, string>;
}> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  expect(raw).not.toBeNull();
  return JSON.parse(raw!);
}

let idCounter = 0;

beforeEach(async () => {
  // Freeze time at a fixed local instant (mid-afternoon, mid-January —
  // safely away from 9 AM trigger boundaries and DST transitions).
  jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate"] });
  jest.setSystemTime(new Date(2026, 0, 15, 15, 0, 0, 0));

  jest.clearAllMocks();
  await AsyncStorage.clear();
  idCounter = 0;
  mockNotifications.scheduleNotificationAsync.mockImplementation(
    async () => `notif-${++idCounter}`,
  );
});

afterEach(() => {
  jest.useRealTimers();
});

describe("due-date change mid-pregnancy", () => {
  it("cancels every old notification ID, schedules shifted dates, and persists due date B", async () => {
    // Due date A: 12 weeks out (user is ~week 28).
    const dueDateA = makeFutureDate(12);
    await scheduleMilestoneNotifications(dueDateA);

    const stateA = await readPersistedState();
    const oldIds = Object.values(stateA.notifIds);
    expect(oldIds.length).toBeGreaterThan(0);

    // Capture trigger dates per milestone title from the first round.
    const triggersA = new Map<string, Date>();
    for (const call of mockNotifications.scheduleNotificationAsync.mock.calls) {
      triggersA.set(call[0].content.title as string, call[0].trigger.date);
    }

    jest.clearAllMocks();
    const returnedIdsB: string[] = [];
    mockNotifications.scheduleNotificationAsync.mockImplementation(async () => {
      const id = `notif-${++idCounter}`;
      returnedIdsB.push(id);
      return id;
    });

    // Ultrasound correction: due date B is 10 days later.
    const dueDateB = new Date(dueDateA);
    dueDateB.setDate(dueDateB.getDate() + 10);
    await scheduleMilestoneNotifications(dueDateB);

    // (a) every old notification was individually cancelled
    expect(
      mockNotifications.cancelScheduledNotificationAsync,
    ).toHaveBeenCalledTimes(oldIds.length);
    for (const id of oldIds) {
      expect(
        mockNotifications.cancelScheduledNotificationAsync,
      ).toHaveBeenCalledWith(id);
    }

    // (b) new notifications were scheduled, shifted by exactly +10 local
    // calendar days relative to the same milestone's original trigger
    const callsB = mockNotifications.scheduleNotificationAsync.mock.calls;
    expect(callsB.length).toBeGreaterThan(0);
    for (const call of callsB) {
      const title = call[0].content.title as string;
      const dateB = call[0].trigger.date as Date;
      const dateA = triggersA.get(title);
      if (dateA !== undefined) {
        expect(calendarDayDelta(dateA, dateB)).toBe(10);
      }
    }

    // (c) persisted state reflects due date B and exactly the IDs returned
    // by the new scheduling calls
    const stateB = await readPersistedState();
    expect(stateB.dueDate).toBe(dueDateB.toISOString().slice(0, 10));
    expect(Object.values(stateB.notifIds).sort()).toEqual(
      [...returnedIdsB].sort(),
    );
  });

  it("earlier corrected due date drops milestones that are now in the past", async () => {
    // Due date A: 10 weeks out (~week 30) → weeks 35 & 36 milestones future.
    const dueDateA = makeFutureDate(10);
    await scheduleMilestoneNotifications(dueDateA);
    const countA =
      mockNotifications.scheduleNotificationAsync.mock.calls.length;
    expect(countA).toBeGreaterThan(0);

    jest.clearAllMocks();
    mockNotifications.scheduleNotificationAsync.mockImplementation(
      async () => `notif-${++idCounter}`,
    );

    // Corrected 6 weeks earlier: due date is now 4 weeks out (~week 36).
    // week-35 trigger = due − 35 days = 7 days in the past, and
    // week-36 trigger = due − 28 days = today at 9 AM, already past the
    // frozen 3 PM clock. Both boundaries are unambiguous.
    const dueDateB = makeFutureDate(4);
    await scheduleMilestoneNotifications(dueDateB);

    const callsB = mockNotifications.scheduleNotificationAsync.mock.calls;
    expect(callsB.length).toBeLessThan(countA);
    const now = Date.now();
    for (const call of callsB) {
      expect((call[0].trigger.date as Date).getTime()).toBeGreaterThan(now);
    }

    const stateB = await readPersistedState();
    expect(stateB.dueDate).toBe(dueDateB.toISOString().slice(0, 10));
  });
});

describe("same due date twice", () => {
  it("is a strict no-op: no scheduling, no cancelling, no storage write", async () => {
    const dueDate = makeFutureDate(12);
    await scheduleMilestoneNotifications(dueDate);
    const stateFirst = await readPersistedState();

    jest.clearAllMocks();
    const setItemSpy = jest.spyOn(AsyncStorage, "setItem");

    // Same calendar day, different Date instance & time of day.
    const sameDay = new Date(dueDate);
    sameDay.setHours(8, 30, 0, 0);
    await scheduleMilestoneNotifications(sameDay);

    expect(mockNotifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    expect(
      mockNotifications.cancelScheduledNotificationAsync,
    ).not.toHaveBeenCalled();
    expect(setItemSpy).not.toHaveBeenCalled();
    expect(await readPersistedState()).toEqual(stateFirst);

    setItemSpy.mockRestore();
  });
});
