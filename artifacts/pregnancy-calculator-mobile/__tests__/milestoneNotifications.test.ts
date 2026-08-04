/**
 * Unit tests for lib/milestone-notifications.ts
 *
 * expo-notifications is not installed in the test environment (it is a native
 * module that lives in the app binary, not in node_modules).  We register a
 * virtual Jest mock so that the safe-require inside milestone-notifications.ts
 * succeeds and `Notifications` is non-null during tests.
 *
 * IMPORTANT: jest.mock() is hoisted before variable declarations, so the
 * factory must only reference jest.fn() calls inline (no captured const
 * references that would be in the TDZ at hoist time).  Access the resulting
 * mock functions via jest.requireMock() after hoisting is resolved.
 *
 * Scenarios covered:
 *  - MILESTONE_KNOWN_URLS allow-list membership
 *  - scheduleMilestoneNotifications: first run schedules upcoming milestones
 *  - scheduleMilestoneNotifications: same due date is a no-op (idempotent)
 *  - scheduleMilestoneNotifications: due-date change cancels old, reschedules
 *  - scheduleMilestoneNotifications: past milestones are not scheduled
 *  - cancelAllMilestoneNotifications: cancels each stored ID, clears storage
 *  - cancelAllMilestoneNotifications: no-op when storage is empty
 *  - Sign-out / re-login with same due date: storage cleared → reschedules
 *  - addNotificationTapListener: fires handler for a known URL
 *  - addNotificationTapListener: rejects unknown URL (allow-list)
 *  - addNotificationTapListener: rejects missing URL
 *  - addNotificationTapListener: cleanup removes the subscription
 *  - getInitialMilestoneNotificationUrl: returns URL from pending response
 *  - getInitialMilestoneNotificationUrl: null for unknown URL
 *  - getInitialMilestoneNotificationUrl: null when no pending response
 *  - getInitialMilestoneNotificationUrl: null when the API rejects
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

// ---------------------------------------------------------------------------
// Virtual mock for expo-notifications
//
// virtual: true is required because expo-notifications is not installed in the
// test environment (native-only binary module, absent from node_modules).
// All functions are defined inline so they survive jest.mock() hoisting.
// ---------------------------------------------------------------------------
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

// Access the mock references after hoisting is resolved.
const mockNotifications = jest.requireMock("expo-notifications") as {
  scheduleNotificationAsync: jest.Mock;
  cancelScheduledNotificationAsync: jest.Mock;
  addNotificationResponseReceivedListener: jest.Mock;
  getLastNotificationResponseAsync: jest.Mock;
};

// ---------------------------------------------------------------------------
// Import module under test AFTER mocks are registered
// ---------------------------------------------------------------------------
import {
  MILESTONE_SCHEDULE,
  MILESTONE_KNOWN_URLS,
  addNotificationTapListener,
  cancelAllMilestoneNotifications,
  getInitialMilestoneNotificationUrl,
  scheduleMilestoneNotifications,
} from "@/lib/milestone-notifications";

const STORAGE_KEY = "@milestone_notif_v1";

/** Build a due date that is N weeks away from today. */
function makeFutureDate(weeksUntilDue: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + weeksUntilDue * 7);
  d.setHours(12, 0, 0, 0);
  return d;
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

// ---------------------------------------------------------------------------
// MILESTONE_KNOWN_URLS allow-list
// ---------------------------------------------------------------------------

