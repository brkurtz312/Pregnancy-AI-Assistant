/**
 * Confirms that pending sync markers are flushed on network reconnect even
 * when the journal / hospital-bag / birth-plan screens are NOT mounted.
 *
 * The test renders a minimal component that calls useGlobalBackgroundSync
 * (the same hook mounted at the root layout level), so the retry path is
 * exercised without any tool screen in the navigation stack.
 */

import React from "react";
import { act, create } from "react-test-renderer";

// ─── Clerk mock ───────────────────────────────────────────────────────────────

jest.mock("@clerk/expo", () => ({
  useAuth: jest.fn(),
}));

// ─── NetInfo (captures the listener so tests can fire state changes) ──────────

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
      isConnected: true,
      isInternetReachable: true,
    })),
  },
}));

// ─── Sync queue ───────────────────────────────────────────────────────────────

jest.mock("@/lib/sync-queue", () => ({
  hasPendingSync: jest.fn(async () => false),
  clearPendingSync: jest.fn(async () => {}),
  markPendingSync: jest.fn(async () => {}),
  tryAcquireSyncLock: jest.fn(() => true),
  releaseSyncLock: jest.fn(),
  getWatchQueueGeneration: jest.fn(() => 0),
  readWatchKickSessions: jest.fn(async () => []),
  removeWatchKickSessionById: jest.fn(async () => {}),
  readWatchContractions: jest.fn(async () => []),
  removeWatchContractionById: jest.fn(async () => {}),
  invalidateWatchQueueSession: jest.fn(async () => {}),
  isKickSessionRecentlySaved: jest.fn().mockResolvedValue(false),
  markKickSessionSaved: jest.fn().mockResolvedValue(undefined),
}));

// ─── Journal lib ──────────────────────────────────────────────────────────────

jest.mock("@/lib/journal", () => ({
  loadEntries: jest.fn(async () => []),
  replaceEntryId: jest.fn(async () => {}),
}));

// ─── Hospital-bag lib ─────────────────────────────────────────────────────────

jest.mock("@/lib/hospital-bag", () => ({
  loadHospitalBagChecklist: jest.fn(async () => []),
}));

// ─── Birth-plan lib ───────────────────────────────────────────────────────────

jest.mock("@/lib/birth-plan", () => ({
  loadBirthPlanAnswers: jest.fn(async () => ({})),
}));

// ─── React Query — useQueryClient is called by the hook; stub it out ─────────

const mockInvalidateQueries = jest.fn().mockResolvedValue(undefined);

jest.mock("@tanstack/react-query", () => ({
  useQueryClient: jest.fn(() => ({
    invalidateQueries: mockInvalidateQueries,
    getQueryData: jest.fn().mockReturnValue(undefined),
  })),
}));

// ─── API client query-key helpers ─────────────────────────────────────────────

jest.mock("@workspace/api-client-react", () => ({
  getListKickSessionsQueryKey: jest.fn((p: object) => ["kick-sessions", p]),
  getListContractionsQueryKey: jest.fn((p: object) => ["contractions", p]),
  getGetProfileQueryKey: jest.fn(() => ["profile"]),
}));

// ─── sync-api mock ────────────────────────────────────────────────────────────

