/**
 * watchQueueToolsInvalidate.test.tsx
 *
 * Confirms that after useGlobalBackgroundSync flushes queued Watch data on
 * reconnect, it calls invalidateQueries with the correct query keys so the
 * Tools list shows fresh data without requiring a manual refresh.
 *
 * Two scenarios are verified:
 *   1. A queued kick session → invalidated with getListKickSessionsQueryKey({ limit: 10, offset: 0 })
 *   2. A queued contraction  → invalidated with getListContractionsQueryKey() (base key, no params) so every
 *      contraction query is refreshed — including the all-dates view used by Session History.
 */

import React from "react";
import { act, create } from "react-test-renderer";

// ── Clerk ─────────────────────────────────────────────────────────────────────
jest.mock("@clerk/expo", () => ({
  useAuth: jest.fn(),
}));

// ── NetInfo — captures the listener so tests can fire state changes ────────────
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
    // Start offline so the initial-mount flush does NOT fire; only the
    // explicit goOfflineThenOnline() helper triggers the reconnect path.
    fetch: jest.fn(async () => ({
      isConnected: false,
      isInternetReachable: false,
    })),
  },
}));

// ── React Query — captured invalidateQueries spy ───────────────────────────────
const mockInvalidateQueries = jest.fn().mockResolvedValue(undefined);

jest.mock("@tanstack/react-query", () => ({
  useQueryClient: jest.fn(() => ({
    invalidateQueries: mockInvalidateQueries,
    getQueryData: jest.fn().mockReturnValue(undefined),
  })),
}));

// ── API client — query-key helpers return deterministic arrays ────────────────
jest.mock("@workspace/api-client-react", () => ({
  getListKickSessionsQueryKey: jest.fn(
    (p: object) => ["kick-sessions", p] as const,
  ),
  getListContractionsQueryKey: jest.fn(
    (p: object) => ["contractions", p] as const,
  ),
  getGetProfileQueryKey: jest.fn(() => ["profile"]),
}));

// ── Journal / hospital-bag / birth-plan — not under test here ─────────────────
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

// ── sync-api — Watch save helpers are stubs that succeed ──────────────────────
const mockApiSaveWatchKickSession: jest.MockedFunction<
  (session: unknown, getToken: unknown) => Promise<void>
> = jest.fn(async (_session: unknown, _getToken: unknown) => {});
const mockApiSaveWatchContraction: jest.MockedFunction<
  (contraction: unknown, getToken: unknown) => Promise<void>
> = jest.fn(async (_contraction: unknown, _getToken: unknown) => {});

jest.mock("@/lib/sync-api", () => ({
  apiUpsertJournalEntry: jest.fn(async () => ({})),
  apiSaveHospitalBag: jest.fn(async () => {}),
  apiSaveBirthPlanAnswers: jest.fn(async () => {}),
  apiSaveWatchKickSession: (session: unknown, getToken: unknown) =>
    mockApiSaveWatchKickSession(session, getToken),
  apiSaveWatchContraction: (contraction: unknown, getToken: unknown) =>
    mockApiSaveWatchContraction(contraction, getToken),
  isServerUuid: jest.fn(() => true),
}));

// ── sync-queue — all queues empty by default; individual tests override ────────
const mockReadWatchKickSessions: jest.MockedFunction<
  (userId: string) => Promise<unknown[]>
> = jest.fn(async (_userId: string) => []);
const mockReadWatchContractions: jest.MockedFunction<
  (userId: string) => Promise<unknown[]>
> = jest.fn(async (_userId: string) => []);
const mockRemoveWatchKickSessionById: jest.MockedFunction<
  (userId: string, id: string) => Promise<void>
> = jest.fn(async (_userId: string, _id: string) => {});
const mockRemoveWatchContractionById: jest.MockedFunction<
  (userId: string, id: string) => Promise<void>
> = jest.fn(async (_userId: string, _id: string) => {});

