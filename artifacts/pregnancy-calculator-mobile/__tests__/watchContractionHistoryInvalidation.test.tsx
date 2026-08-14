/**
 * watchContractionHistoryInvalidation.test.tsx
 *
 * Confirms that a contraction queued offline by WatchBackgroundListener
 * (because apiDirectSaveContraction rejected) appears in the history screen
 * after the queue is flushed by useGlobalBackgroundSync on reconnect.
 *
 * Specifically, it verifies that the flush path invalidates
 * getListContractionsQueryKey() — the *base* key with no params — so that
 * React Query's prefix-match logic refreshes every contraction query variant,
 * including the all-dates view used by the session-history screen
 * ({ limit: 200 }) and not only the single-date tools-tab view
 * ({ sessionDate, limit: 50 }).
 *
 * Strategy:
 *  1. Render WatchBackgroundListener with apiDirectSaveContraction stubbed to
 *     reject (simulating an offline phone).  The component's catch branch calls
 *     enqueueWatchContraction, which writes to the real AsyncStorage mock so
 *     the flush path can read it back.
 *  2. Mount useGlobalBackgroundSync in the same tree.  Trigger an offline →
 *     online NetInfo transition.  The flush calls apiSaveWatchContraction
 *     (stubbed to succeed) then calls onItemSaved → invalidateQueries.
 *  3. Assert that invalidateQueries was called with the base contraction key
 *     (getListContractionsQueryKey() with no arguments).
 */

import React from "react";
import { act, create } from "react-test-renderer";
import AsyncStorage from "@react-native-async-storage/async-storage";

// ── Clerk ─────────────────────────────────────────────────────────────────────
jest.mock("@clerk/expo", () => ({
  useAuth: jest.fn(),
}));

// ── react-native-safe-area-context ────────────────────────────────────────────
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: jest.fn(() => ({ bottom: 0, top: 0, left: 0, right: 0 })),
}));

// ── Expo vector-icons ─────────────────────────────────────────────────────────
jest.mock("@expo/vector-icons", () => ({
  Ionicons: "Ionicons",
}));

// ── Native Watch module — lazy-required; return null so all paths are no-ops ──
jest.mock("../modules/WatchConnectivity", () => null, { virtual: true });

// ── useWatchConnectivity — capture the onContractionUpdate callback ────────────
// The captured callback is what WatchBackgroundListener passes to the hook.
// Calling it in a test simulates a Watch contraction event arriving on the phone.
let capturedOnContractionUpdate:
  | ((record: {
      id?: string;
      startedAt: string;
      endedAt?: string;
      interval?: number;
    }) => void)
  | undefined;

jest.mock("@/hooks/useWatchConnectivity", () => ({
  useWatchConnectivity: jest.fn(
    (opts: {
      onContractionUpdate?: (record: {
        id?: string;
        startedAt: string;
        endedAt?: string;
        interval?: number;
      }) => void;
      onKickSessionEnd?: unknown;
      onKickUpdate?: unknown;
      gestationalWeek?: number;
      tips?: unknown[];
    }) => {
      capturedOnContractionUpdate = opts.onContractionUpdate;
      return { sessionState: "notActivated", isWatchAppInstalled: false };
    },
  ),
}));

// ── NetInfo — captures the listener; fetch returns offline so the
//   initial-mount Watch flush in useGlobalBackgroundSync does NOT fire ─────────
let netInfoListener: ((state: { isConnected: boolean }) => void) | null = null;

jest.mock("@react-native-community/netinfo", () => ({
  __esModule: true,
  default: {
    addEventListener: jest.fn(
      (cb: (state: { isConnected: boolean }) => void) => {
        netInfoListener = cb;
        return () => {
          netInfoListener = null;
        };
      },
    ),
    fetch: jest.fn(async () => ({
      isConnected: false,
      isInternetReachable: false,
    })),
  },
}));

// ── fetal-development + pregnancy-math — not under test ──────────────────────
jest.mock("@/lib/fetal-development", () => ({
  getWeeklyDevelopment: jest.fn(() => ({
    development: ["Baby is growing."],
    motherChanges: ["Rest well."],
    comingUp: "Next week is important.",
  })),
}));

jest.mock("@/lib/pregnancy-math", () => ({
  calculateByDueDate: jest.fn(() => ({ currentGestationalAgeWeeks: 28 })),
}));

// ── Journal / hospital-bag / birth-plan — not under test ─────────────────────
// AsyncStorage is cleared in beforeEach so hasPendingSync returns false for all
// keys automatically, skipping these sync paths without extra stubs.
jest.mock("@/lib/journal", () => ({
  loadEntries: jest.fn(async () => []),
  replaceEntryId: jest.fn(async () => {}),
}));

jest.mock("@/lib/hospital-bag", () => ({
  loadHospitalBagChecklist: jest.fn(async () => []),
}));

jest.mock("@/lib/birth-plan", () => ({
  loadBirthPlanAnswers: jest.fn(async () => ({})),
}));