describe("MILESTONE_KNOWN_URLS", () => {
  it("contains only URLs from MILESTONE_SCHEDULE", () => {
    const expected = new Set(MILESTONE_SCHEDULE.map((m) => m.url));
    expect(MILESTONE_KNOWN_URLS).toEqual(expected);
  });

  it("includes /development and /prenatal-testing", () => {
    expect(MILESTONE_KNOWN_URLS.has("/development")).toBe(true);
    expect(MILESTONE_KNOWN_URLS.has("/prenatal-testing")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// scheduleMilestoneNotifications
// ---------------------------------------------------------------------------

describe("scheduleMilestoneNotifications", () => {
  it("schedules upcoming milestones and persists state on first run", async () => {
    // 8 weeks until due date: only the last few milestones (≥ week 32) are future.
    const dueDate = makeFutureDate(8);

    await scheduleMilestoneNotifications(dueDate);

    expect(mockNotifications.scheduleNotificationAsync).toHaveBeenCalled();

    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    const state = JSON.parse(raw!);
    expect(state.dueDate).toBe(dueDate.toISOString().slice(0, 10));
    expect(Object.keys(state.notifIds).length).toBeGreaterThan(0);
  });

  it("is idempotent: same due date is a no-op on subsequent calls", async () => {
    const dueDate = makeFutureDate(8);

    await scheduleMilestoneNotifications(dueDate);
    const firstCount =
      mockNotifications.scheduleNotificationAsync.mock.calls.length;

    await scheduleMilestoneNotifications(dueDate);
    expect(mockNotifications.scheduleNotificationAsync).toHaveBeenCalledTimes(
      firstCount,
    );
  });

  it("cancels old notifications and reschedules on due-date change", async () => {
    const dueDateA = makeFutureDate(8);
    await scheduleMilestoneNotifications(dueDateA);

    const cancelsBefore =
      mockNotifications.cancelScheduledNotificationAsync.mock.calls.length;
    const schedulesBefore =
      mockNotifications.scheduleNotificationAsync.mock.calls.length;

    const dueDateB = makeFutureDate(10);
    await scheduleMilestoneNotifications(dueDateB);

    expect(
      mockNotifications.cancelScheduledNotificationAsync.mock.calls.length,
    ).toBeGreaterThan(cancelsBefore);
    expect(
      mockNotifications.scheduleNotificationAsync.mock.calls.length,
    ).toBeGreaterThan(schedulesBefore);

    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    expect(JSON.parse(raw!).dueDate).toBe(dueDateB.toISOString().slice(0, 10));
  });

  it("only schedules milestones whose trigger date is in the future", async () => {
    const dueDate = makeFutureDate(8);
    await scheduleMilestoneNotifications(dueDate);

    for (const call of mockNotifications.scheduleNotificationAsync.mock.calls) {
      const trigger = call[0]?.trigger as { date?: Date };
      if (trigger?.date) {
        expect(trigger.date.getTime()).toBeGreaterThan(Date.now());
      }
    }
  });
});

// ---------------------------------------------------------------------------
// cancelAllMilestoneNotifications
// ---------------------------------------------------------------------------

describe("cancelAllMilestoneNotifications", () => {
  it("cancels every stored notification ID and clears storage", async () => {
    const dueDate = makeFutureDate(8);
    await scheduleMilestoneNotifications(dueDate);

    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const ids = Object.values(JSON.parse(raw!).notifIds) as string[];
    expect(ids.length).toBeGreaterThan(0);

    jest.clearAllMocks();
    await cancelAllMilestoneNotifications();

    for (const id of ids) {
      expect(
        mockNotifications.cancelScheduledNotificationAsync,
      ).toHaveBeenCalledWith(id);
    }
    expect(await AsyncStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("is a no-op when there is no stored state", async () => {
    await cancelAllMilestoneNotifications();
    expect(
      mockNotifications.cancelScheduledNotificationAsync,
    ).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Sign-out / re-login cycle (storage-layer check)
// ---------------------------------------------------------------------------

describe("sign-out / re-login with same due date", () => {
  it("reschedules after cancelAllMilestoneNotifications clears persisted state", async () => {
    const dueDate = makeFutureDate(8);

    // First sign-in: schedule
    await scheduleMilestoneNotifications(dueDate);
    expect(mockNotifications.scheduleNotificationAsync).toHaveBeenCalled();

    // Sign-out: cancel + clear storage (as AuthTokenBridge does)
    await cancelAllMilestoneNotifications();
    expect(await AsyncStorage.getItem(STORAGE_KEY)).toBeNull();

    // Re-login with the SAME due date: must reschedule because storage is gone
    jest.clearAllMocks();
    await scheduleMilestoneNotifications(dueDate);

    expect(mockNotifications.scheduleNotificationAsync).toHaveBeenCalled();
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    expect(JSON.parse(raw!).dueDate).toBe(dueDate.toISOString().slice(0, 10));
  });
});

// ---------------------------------------------------------------------------
// addNotificationTapListener
// ---------------------------------------------------------------------------

describe("addNotificationTapListener", () => {
  function getLastListenerCallback() {
    const calls =
      mockNotifications.addNotificationResponseReceivedListener.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    return calls[calls.length - 1][0] as (response: unknown) => void;
  }

  it("calls handler with a validated milestone URL", () => {
    const handler = jest.fn();
    addNotificationTapListener(handler);

    const cb = getLastListenerCallback();
    const knownUrl = MILESTONE_SCHEDULE[0].url;
    cb({ notification: { request: { content: { data: { url: knownUrl } } } } });

    expect(handler).toHaveBeenCalledWith(knownUrl);
  });

  it("does NOT call handler for a URL outside the allow-list", () => {
    const handler = jest.fn();
    addNotificationTapListener(handler);

    const cb = getLastListenerCallback();
    cb({
      notification: {
        request: {
          content: { data: { url: "https://evil.example.com/phish" } },
        },
      },
    });

    expect(handler).not.toHaveBeenCalled();
  });

  it("does NOT call handler when data.url is absent", () => {
    const handler = jest.fn();
    addNotificationTapListener(handler);

    const cb = getLastListenerCallback();
    cb({ notification: { request: { content: { data: {} } } } });

    expect(handler).not.toHaveBeenCalled();
  });

  it("returns a cleanup function that removes the subscription", () => {
    const remove = jest.fn();
    mockNotifications.addNotificationResponseReceivedListener.mockReturnValueOnce(
      { remove },
    );

    const cleanup = addNotificationTapListener(jest.fn());
    cleanup();

    expect(remove).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// getInitialMilestoneNotificationUrl — cold-start tap
// ---------------------------------------------------------------------------

describe("getInitialMilestoneNotificationUrl", () => {
  it("returns the URL when the pending response has a valid milestone URL", async () => {
    const knownUrl = MILESTONE_SCHEDULE[1].url;
    mockNotifications.getLastNotificationResponseAsync.mockResolvedValueOnce({
      notification: { request: { content: { data: { url: knownUrl } } } },
    });

    expect(await getInitialMilestoneNotificationUrl()).toBe(knownUrl);
  });

  it("returns null when the URL is not in the allow-list", async () => {
    mockNotifications.getLastNotificationResponseAsync.mockResolvedValueOnce({
      notification: {
        request: { content: { data: { url: "/some-other-route" } } },
      },
    });

    expect(await getInitialMilestoneNotificationUrl()).toBeNull();
  });

  it("returns null when there is no pending response", async () => {
    mockNotifications.getLastNotificationResponseAsync.mockResolvedValueOnce(
      null,
    );
    expect(await getInitialMilestoneNotificationUrl()).toBeNull();
  });

  it("returns null when getLastNotificationResponseAsync rejects", async () => {
    mockNotifications.getLastNotificationResponseAsync.mockRejectedValueOnce(
      new Error("native error"),
    );
    expect(await getInitialMilestoneNotificationUrl()).toBeNull();
  });
});
