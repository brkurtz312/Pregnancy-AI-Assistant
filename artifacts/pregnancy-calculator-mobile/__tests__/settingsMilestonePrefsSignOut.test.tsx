/**
 * Provider-level tests: milestone reminder preferences are user-scoped.
 *
 * Covers the account-switch scenario the storage-layer tests cannot:
 *  - User A disables reminders (master + a week) via the SettingsContext
 *  - A signs out → in-memory context state resets to defaults (in addition to
 *    the AsyncStorage key being cleared by cancelAllMilestoneNotifications)
 *  - User B signs in → sees default toggles, and any change B makes persists
 *    B's own state, not A's inherited state
 *  - An in-flight initial load cannot overwrite a sign-out reset
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import React from "react";
import { act, create } from "react-test-renderer";

// Controllable Clerk auth state.
let mockIsSignedIn = true;
jest.mock("@clerk/expo", () => ({
  useAuth: () => ({ isSignedIn: mockIsSignedIn }),
}));

jest.mock(
  "expo-notifications",
  () => ({
    SchedulableTriggerInputTypes: { DATE: "date" },
    scheduleNotificationAsync: jest.fn(async () => "notif-id"),
    cancelScheduledNotificationAsync: jest.fn(async () => {}),
    addNotificationResponseReceivedListener: jest.fn(() => ({
      remove: jest.fn(),
    })),
    getLastNotificationResponseAsync: jest.fn(async () => null),
  }),
  { virtual: true },
);

import { SettingsProvider, useSettings } from "@/contexts/SettingsContext";
import {
  cancelAllMilestoneNotifications,
  readMilestonePreferences,
} from "@/lib/milestone-notifications";

const PREFS_KEY = "@milestone_prefs_v1";

let latest: ReturnType<typeof useSettings> | null = null;

function Probe() {
  latest = useSettings();
  return null;
}

function tree() {
  return (
    <SettingsProvider>
      <Probe />
    </SettingsProvider>
  );
}

/** Flush pending microtasks/effects. */
async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

/** Simulate the auth state flipping and re-render the same provider tree. */
async function setSignedIn(
  renderer: ReturnType<typeof create>,
  signedIn: boolean,
) {
  mockIsSignedIn = signedIn;
  await act(async () => {
    renderer.update(tree());
  });
  await flush();
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  mockIsSignedIn = true;
  latest = null;
});

describe("milestone prefs across account switch", () => {
  it("resets context state to defaults on sign-out", async () => {
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(tree());
    });
    await flush();

    // User A disables master and week 20.
    await act(async () => latest!.setMilestoneRemindersEnabled(false));
    await flush();
    await act(async () => latest!.setMilestoneWeekEnabled(20, false));
    await flush();

    expect(latest!.milestoneRemindersEnabled).toBe(false);
    expect(latest!.disabledMilestoneWeeks).toContain(20);

    // Sign out: AuthTokenBridge clears storage; auth state flips.
    await cancelAllMilestoneNotifications();
    await setSignedIn(renderer, false);

    // User B signs in and must see defaults.
    await setSignedIn(renderer, true);

    expect(latest!.milestoneRemindersEnabled).toBe(true);
    expect(latest!.disabledMilestoneWeeks).toEqual([]);
    expect(await AsyncStorage.getItem(PREFS_KEY)).toBeNull();
  });

  it("a change made after the switch persists B's state, not A's", async () => {
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(tree());
    });
    await flush();

    await act(async () => latest!.setMilestoneWeekEnabled(20, false));
    await flush();
    await act(async () => latest!.setMilestoneWeekEnabled(28, false));
    await flush();

    await cancelAllMilestoneNotifications();
    await setSignedIn(renderer, false);
    await setSignedIn(renderer, true);

    // B disables just week 24 — A's weeks 20/28 must not come back.
    await act(async () => latest!.setMilestoneWeekEnabled(24, false));
    await flush();

    expect(latest!.disabledMilestoneWeeks).toEqual([24]);
    expect(await readMilestonePreferences()).toEqual({
      masterEnabled: true,
      disabledWeeks: [24],
    });
  });

  it("an in-flight initial load cannot overwrite the sign-out reset", async () => {
    // Seed A's stale prefs in storage before mount.
    await AsyncStorage.setItem(
      PREFS_KEY,
      JSON.stringify({ masterEnabled: false, disabledWeeks: [20] }),
    );

    let renderer!: ReturnType<typeof create>;
    // Mount and sign out immediately, without flushing the initial load first.
    act(() => {
      renderer = create(tree());
    });
    mockIsSignedIn = false;
    act(() => {
      renderer.update(tree());
    });
    await flush();

    expect(latest!.milestoneRemindersEnabled).toBe(true);
    expect(latest!.disabledMilestoneWeeks).toEqual([]);
  });
});