// ── React Query — shared queryClient stub across both hooks ───────────────────
// Using a module-level variable so both WatchBackgroundListener and
// useGlobalBackgroundSync share the same invalidateQueries spy.
const mockInvalidateQueries = jest.fn().mockResolvedValue(undefined);
const mockGetQueryData = jest.fn().mockReturnValue(undefined);

jest.mock("@tanstack/react-query", () => ({
  useQueryClient: jest.fn(() => ({
    invalidateQueries: mockInvalidateQueries,
    getQueryData: mockGetQueryData,
  })),
}));

// ── API client query-key helpers ──────────────────────────────────────────────
// The base key (no args) is used for prefix-match invalidation.
// The helper with args is used by KickCounterSection / direct save paths.
jest.mock("@workspace/api-client-react", () => ({
  getListKickSessionsQueryKey: jest.fn((p?: object) =>
    p !== undefined ? ["kick-sessions", p] : ["kick-sessions"],
  ),
  getListContractionsQueryKey: jest.fn((p?: object) =>
    p !== undefined ? ["contractions", p] : ["contractions"],
  ),
  getGetProfileQueryKey: jest.fn(() => ["profile"]),
  useGetProfile: jest.fn(() => ({ data: undefined })),
}));

// ── sync-api ──────────────────────────────────────────────────────────────────
// apiDirectSaveContraction rejects (phone is offline).
// apiSaveWatchContraction succeeds (used by the flush path on reconnect).
jest.mock("@/lib/sync-api", () => ({
  apiDirectSaveKickSession: jest.fn(async () => {}),
  apiDirectSaveContraction: jest.fn(async () => {
    throw new Error("Network request failed (offline)");
  }),
  apiUpsertJournalEntry: jest.fn(async () => ({})),
  apiSaveHospitalBag: jest.fn(async () => {}),
  apiSaveBirthPlanAnswers: jest.fn(async () => {}),
  apiSaveWatchKickSession: jest.fn(async () => {}),
  apiSaveWatchContraction: jest.fn(async () => {}),
  isServerUuid: jest.fn((id: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id),
  ),
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────────
import { useAuth } from "@clerk/expo";
import {
  apiSaveWatchContraction,
  apiDirectSaveContraction,
} from "@/lib/sync-api";
import { readWatchContractions } from "@/lib/sync-queue";
import { getListContractionsQueryKey } from "@workspace/api-client-react";
import { WatchBackgroundListener } from "@/components/WatchBackgroundListener";
import { useGlobalBackgroundSync } from "@/hooks/useGlobalBackgroundSync";

const mockUseAuth = useAuth as jest.Mock;
const mockApiSaveWatchContraction = apiSaveWatchContraction as jest.Mock;
const mockApiDirectSaveContraction = apiDirectSaveContraction as jest.Mock;

// ── Host component: mounts both hooks under test in the same React tree ───────
function AppRoot() {
  useGlobalBackgroundSync();
  return React.createElement(WatchBackgroundListener);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Simulates an offline → online connectivity transition. */
function goOfflineThenOnline() {
  act(() => {
    netInfoListener?.({ isConnected: false });
  });
  act(() => {
    netInfoListener?.({ isConnected: true });
  });
}

/** Drains pending promises / microtasks produced by the async flush chain. */
async function drainAsync() {
  for (let i = 0; i < 4; i++) {
    await new Promise((r) => setTimeout(r, 0));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Watch offline contraction → reconnect flush → history invalidation", () => {
  let userId: string;
  let testCounter = 0;

  beforeEach(async () => {
    testCounter += 1;
    userId = `user-history-invalidation-${testCounter}`;
    capturedOnContractionUpdate = undefined;
    netInfoListener = null;

    jest.clearAllMocks();

    // Reset per-test mocks that clearAllMocks resets to default (no impl):
    mockApiSaveWatchContraction.mockResolvedValue(undefined);
    mockApiDirectSaveContraction.mockRejectedValue(
      new Error("Network request failed (offline)"),
    );
    mockInvalidateQueries.mockResolvedValue(undefined);
    mockGetQueryData.mockReturnValue(undefined);

    // Clear AsyncStorage so hasPendingSync returns false for all keys,
    // and the Watch queue starts empty for each test's userId.
    await AsyncStorage.clear();

    mockUseAuth.mockReturnValue({
      isSignedIn: true,
      userId,
      getToken: jest.fn(async () => "test-token"),
    });
  });

  // ── Core scenario: offline → enqueue → reconnect → history invalidated ────────

  it("invalidates the base contraction query key (all-dates) after the offline queue is flushed on reconnect", async () => {
    // Mount the app root so WatchBackgroundListener registers its callbacks.
    act(() => {
      create(React.createElement(AppRoot));
    });

    // Sanity-check: the hook registered its onContractionUpdate handler.
    expect(capturedOnContractionUpdate).toBeDefined();

    // Simulate a Watch contraction arriving while the phone is offline.
    // apiDirectSaveContraction is stubbed to reject, so the component's catch
    // branch calls enqueueWatchContraction, which writes to AsyncStorage.
    await act(async () => {
      capturedOnContractionUpdate?.({
        id: "watch-record-uuid-001",
        startedAt: "2026-08-14T10:00:00.000Z",
        endedAt: "2026-08-14T10:01:00.000Z",
        interval: 300,
      });
      await drainAsync();
    });

    // The contraction must be in the offline queue now.
    const queued = await readWatchContractions(userId);
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({
      startedAt: "2026-08-14T10:00:00.000Z",
      durationSeconds: 60,
    });

    // Reset the spy so the assertion below only captures flush-triggered calls.
    mockInvalidateQueries.mockClear();

    // Simulate the phone coming back online.
    await act(async () => {
      goOfflineThenOnline();
      await drainAsync();
    });

    // The flush must have called the save API exactly once.
    expect(mockApiSaveWatchContraction).toHaveBeenCalledTimes(1);
    expect(mockApiSaveWatchContraction).toHaveBeenCalledWith(
      expect.objectContaining({
        startedAt: "2026-08-14T10:00:00.000Z",
        durationSeconds: 60,
      }),
      expect.any(Function),
    );

    // The queue must be empty after the successful flush.
    expect(await readWatchContractions(userId)).toHaveLength(0);

    // THE CORE ASSERTION: invalidateQueries must have been called with the base
    // contraction key (no params) so React Query's prefix-match refreshes BOTH:
    //   – the all-dates history view  (getListContractionsQueryKey() → ["contractions"])
    //   – the single-date tools view  (getListContractionsQueryKey({...}) → ["contractions", {...}])
    const baseKey = getListContractionsQueryKey();
    expect(mockInvalidateQueries).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: baseKey }),
    );
  });

  // ── Queue stays intact when flush API fails ───────────────────────────────────

  it("does not invalidate the history query and leaves the contraction queued when the flush API call fails", async () => {
    mockApiSaveWatchContraction.mockRejectedValueOnce(new Error("still down"));

    act(() => {
      create(React.createElement(AppRoot));
    });

    expect(capturedOnContractionUpdate).toBeDefined();

    await act(async () => {
      capturedOnContractionUpdate?.({
        id: "watch-record-uuid-002",
        startedAt: "2026-08-14T11:00:00.000Z",
        endedAt: "2026-08-14T11:00:55.000Z",
        interval: 240,
      });
      await drainAsync();
    });

    const queuedBefore = await readWatchContractions(userId);
    expect(queuedBefore).toHaveLength(1);

    mockInvalidateQueries.mockClear();

    await act(async () => {
      goOfflineThenOnline();
      await drainAsync();
    });

    // API was attempted
    expect(mockApiSaveWatchContraction).toHaveBeenCalledTimes(1);

    // Item must remain queued so the next reconnect can retry it.
    const queuedAfter = await readWatchContractions(userId);
    expect(queuedAfter).toHaveLength(1);
    expect(queuedAfter[0]).toMatchObject({
      startedAt: "2026-08-14T11:00:00.000Z",
    });

    // invalidateQueries must NOT have been called for the base contraction key
    // because the flush did not successfully save the record.
    const baseKey = getListContractionsQueryKey();
    const contractionInvalidations = mockInvalidateQueries.mock.calls.filter(
      (args) => JSON.stringify(args[0]?.queryKey) === JSON.stringify(baseKey),
    );
    expect(contractionInvalidations).toHaveLength(0);
  });

  // ── Multiple queued contractions: all flushed, history invalidated once ───────

  it("flushes multiple queued contractions and invalidates the history key for each saved item", async () => {
    act(() => {
      create(React.createElement(AppRoot));
    });

    expect(capturedOnContractionUpdate).toBeDefined();

    // Enqueue two contractions while offline.
    await act(async () => {
      capturedOnContractionUpdate?.({
        id: "watch-uuid-a",
        startedAt: "2026-08-14T12:00:00.000Z",
        endedAt: "2026-08-14T12:01:00.000Z",
        interval: 360,
      });
      await drainAsync();
    });

    await act(async () => {
      capturedOnContractionUpdate?.({
        id: "watch-uuid-b",
        startedAt: "2026-08-14T12:10:00.000Z",
        endedAt: "2026-08-14T12:11:05.000Z",
        interval: 600,
      });
      await drainAsync();
    });

    expect(await readWatchContractions(userId)).toHaveLength(2);

    mockInvalidateQueries.mockClear();

    await act(async () => {
      goOfflineThenOnline();
      await drainAsync();
    });

    // Both items must have been saved and the queue emptied.
    expect(mockApiSaveWatchContraction).toHaveBeenCalledTimes(2);
    expect(await readWatchContractions(userId)).toHaveLength(0);

    // The base key must have been invalidated at least once (once per saved item).
    const baseKey = getListContractionsQueryKey();
    const contractionInvalidations = mockInvalidateQueries.mock.calls.filter(
      (args) => JSON.stringify(args[0]?.queryKey) === JSON.stringify(baseKey),
    );
    expect(contractionInvalidations.length).toBeGreaterThanOrEqual(1);
  });
});