jest.mock("@/lib/sync-queue", () => ({
  hasPendingSync: jest.fn(async () => false),
  clearPendingSync: jest.fn(async () => {}),
  markPendingSync: jest.fn(async () => {}),
  tryAcquireSyncLock: jest.fn(() => true),
  releaseSyncLock: jest.fn(),
  getWatchQueueGeneration: jest.fn(() => 0),
  readWatchKickSessions: (userId: string) => mockReadWatchKickSessions(userId),
  removeWatchKickSessionById: (userId: string, id: string) =>
    mockRemoveWatchKickSessionById(userId, id),
  readWatchContractions: (userId: string) => mockReadWatchContractions(userId),
  removeWatchContractionById: (userId: string, id: string) =>
    mockRemoveWatchContractionById(userId, id),
  invalidateWatchQueueSession: jest.fn(async () => {}),
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────────
import { useAuth } from "@clerk/expo";
import {
  getListKickSessionsQueryKey,
  getListContractionsQueryKey,
} from "@workspace/api-client-react";
import { useGlobalBackgroundSync } from "@/hooks/useGlobalBackgroundSync";

const mockUseAuth = useAuth as jest.Mock;
const mockGetListKickSessionsQueryKey =
  getListKickSessionsQueryKey as jest.Mock;
const mockGetListContractionsQueryKey =
  getListContractionsQueryKey as jest.Mock;

// ── Minimal host component ────────────────────────────────────────────────────
function SyncHost() {
  useGlobalBackgroundSync();
  return null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function goOfflineThenOnline() {
  act(() => {
    netInfoListener?.({ isConnected: false });
  });
  act(() => {
    netInfoListener?.({ isConnected: true });
  });
}

async function drainAsync() {
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("useGlobalBackgroundSync — invalidateQueries after Watch queue flush", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    netInfoListener = null;
    // Restore default: all queues empty
    mockReadWatchKickSessions.mockResolvedValue([]);
    mockReadWatchContractions.mockResolvedValue([]);
    mockUseAuth.mockReturnValue({
      isSignedIn: true,
      userId: "user-invalidate-test",
      getToken: jest.fn(async () => "tok"),
    });
  });

  // ── 1. Kick session flush → invalidates with the Tools-list query key ─────────

  it("calls invalidateQueries with getListKickSessionsQueryKey({ limit: 10, offset: 0 }) after flushing a queued kick session", async () => {
    const queuedSession = {
      _clientId: "kick-inv-1",
      kickCount: 5,
      startedAt: "2026-08-10T09:00:00.000Z",
      endedAt: "2026-08-10T09:15:00.000Z",
    };
    mockReadWatchKickSessions.mockResolvedValue([queuedSession]);

    act(() => {
      create(React.createElement(SyncHost));
    });

    await act(async () => {
      goOfflineThenOnline();
      await drainAsync();
    });

    // The API save must have completed first
    expect(mockApiSaveWatchKickSession).toHaveBeenCalledTimes(1);

    // invalidateQueries must have been called with the exact key the Tools
    // list uses: getListKickSessionsQueryKey({ limit: 10, offset: 0 })
    const expectedKey = mockGetListKickSessionsQueryKey({
      limit: 10,
      offset: 0,
    });
    expect(mockInvalidateQueries).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: expectedKey }),
    );
  });

  // ── 2. Contraction flush → invalidates with the base key (prefix match) ─────────

  it("calls invalidateQueries with getListContractionsQueryKey() (base key) after flushing a queued contraction", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const queuedContraction = {
      _clientId: "contraction-inv-1",
      startedAt: "2026-08-10T14:00:00.000Z",
      endedAt: "2026-08-10T14:01:00.000Z",
      durationSeconds: 60,
      intervalSeconds: 300,
      sessionDate: today,
    };
    mockReadWatchContractions.mockResolvedValue([queuedContraction]);

    act(() => {
      create(React.createElement(SyncHost));
    });

    await act(async () => {
      goOfflineThenOnline();
      await drainAsync();
    });

    // The API save must have completed first
    expect(mockApiSaveWatchContraction).toHaveBeenCalledTimes(1);

    // invalidateQueries must use the base key (no params) so React Query
    // prefix-matches ALL contraction queries — the tools-tab single-date view
    // ({ sessionDate, limit:50 }) AND the Session History all-dates view
    // ({ limit:200 }) — without requiring a manual refresh.
    const expectedKey = mockGetListContractionsQueryKey();
    expect(mockInvalidateQueries).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: expectedKey }),
    );
  });

  // ── 3. No invalidation when the kick queue is empty ───────────────────────────

  it("does not call invalidateQueries for kick sessions when the kick queue is empty on reconnect", async () => {
    // kick queue remains empty (default mock); only contraction queue is empty too
    mockReadWatchContractions.mockResolvedValue([]);

    act(() => {
      create(React.createElement(SyncHost));
    });

    await act(async () => {
      goOfflineThenOnline();
      await drainAsync();
    });

    // No saves → no invalidation
    expect(mockApiSaveWatchKickSession).not.toHaveBeenCalled();
    expect(mockApiSaveWatchContraction).not.toHaveBeenCalled();
    expect(mockInvalidateQueries).not.toHaveBeenCalled();
  });

  // ── 4. No invalidation when the kick save fails ───────────────────────────────

  it("does not call invalidateQueries when the kick session API save throws", async () => {
    mockApiSaveWatchKickSession.mockRejectedValueOnce(new Error("offline"));
    mockReadWatchKickSessions.mockResolvedValue([
      {
        _clientId: "kick-fail-1",
        kickCount: 3,
        startedAt: "2026-08-10T10:00:00.000Z",
        endedAt: "2026-08-10T10:05:00.000Z",
      },
    ]);

    act(() => {
      create(React.createElement(SyncHost));
    });

    await act(async () => {
      goOfflineThenOnline();
      await drainAsync();
    });

    // API was attempted but failed
    expect(mockApiSaveWatchKickSession).toHaveBeenCalledTimes(1);
    // Cache must NOT be invalidated — the item is still in the queue
    const kickKey = mockGetListKickSessionsQueryKey({ limit: 10, offset: 0 });
    expect(mockInvalidateQueries).not.toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: kickKey }),
    );
  });

  // ── 5. No invalidation when the contraction save fails ────────────────────────

  it("does not call invalidateQueries when the contraction API save throws", async () => {
    const today = new Date().toISOString().slice(0, 10);
    mockApiSaveWatchContraction.mockRejectedValueOnce(new Error("timeout"));
    mockReadWatchContractions.mockResolvedValue([
      {
        _clientId: "contraction-fail-1",
        startedAt: "2026-08-10T15:00:00.000Z",
        durationSeconds: 45,
        sessionDate: today,
      },
    ]);

    act(() => {
      create(React.createElement(SyncHost));
    });

    await act(async () => {
      goOfflineThenOnline();
      await drainAsync();
    });

    expect(mockApiSaveWatchContraction).toHaveBeenCalledTimes(1);
    // The base contraction key must NOT be invalidated when the save fails —
    // the item stays in the queue for the next retry.
    const baseContractionKey = mockGetListContractionsQueryKey();
    expect(mockInvalidateQueries).not.toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: baseContractionKey }),
    );
  });

  // ── 6. Both queues flushed → both keys invalidated in one reconnect ───────────

  it("invalidates both the kick-session and contraction keys when both queues have pending items", async () => {
    const today = new Date().toISOString().slice(0, 10);
    mockReadWatchKickSessions.mockResolvedValue([
      {
        _clientId: "kick-both-1",
        kickCount: 7,
        startedAt: "2026-08-10T08:00:00.000Z",
        endedAt: "2026-08-10T08:10:00.000Z",
      },
    ]);
    mockReadWatchContractions.mockResolvedValue([
      {
        _clientId: "contraction-both-1",
        startedAt: "2026-08-10T08:30:00.000Z",
        durationSeconds: 55,
        sessionDate: today,
      },
    ]);

    act(() => {
      create(React.createElement(SyncHost));
    });

    await act(async () => {
      goOfflineThenOnline();
      await drainAsync();
    });

    expect(mockApiSaveWatchKickSession).toHaveBeenCalledTimes(1);
    expect(mockApiSaveWatchContraction).toHaveBeenCalledTimes(1);

    // Kick session still uses the specific { limit:10, offset:0 } key.
    const kickKey = mockGetListKickSessionsQueryKey({ limit: 10, offset: 0 });
    // Contraction uses the base key (no params) so every cached variant is
    // refreshed — tools-tab single-date AND Session History all-dates.
    const contractionKey = mockGetListContractionsQueryKey();

    expect(mockInvalidateQueries).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: kickKey }),
    );
    expect(mockInvalidateQueries).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: contractionKey }),
    );
  });
});