jest.mock("@/lib/sync-api", () => ({
  apiUpsertJournalEntry: jest.fn(async () => ({})),
  apiSaveHospitalBag: jest.fn(async () => {}),
  apiSaveBirthPlanAnswers: jest.fn(async () => {}),
  apiSaveWatchKickSession: jest.fn(async () => {}),
  apiSaveWatchContraction: jest.fn(async () => {}),
  // WatchBackgroundListener direct-save helpers (not used by this hook)
  apiDirectSaveKickSession: jest.fn(async () => {}),
  apiDirectSaveContraction: jest.fn(async () => {}),
  isServerUuid: jest.fn((id: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id),
  ),
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { useAuth } from "@clerk/expo";
import {
  hasPendingSync,
  clearPendingSync,
  tryAcquireSyncLock,
  getWatchQueueGeneration,
} from "@/lib/sync-queue";
import { loadEntries, replaceEntryId } from "@/lib/journal";
import { loadHospitalBagChecklist } from "@/lib/hospital-bag";
import { loadBirthPlanAnswers } from "@/lib/birth-plan";
import {
  apiUpsertJournalEntry,
  apiSaveHospitalBag,
  apiSaveBirthPlanAnswers,
  apiSaveWatchKickSession,
  apiSaveWatchContraction,
} from "@/lib/sync-api";
import {
  readWatchKickSessions,
  removeWatchKickSessionById,
  readWatchContractions,
  removeWatchContractionById,
} from "@/lib/sync-queue";
import { useGlobalBackgroundSync } from "@/hooks/useGlobalBackgroundSync";

const mockUseAuth = useAuth as jest.Mock;
const mockHasPendingSync = hasPendingSync as jest.Mock;
const mockClearPendingSync = clearPendingSync as jest.Mock;
const mockTryAcquireSyncLock = tryAcquireSyncLock as jest.Mock;
const mockGetWatchQueueGeneration = getWatchQueueGeneration as jest.Mock;
const mockLoadEntries = loadEntries as jest.Mock;
const mockReplaceEntryId = replaceEntryId as jest.Mock;
const mockLoadHospitalBag = loadHospitalBagChecklist as jest.Mock;
const mockLoadBirthPlan = loadBirthPlanAnswers as jest.Mock;
const mockApiUpsertJournal = apiUpsertJournalEntry as jest.Mock;
const mockApiSaveHospitalBag = apiSaveHospitalBag as jest.Mock;
const mockApiSaveBirthPlan = apiSaveBirthPlanAnswers as jest.Mock;
const mockApiSaveWatchKickSession = apiSaveWatchKickSession as jest.Mock;
const mockApiSaveWatchContraction = apiSaveWatchContraction as jest.Mock;
const mockReadWatchKickSessions = readWatchKickSessions as jest.Mock;
const mockRemoveWatchKickSessionById = removeWatchKickSessionById as jest.Mock;
const mockReadWatchContractions = readWatchContractions as jest.Mock;
const mockRemoveWatchContractionById = removeWatchContractionById as jest.Mock;

// ─── Minimal host component ───────────────────────────────────────────────────

function SyncHost() {
  useGlobalBackgroundSync();
  return null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function goOfflineThenOnline() {
  act(() => {
    netInfoListener?.({ isConnected: false });
  });
  act(() => {
    netInfoListener?.({ isConnected: true });
  });
}

const SERVER_UUID = "00000000-0000-4000-8000-000000000001";

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("useGlobalBackgroundSync — fires without tool screens mounted", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    netInfoListener = null;
    // Restore the default sync-lock behaviour after any test that overrides it
    // (clearAllMocks does NOT clear mockReturnValue overrides — only mockReset
    // does — so we must reset it explicitly).
    mockTryAcquireSyncLock.mockReturnValue(true);
    // mockResolvedValue overrides also persist across tests; restore defaults.
    mockReadWatchKickSessions.mockResolvedValue([]);
    mockReadWatchContractions.mockResolvedValue([]);
    mockApiSaveWatchKickSession.mockResolvedValue(undefined);
    mockApiSaveWatchContraction.mockResolvedValue(undefined);
    mockUseAuth.mockReturnValue({
      isSignedIn: true,
      userId: "user-test",
      getToken: jest.fn(async () => "tok"),
    });
  });

  it("does nothing when there are no pending sync markers", async () => {
    mockHasPendingSync.mockResolvedValue(false);

    act(() => {
      create(React.createElement(SyncHost));
    });

    await act(async () => {
      goOfflineThenOnline();
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(mockApiUpsertJournal).not.toHaveBeenCalled();
    expect(mockApiSaveHospitalBag).not.toHaveBeenCalled();
    expect(mockApiSaveBirthPlan).not.toHaveBeenCalled();
  });

  it("syncs a local-only journal entry on reconnect without the journal screen mounted", async () => {
    const LOCAL_ENTRY = {
      id: "local-abc",
      text: "Offline entry",
      mood: undefined,
      gestationalWeeks: 20,
      gestationalDays: 0,
      postpartumDays: undefined,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      media: [],
    };

    mockHasPendingSync.mockImplementation(
      async (key: string) => key === "journal",
    );
    mockLoadEntries.mockResolvedValue([LOCAL_ENTRY]);
    mockApiUpsertJournal.mockResolvedValue({ ...LOCAL_ENTRY, id: SERVER_UUID });

    act(() => {
      create(React.createElement(SyncHost));
    });

    await act(async () => {
      goOfflineThenOnline();
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(mockApiUpsertJournal).toHaveBeenCalledWith(
      expect.objectContaining({ id: "local-abc" }),
      expect.any(Function),
    );
    expect(mockClearPendingSync).toHaveBeenCalledWith("journal");
    expect(mockApiSaveHospitalBag).not.toHaveBeenCalled();
    expect(mockApiSaveBirthPlan).not.toHaveBeenCalled();
  });

  it("replaces the local entry ID with the server UUID to prevent duplicate upserts", async () => {
    // This is the key regression test: the journal screen later opens and reads
    // local storage.  If the entry still has a local (non-UUID) ID it will be
    // treated as un-synced and re-upserted, creating a duplicate on the server.
    // The global sync must call replaceEntryId so the stored ID becomes the
    // server UUID before the screen ever mounts.
    const LOCAL_ENTRY = {
      id: "local-dup",
      text: "Duplicate risk entry",
      mood: undefined,
      gestationalWeeks: 28,
      gestationalDays: 0,
      postpartumDays: undefined,
      createdAt: "2026-03-01T00:00:00.000Z",
      updatedAt: "2026-03-01T00:00:00.000Z",
      media: [],
    };

    mockHasPendingSync.mockImplementation(
      async (key: string) => key === "journal",
    );
    mockLoadEntries.mockResolvedValue([LOCAL_ENTRY]);
    mockApiUpsertJournal.mockResolvedValue({ ...LOCAL_ENTRY, id: SERVER_UUID });

    act(() => {
      create(React.createElement(SyncHost));
    });

    await act(async () => {
      goOfflineThenOnline();
      await new Promise((r) => setTimeout(r, 0));
    });

    // replaceEntryId must have been called with the old local ID → new server UUID
    expect(mockReplaceEntryId).toHaveBeenCalledWith("local-dup", SERVER_UUID);
    // Pending marker cleared only after successful ID replacement
    expect(mockClearPendingSync).toHaveBeenCalledWith("journal");
  });

  it("does not clear the pending marker when the upsert fails so the next reconnect retries", async () => {
    const LOCAL_ENTRY = {
      id: "local-fail",
      text: "Entry that fails to sync",
      mood: undefined,
      gestationalWeeks: 10,
      gestationalDays: 0,
      postpartumDays: undefined,
      createdAt: "2026-02-01T00:00:00.000Z",
      updatedAt: "2026-02-01T00:00:00.000Z",
      media: [],
    };

    mockHasPendingSync.mockImplementation(
      async (key: string) => key === "journal",
    );
    mockLoadEntries.mockResolvedValue([LOCAL_ENTRY]);
    mockApiUpsertJournal.mockRejectedValue(new Error("network error"));

    act(() => {
      create(React.createElement(SyncHost));
    });

    await act(async () => {
      goOfflineThenOnline();
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(mockApiUpsertJournal).toHaveBeenCalled();
    // Marker must NOT be cleared — the next reconnect should retry
    expect(mockClearPendingSync).not.toHaveBeenCalledWith("journal");
    // Local ID must NOT be replaced (upsert failed — server has no record)
    expect(mockReplaceEntryId).not.toHaveBeenCalled();
  });

  it("syncs pending hospital-bag data on reconnect without the hospital-bag screen mounted", async () => {
    const CATEGORIES = [
      {
        id: "cat1",
        title: "For Mum",
        items: [{ id: "item1", label: "Pyjamas", checked: true }],
      },
    ];

    mockHasPendingSync.mockImplementation(
      async (key: string) => key === "hospital-bag",
    );
    mockLoadHospitalBag.mockResolvedValue(CATEGORIES);

    act(() => {
      create(React.createElement(SyncHost));
    });

    await act(async () => {
      goOfflineThenOnline();
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(mockApiSaveHospitalBag).toHaveBeenCalledWith(
      CATEGORIES,
      expect.any(Function),
    );
    expect(mockClearPendingSync).toHaveBeenCalledWith("hospital-bag");
    expect(mockApiUpsertJournal).not.toHaveBeenCalled();
    expect(mockApiSaveBirthPlan).not.toHaveBeenCalled();
  });

  it("syncs pending birth-plan data on reconnect without the birth-plan screen mounted", async () => {
    const ANSWERS = { moveFreelyDuringLabour: true };

    mockHasPendingSync.mockImplementation(
      async (key: string) => key === "birth-plan",
    );
    mockLoadBirthPlan.mockResolvedValue(ANSWERS);

    act(() => {
      create(React.createElement(SyncHost));
    });

    await act(async () => {
      goOfflineThenOnline();
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(mockApiSaveBirthPlan).toHaveBeenCalledWith(
      ANSWERS,
      expect.any(Function),
    );
    expect(mockClearPendingSync).toHaveBeenCalledWith("birth-plan");
    expect(mockApiUpsertJournal).not.toHaveBeenCalled();
    expect(mockApiSaveHospitalBag).not.toHaveBeenCalled();
  });

  it("syncs all three pending markers on a single reconnect", async () => {
    const LOCAL_ENTRY = {
      id: "local-xyz",
      text: "Multi-sync entry",
      mood: undefined,
      gestationalWeeks: 30,
      gestationalDays: 0,
      postpartumDays: undefined,
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
      media: [],
    };
    const CATEGORIES = [{ id: "c1", title: "Bag", items: [] }];
    const ANSWERS = { labourEnvironment: "quiet" };

    mockHasPendingSync.mockResolvedValue(true);
    mockLoadEntries.mockResolvedValue([LOCAL_ENTRY]);
    mockApiUpsertJournal.mockResolvedValue({
      ...LOCAL_ENTRY,
      id: "00000000-0000-4000-8000-000000000002",
    });
    mockLoadHospitalBag.mockResolvedValue(CATEGORIES);
    mockLoadBirthPlan.mockResolvedValue(ANSWERS);

    act(() => {
      create(React.createElement(SyncHost));
    });

    await act(async () => {
      goOfflineThenOnline();
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(mockApiUpsertJournal).toHaveBeenCalled();
    expect(mockApiSaveHospitalBag).toHaveBeenCalled();
    expect(mockApiSaveBirthPlan).toHaveBeenCalled();
    expect(mockClearPendingSync).toHaveBeenCalledWith("journal");
    expect(mockClearPendingSync).toHaveBeenCalledWith("hospital-bag");
    expect(mockClearPendingSync).toHaveBeenCalledWith("birth-plan");
  });

  it("defers journal sync to the mounted screen when the sync lock is already held", async () => {
    // Simulates the race: the journal screen's reconnect handler acquired the
    // lock just before the global hook fired.  The global hook must bail out
    // immediately rather than running a concurrent upsert that would create a
    // duplicate server entry.
    const LOCAL_ENTRY = {
      id: "local-race",
      text: "Race condition entry",
      mood: undefined,
      gestationalWeeks: 24,
      gestationalDays: 0,
      postpartumDays: undefined,
      createdAt: "2026-04-01T00:00:00.000Z",
      updatedAt: "2026-04-01T00:00:00.000Z",
      media: [],
    };

    mockHasPendingSync.mockImplementation(
      async (key: string) => key === "journal",
    );
    mockLoadEntries.mockResolvedValue([LOCAL_ENTRY]);
    // Lock is already held by the journal screen
    mockTryAcquireSyncLock.mockReturnValue(false);

    act(() => {
      create(React.createElement(SyncHost));
    });

    await act(async () => {
      goOfflineThenOnline();
      await new Promise((r) => setTimeout(r, 0));
    });

    // Global hook must not touch the API when the lock is held elsewhere
    expect(mockApiUpsertJournal).not.toHaveBeenCalled();
    expect(mockReplaceEntryId).not.toHaveBeenCalled();
    expect(mockClearPendingSync).not.toHaveBeenCalledWith("journal");
  });

  it("does not flush a Watch kick session if the session generation advances while the token is being resolved (account-switch race)", async () => {
    // Scenario: user A is signed in, queued kick session is about to be flushed.
    // While getToken() is awaiting (Clerk resolving the session), user A signs
    // out and user B signs in.  The generation counter advances.  The post-
    // token-fetch guard must detect this and bail out — A's frozen token must
    // NEVER reach the API call that would POST A's health data to B's account.
    const pendingSession = {
      _clientId: "token-race-guard",
      kickCount: 4,
      startedAt: "2026-08-01T11:00:00.000Z",
      endedAt: "2026-08-01T11:15:00.000Z",
    };
    mockReadWatchKickSessions.mockResolvedValue([pendingSession]);

    // Control the generation counter precisely:
    //   call 1 → genAtStart = 0  (before lock)
    //   call 2 → pre-request guard = 0  (passes: 0 === 0)
    //   call 3 → post-token-fetch guard = 1  (FAILS: 1 !== 0 → return without POST)
    //   subsequent calls (contraction genAtStart, etc.) → 0
    mockGetWatchQueueGeneration
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(1)
      .mockReturnValue(0);

    // Mount and drain the initial-mount flush (same path as
    // "flushes pending Watch kick sessions on app launch" test).
    await act(async () => {
      create(React.createElement(SyncHost));
      await new Promise((r) => setTimeout(r, 0));
      await new Promise((r) => setTimeout(r, 0));
    });

    // Generation advanced before the HTTP request → API must not be called
    expect(mockApiSaveWatchKickSession).not.toHaveBeenCalled();
    // Item must remain in the queue so it can be retried on the next reconnect
    expect(mockRemoveWatchKickSessionById).not.toHaveBeenCalled();
  });

  it("flushes pending Watch kick sessions on app launch when already online (no network reconnect required)", async () => {
    // Simulates: Watch fires kick session while offline → app is killed →
    // app relaunches while already online.  In this scenario no offline → online
    // network transition occurs, so useNetReconnect never fires.
    //
    // useGlobalBackgroundSync has an initial-mount useEffect that calls
    // NetInfo.fetch(); if the device is already online it runs the Watch flush.
    // This test verifies that path by also simulating the NetInfo initial-state
    // callback (which real NetInfo fires synchronously on addEventListener),
    // triggering the reconnect handler as a belt-and-suspenders coverage for
    // the relaunch scenario.  Both paths call syncPendingWatchKickSessions.
    const pendingSession = {
      _clientId: "local-kick-1",
      kickCount: 5,
      startedAt: "2026-08-01T10:00:00.000Z",
      endedAt: "2026-08-01T10:20:00.000Z",
    };
    mockReadWatchKickSessions.mockResolvedValue([pendingSession]);

    // Mount the component and drain effects + their async work in one async act.
    // NetInfo.fetch() is called from the useEffect; its .then() chain includes
    // syncPendingWatchKickSessions → apiSaveWatchKickSession → removeWatch...
    await act(async () => {
      create(React.createElement(SyncHost));
      // Allow effects to fire (React 19 may schedule them asynchronously)
      await new Promise((r) => setTimeout(r, 0));
      // Drain any further chained microtasks from the Watch flush
      await new Promise((r) => setTimeout(r, 0));
    });

    // The session must have been saved and removed from the queue
    expect(mockApiSaveWatchKickSession).toHaveBeenCalledWith(
      pendingSession,
      expect.any(Function),
    );
    expect(mockRemoveWatchKickSessionById).toHaveBeenCalledWith(
      "user-test",
      "local-kick-1",
    );
  });

  it("invalidates the kick-session list query after a queued Watch kick session is flushed", async () => {
    const pendingSession = {
      _clientId: "invalidate-kick-1",
      kickCount: 3,
      startedAt: "2026-08-02T09:00:00.000Z",
      endedAt: "2026-08-02T09:10:00.000Z",
    };
    mockReadWatchKickSessions.mockResolvedValue([pendingSession]);

    await act(async () => {
      create(React.createElement(SyncHost));
      await new Promise((r) => setTimeout(r, 0));
      await new Promise((r) => setTimeout(r, 0));
    });

    // The save must have succeeded…
    expect(mockApiSaveWatchKickSession).toHaveBeenCalled();
    // …and the Tools tab kick-session list cache must have been invalidated so
    // the list refreshes without manual navigation.
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ["kick-sessions", { limit: 10, offset: 0 }],
    });
  });

  it("invalidates the contraction list query after a queued Watch contraction is flushed", async () => {
    const pendingContraction = {
      _clientId: "invalidate-contraction-1",
      startedAt: "2026-08-02T12:00:00.000Z",
      durationSeconds: 45,
    };
    mockReadWatchContractions.mockResolvedValue([pendingContraction]);

    await act(async () => {
      create(React.createElement(SyncHost));
      await new Promise((r) => setTimeout(r, 0));
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(mockApiSaveWatchContraction).toHaveBeenCalledWith(
      pendingContraction,
      expect.any(Function),
    );
    expect(mockRemoveWatchContractionById).toHaveBeenCalledWith(
      "user-test",
      "invalidate-contraction-1",
    );
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: [
        "contractions",
        { sessionDate: new Date().toISOString().slice(0, 10), limit: 50 },
      ],
    });
  });

  it("invalidates the kick-session list query when a queued Watch kick session is flushed by the reconnect handler", async () => {
    // Force the initial-mount NetInfo.fetch() path to see the device offline
    // so ONLY the offline → online reconnect handler performs the flush.
    const NetInfo = jest.requireMock("@react-native-community/netinfo").default;
    (NetInfo.fetch as jest.Mock).mockResolvedValueOnce({
      isConnected: false,
      isInternetReachable: false,
    });

    const pendingSession = {
      _clientId: "reconnect-kick-1",
      kickCount: 6,
      startedAt: "2026-08-03T08:00:00.000Z",
      endedAt: "2026-08-03T08:12:00.000Z",
    };
    mockReadWatchKickSessions.mockResolvedValue([pendingSession]);

    await act(async () => {
      create(React.createElement(SyncHost));
      await new Promise((r) => setTimeout(r, 0));
    });

    // Mount path saw offline → nothing flushed, nothing invalidated yet.
    expect(mockApiSaveWatchKickSession).not.toHaveBeenCalled();
    expect(mockInvalidateQueries).not.toHaveBeenCalled();

    await act(async () => {
      goOfflineThenOnline();
      await new Promise((r) => setTimeout(r, 0));
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(mockApiSaveWatchKickSession).toHaveBeenCalledWith(
      pendingSession,
      expect.any(Function),
    );
    expect(mockRemoveWatchKickSessionById).toHaveBeenCalledWith(
      "user-test",
      "reconnect-kick-1",
    );
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ["kick-sessions", { limit: 10, offset: 0 }],
    });
  });

  it("invalidates the contraction list query when a queued Watch contraction is flushed by the reconnect handler", async () => {
    const NetInfo = jest.requireMock("@react-native-community/netinfo").default;
    (NetInfo.fetch as jest.Mock).mockResolvedValueOnce({
      isConnected: false,
      isInternetReachable: false,
    });

    const pendingContraction = {
      _clientId: "reconnect-contraction-1",
      startedAt: "2026-08-03T13:00:00.000Z",
      durationSeconds: 60,
    };
    mockReadWatchContractions.mockResolvedValue([pendingContraction]);

    await act(async () => {
      create(React.createElement(SyncHost));
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(mockApiSaveWatchContraction).not.toHaveBeenCalled();
    expect(mockInvalidateQueries).not.toHaveBeenCalled();

    await act(async () => {
      goOfflineThenOnline();
      await new Promise((r) => setTimeout(r, 0));
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(mockApiSaveWatchContraction).toHaveBeenCalledWith(
      pendingContraction,
      expect.any(Function),
    );
    expect(mockRemoveWatchContractionById).toHaveBeenCalledWith(
      "user-test",
      "reconnect-contraction-1",
    );
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: [
        "contractions",
        { sessionDate: new Date().toISOString().slice(0, 10), limit: 50 },
      ],
    });
  });

  it("does not invalidate any query cache when the reconnect flush save fails", async () => {
    const NetInfo = jest.requireMock("@react-native-community/netinfo").default;
    (NetInfo.fetch as jest.Mock).mockResolvedValueOnce({
      isConnected: false,
      isInternetReachable: false,
    });

    const pendingSession = {
      _clientId: "reconnect-fail-1",
      kickCount: 1,
      startedAt: "2026-08-03T15:00:00.000Z",
      endedAt: "2026-08-03T15:03:00.000Z",
    };
    mockReadWatchKickSessions.mockResolvedValue([pendingSession]);
    mockApiSaveWatchKickSession.mockRejectedValue(new Error("network error"));

    await act(async () => {
      create(React.createElement(SyncHost));
      await new Promise((r) => setTimeout(r, 0));
    });

    await act(async () => {
      goOfflineThenOnline();
      await new Promise((r) => setTimeout(r, 0));
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(mockApiSaveWatchKickSession).toHaveBeenCalled();
    // Item stays queued for the next reconnect; no invalidation fires.
    expect(mockRemoveWatchKickSessionById).not.toHaveBeenCalled();
    expect(mockInvalidateQueries).not.toHaveBeenCalled();
  });

  it("does not invalidate any query cache when the flush save fails", async () => {
    const pendingSession = {
      _clientId: "fail-no-invalidate",
      kickCount: 2,
      startedAt: "2026-08-02T14:00:00.000Z",
      endedAt: "2026-08-02T14:05:00.000Z",
    };
    mockReadWatchKickSessions.mockResolvedValue([pendingSession]);
    mockApiSaveWatchKickSession.mockRejectedValue(new Error("network error"));

    await act(async () => {
      create(React.createElement(SyncHost));
      await new Promise((r) => setTimeout(r, 0));
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(mockApiSaveWatchKickSession).toHaveBeenCalled();
    // Failed save: item stays queued and no invalidation fires.
    expect(mockRemoveWatchKickSessionById).not.toHaveBeenCalled();
    expect(mockInvalidateQueries).not.toHaveBeenCalled();
  });

  it("skips sync entirely when the user is not signed in", async () => {
    mockUseAuth.mockReturnValue({ isSignedIn: false, getToken: jest.fn() });
    mockHasPendingSync.mockResolvedValue(true);

    act(() => {
      create(React.createElement(SyncHost));
    });

    await act(async () => {
      goOfflineThenOnline();
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(mockHasPendingSync).not.toHaveBeenCalled();
    expect(mockApiUpsertJournal).not.toHaveBeenCalled();
    expect(mockApiSaveHospitalBag).not.toHaveBeenCalled();
    expect(mockApiSaveBirthPlan).not.toHaveBeenCalled();
  });
});
