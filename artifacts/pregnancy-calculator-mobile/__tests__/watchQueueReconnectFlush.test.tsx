/**
 * watchQueueReconnectFlush.test.tsx
 *
 * Confirms that the offline Watch event retry path in useGlobalBackgroundSync
 * correctly flushes the kick-session and contraction queues when connectivity
 * is restored — without duplicating saved items or silently dropping items
 * that fail their API call on reconnect.
 *
 * Strategy: use the *real* sync-queue implementation (AsyncStorage is backed by
 * the jest in-memory mock configured in package.json#jest.moduleNameMapper) so
 * that enqueueWatchKickSession / enqueueWatchContraction actually write to
 * storage and readWatchKickSessions / readWatchContractions read back real
 * state.  Only sync-api is mocked so no network is required.
 */

import React from "react";
import { act, create } from "react-test-renderer";
import AsyncStorage from "@react-native-async-storage/async-storage";

// ── Clerk ─────────────────────────────────────────────────────────────────────
jest.mock("@clerk/expo", () => ({
  useAuth: jest.fn(),
}));

// ── NetInfo — captures the listener so tests can fire state changes ────────────
// NetInfo.fetch returns offline so the initial-mount Watch flush does NOT fire;
// only the explicit goOfflineThenOnline() helper triggers the reconnect path.
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

// ── Journal / hospital-bag / birth-plan — not under test here ─────────────────
// hasPendingSync reads AsyncStorage (cleared in beforeEach → returns false for
// all keys), so these syncs are automatically skipped without further mocking.
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

// ── React Query — useQueryClient is called by the hook; stub it out ───────────
jest.mock("@tanstack/react-query", () => ({
  useQueryClient: jest.fn(() => ({
    invalidateQueries: jest.fn().mockResolvedValue(undefined),
    getQueryData: jest.fn().mockReturnValue(undefined),
  })),
}));

// ── API client query-key helpers ──────────────────────────────────────────────
jest.mock("@workspace/api-client-react", () => ({
  getListKickSessionsQueryKey: jest.fn((p: object) => ["kick-sessions", p]),
  getListContractionsQueryKey: jest.fn((p: object) => ["contractions", p]),
  getGetProfileQueryKey: jest.fn(() => ["profile"]),
}));

// ── sync-api — Watch helpers are the focus; everything else is a no-op stub ───
jest.mock("@/lib/sync-api", () => ({
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
  apiSaveWatchKickSession,
  apiSaveWatchContraction,
} from "@/lib/sync-api";
import {
  enqueueWatchKickSession,
  enqueueWatchContraction,
  readWatchKickSessions,
  readWatchContractions,
  getWatchQueueGeneration,
} from "@/lib/sync-queue";
import { useGlobalBackgroundSync } from "@/hooks/useGlobalBackgroundSync";

const mockUseAuth = useAuth as jest.Mock;
const mockApiSaveWatchKickSession = apiSaveWatchKickSession as jest.Mock;
const mockApiSaveWatchContraction = apiSaveWatchContraction as jest.Mock;

// ── Minimal host component ────────────────────────────────────────────────────
function SyncHost() {
  useGlobalBackgroundSync();
  return null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
/** Simulates a connectivity transition from offline → online. */
function goOfflineThenOnline() {
  act(() => {
    netInfoListener?.({ isConnected: false });
  });
  act(() => {
    netInfoListener?.({ isConnected: true });
  });
}

/** Drains microtasks and timers produced by the flush path. */
async function drainAsync() {
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("useGlobalBackgroundSync — Watch queue flush on reconnect", () => {
  // Each test uses a distinct userId so the module-level watchQueueGen Map and
  // the AsyncStorage keys (scoped to userId) never bleed across tests.
  let userId: string;
  let testCounter = 0;

  beforeEach(async () => {
    testCounter += 1;
    userId = `user-reconnect-flush-${testCounter}`;
    jest.clearAllMocks();
    netInfoListener = null;
    // Clear AsyncStorage so hasPendingSync returns false for all keys,
    // ensuring journal/bag/birth-plan syncs are skipped automatically.
    await AsyncStorage.clear();
    mockUseAuth.mockReturnValue({
      isSignedIn: true,
      userId,
      getToken: jest.fn(async () => "tok"),
    });
  });

  // ── 1. Kick sessions: API called with correct payload, queue empty on success ─

  it("calls apiSaveWatchKickSession with the queued payload and empties the queue after a successful flush", async () => {
    const gen = getWatchQueueGeneration(userId);
    await enqueueWatchKickSession(
      {
        kickCount: 7,
        startedAt: "2026-08-01T10:00:00.000Z",
        endedAt: "2026-08-01T10:20:00.000Z",
      },
      userId,
      gen,
    );

    // Confirm the item is queued before the flush
    expect(await readWatchKickSessions(userId)).toHaveLength(1);

    act(() => {
      create(React.createElement(SyncHost));
    });

    await act(async () => {
      goOfflineThenOnline();
      await drainAsync();
    });

    // API must have been called exactly once with the correct payload
    expect(mockApiSaveWatchKickSession).toHaveBeenCalledTimes(1);
    expect(mockApiSaveWatchKickSession).toHaveBeenCalledWith(
      expect.objectContaining({
        kickCount: 7,
        startedAt: "2026-08-01T10:00:00.000Z",
        endedAt: "2026-08-01T10:20:00.000Z",
      }),
      expect.any(Function),
    );

    // Queue must be empty after the successful save
    expect(await readWatchKickSessions(userId)).toHaveLength(0);
  });

  // ── 2. Contractions: API called with correct payload, queue empty on success ──

  it("calls apiSaveWatchContraction with the queued payload and empties the queue after a successful flush", async () => {
    const gen = getWatchQueueGeneration(userId);
    await enqueueWatchContraction(
      {
        startedAt: "2026-08-02T14:00:00.000Z",
        endedAt: "2026-08-02T14:01:00.000Z",
        durationSeconds: 60,
        intervalSeconds: 300,
        sessionDate: "2026-08-02",
      },
      userId,
      gen,
    );

    expect(await readWatchContractions(userId)).toHaveLength(1);

    act(() => {
      create(React.createElement(SyncHost));
    });

    await act(async () => {
      goOfflineThenOnline();
      await drainAsync();
    });

    expect(mockApiSaveWatchContraction).toHaveBeenCalledTimes(1);
    expect(mockApiSaveWatchContraction).toHaveBeenCalledWith(
      expect.objectContaining({
        startedAt: "2026-08-02T14:00:00.000Z",
        durationSeconds: 60,
        intervalSeconds: 300,
        sessionDate: "2026-08-02",
      }),
      expect.any(Function),
    );

    expect(await readWatchContractions(userId)).toHaveLength(0);
  });

  // ── 3. Both queues flushed in a single reconnect ──────────────────────────────

  it("flushes both the kick-session and contraction queues in one reconnect event", async () => {
    const gen = getWatchQueueGeneration(userId);
    await enqueueWatchKickSession(
      {
        kickCount: 3,
        startedAt: "2026-08-03T09:00:00.000Z",
        endedAt: "2026-08-03T09:10:00.000Z",
      },
      userId,
      gen,
    );
    await enqueueWatchContraction(
      {
        startedAt: "2026-08-03T09:30:00.000Z",
        durationSeconds: 45,
        sessionDate: "2026-08-03",
      },
      userId,
      gen,
    );

    act(() => {
      create(React.createElement(SyncHost));
    });

    await act(async () => {
      goOfflineThenOnline();
      await drainAsync();
    });

    expect(mockApiSaveWatchKickSession).toHaveBeenCalledTimes(1);
    expect(mockApiSaveWatchContraction).toHaveBeenCalledTimes(1);
    expect(await readWatchKickSessions(userId)).toHaveLength(0);
    expect(await readWatchContractions(userId)).toHaveLength(0);
  });

  // ── 4. Kick session stays queued when the API fails on reconnect ──────────────

  it("leaves the kick session in the queue when apiSaveWatchKickSession throws on reconnect", async () => {
    mockApiSaveWatchKickSession.mockRejectedValueOnce(
      new Error("still offline"),
    );

    const gen = getWatchQueueGeneration(userId);
    await enqueueWatchKickSession(
      {
        kickCount: 2,
        startedAt: "2026-08-04T08:00:00.000Z",
        endedAt: "2026-08-04T08:05:00.000Z",
      },
      userId,
      gen,
    );

    act(() => {
      create(React.createElement(SyncHost));
    });

    await act(async () => {
      goOfflineThenOnline();
      await drainAsync();
    });

    // API was attempted
    expect(mockApiSaveWatchKickSession).toHaveBeenCalledTimes(1);

    // Item must remain in the queue so the next reconnect can retry it
    const after = await readWatchKickSessions(userId);
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ kickCount: 2 });
  });

  // ── 5. Contraction stays queued when the API fails on reconnect ───────────────

  it("leaves the contraction in the queue when apiSaveWatchContraction throws on reconnect", async () => {
    mockApiSaveWatchContraction.mockRejectedValueOnce(new Error("timeout"));

    const gen = getWatchQueueGeneration(userId);
    await enqueueWatchContraction(
      {
        startedAt: "2026-08-05T11:00:00.000Z",
        durationSeconds: 55,
        sessionDate: "2026-08-05",
      },
      userId,
      gen,
    );

    act(() => {
      create(React.createElement(SyncHost));
    });

    await act(async () => {
      goOfflineThenOnline();
      await drainAsync();
    });

    expect(mockApiSaveWatchContraction).toHaveBeenCalledTimes(1);

    const after = await readWatchContractions(userId);
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ durationSeconds: 55 });
  });

  // ── 6. Multiple queued kick sessions are all flushed ─────────────────────────

  it("flushes all queued kick sessions — not just the first — on reconnect", async () => {
    const gen = getWatchQueueGeneration(userId);
    await enqueueWatchKickSession(
      {
        kickCount: 5,
        startedAt: "2026-08-06T10:00:00.000Z",
        endedAt: "2026-08-06T10:10:00.000Z",
      },
      userId,
      gen,
    );
    await enqueueWatchKickSession(
      {
        kickCount: 8,
        startedAt: "2026-08-06T11:00:00.000Z",
        endedAt: "2026-08-06T11:15:00.000Z",
      },
      userId,
      gen,
    );

    act(() => {
      create(React.createElement(SyncHost));
    });

    await act(async () => {
      goOfflineThenOnline();
      await drainAsync();
    });

    expect(mockApiSaveWatchKickSession).toHaveBeenCalledTimes(2);
    expect(await readWatchKickSessions(userId)).toHaveLength(0);
  });

  // ── 7. Per-item removal: first item removed even when second item fails ────────

  it("removes the successfully saved item and retains the failed one when a queue has mixed outcomes", async () => {
    mockApiSaveWatchKickSession
      .mockResolvedValueOnce(undefined) // first item succeeds
      .mockRejectedValueOnce(new Error("server error")); // second item fails

    const gen = getWatchQueueGeneration(userId);
    await enqueueWatchKickSession(
      {
        kickCount: 10,
        startedAt: "2026-08-07T08:00:00.000Z",
        endedAt: "2026-08-07T08:10:00.000Z",
      },
      userId,
      gen,
    );
    await enqueueWatchKickSession(
      {
        kickCount: 12,
        startedAt: "2026-08-07T09:00:00.000Z",
        endedAt: "2026-08-07T09:10:00.000Z",
      },
      userId,
      gen,
    );

    act(() => {
      create(React.createElement(SyncHost));
    });

    await act(async () => {
      goOfflineThenOnline();
      await drainAsync();
    });

    expect(mockApiSaveWatchKickSession).toHaveBeenCalledTimes(2);

    // Only the failed item (kickCount: 12) must remain
    const after = await readWatchKickSessions(userId);
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ kickCount: 12 });
  });

  // ── 8. No duplicate saves when the queue is already empty on reconnect ─────────

  it("does not call apiSaveWatchKickSession when the kick queue is empty on reconnect", async () => {
    // No items enqueued — queue is empty

    act(() => {
      create(React.createElement(SyncHost));
    });

    await act(async () => {
      goOfflineThenOnline();
      await drainAsync();
    });

    expect(mockApiSaveWatchKickSession).not.toHaveBeenCalled();
    expect(mockApiSaveWatchContraction).not.toHaveBeenCalled();
  });
});
