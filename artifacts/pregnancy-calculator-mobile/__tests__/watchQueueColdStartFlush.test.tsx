/**
 * watchQueueColdStartFlush.test.tsx
 *
 * Task: confirm the Watch offline queue drains correctly when the app
 * restarts while items are still pending.
 *
 * Scenario: the user recorded kicks/contractions offline, the app was killed
 * before the retry succeeded, and the app is now relaunched while ALREADY
 * online.  No offline → online transition fires, so the reconnect handler
 * never runs — the initial-mount flush in useGlobalBackgroundSync must drain
 * the queues by itself.
 *
 * Strategy: use the REAL sync-queue implementation (AsyncStorage backed by the
 * jest in-memory mock) wrapped with jest.fn spies via requireActual, so the
 * queue state is real AND per-item removal calls (removeWatchKickSessionById /
 * removeWatchContractionById) can be asserted directly.  NetInfo.fetch reports
 * online; the NetInfo listener is never fired, proving the mount path alone
 * performs the flush.  Only sync-api is mocked so no network is required.
 */

import React from "react";
import { act, create } from "react-test-renderer";
import AsyncStorage from "@react-native-async-storage/async-storage";

// ── Clerk ─────────────────────────────────────────────────────────────────────
jest.mock("@clerk/expo", () => ({
  useAuth: jest.fn(),
}));

// ── NetInfo — device is ALREADY online at mount; the listener is never fired ──
jest.mock("@react-native-community/netinfo", () => ({
  __esModule: true,
  default: {
    addEventListener: jest.fn(() => () => {}),
    fetch: jest.fn(async () => ({
      isConnected: true,
      isInternetReachable: true,
    })),
  },
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

// ── React Query ───────────────────────────────────────────────────────────────
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

// ── sync-api — mocked so no network is required ───────────────────────────────
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

// ── sync-queue — REAL implementation with spy wrappers on removal fns ─────────
// requireActual keeps real AsyncStorage-backed queue behaviour; the jest.fn
// wrappers let tests assert per-item removal calls without altering semantics.
jest.mock("@/lib/sync-queue", () => {
  const actual = jest.requireActual("@/lib/sync-queue");
  return {
    ...actual,
    removeWatchKickSessionById: jest.fn(actual.removeWatchKickSessionById),
    removeWatchContractionById: jest.fn(actual.removeWatchContractionById),
  };
});

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
  removeWatchKickSessionById,
  removeWatchContractionById,
  getWatchQueueGeneration,
} from "@/lib/sync-queue";
import { useGlobalBackgroundSync } from "@/hooks/useGlobalBackgroundSync";

const mockUseAuth = useAuth as jest.Mock;
const mockApiSaveWatchKickSession = apiSaveWatchKickSession as jest.Mock;
const mockApiSaveWatchContraction = apiSaveWatchContraction as jest.Mock;
const mockRemoveWatchKickSessionById = removeWatchKickSessionById as jest.Mock;
const mockRemoveWatchContractionById = removeWatchContractionById as jest.Mock;

// ── Minimal host component (same shape as the root layout usage) ──────────────
function SyncHost() {
  useGlobalBackgroundSync();
  return null;
}

/** Mounts SyncHost and drains the initial-mount flush's async work. */
async function mountAndDrain() {
  await act(async () => {
    create(React.createElement(SyncHost));
    // NetInfo.fetch().then(...) → readQueue → save → chained remove: drain a
    // few macrotask turns so every step of the flush completes.
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("useGlobalBackgroundSync — cold-start flush of pending Watch queues", () => {
  // Distinct userId per test: the module-level generation Map and AsyncStorage
  // keys are user-scoped, so this prevents any cross-test bleed.
  let userId: string;
  let testCounter = 0;

  beforeEach(async () => {
    testCounter += 1;
    userId = `user-coldstart-${testCounter}`;
    jest.clearAllMocks();
    await AsyncStorage.clear();
    mockUseAuth.mockReturnValue({
      isSignedIn: true,
      userId,
      getToken: jest.fn(async () => "tok"),
    });
  });

  it("saves each queued kick session on cold start and removes each via removeWatchKickSessionById", async () => {
    const gen = getWatchQueueGeneration(userId);
    await enqueueWatchKickSession(
      {
        kickCount: 7,
        startedAt: "2026-08-10T10:00:00.000Z",
        endedAt: "2026-08-10T10:20:00.000Z",
      },
      userId,
      gen,
    );
    await enqueueWatchKickSession(
      {
        kickCount: 4,
        startedAt: "2026-08-10T11:00:00.000Z",
        endedAt: "2026-08-10T11:12:00.000Z",
      },
      userId,
      gen,
    );

    const queuedBefore = await readWatchKickSessions(userId);
    expect(queuedBefore).toHaveLength(2);

    await mountAndDrain();

    // Every queued item was sent to the API…
    expect(mockApiSaveWatchKickSession).toHaveBeenCalledTimes(2);
    expect(mockApiSaveWatchKickSession).toHaveBeenCalledWith(
      expect.objectContaining({ kickCount: 7 }),
      expect.any(Function),
    );
    expect(mockApiSaveWatchKickSession).toHaveBeenCalledWith(
      expect.objectContaining({ kickCount: 4 }),
      expect.any(Function),
    );

    // …and each was removed individually by its _clientId.
    expect(mockRemoveWatchKickSessionById).toHaveBeenCalledTimes(2);
    expect(mockRemoveWatchKickSessionById).toHaveBeenCalledWith(
      userId,
      queuedBefore[0]._clientId,
    );
    expect(mockRemoveWatchKickSessionById).toHaveBeenCalledWith(
      userId,
      queuedBefore[1]._clientId,
    );

    // Real queue is empty afterwards.
    expect(await readWatchKickSessions(userId)).toHaveLength(0);
  });

  it("saves each queued contraction on cold start and removes each via removeWatchContractionById", async () => {
    const gen = getWatchQueueGeneration(userId);
    await enqueueWatchContraction(
      {
        startedAt: "2026-08-10T14:00:00.000Z",
        endedAt: "2026-08-10T14:01:00.000Z",
        durationSeconds: 60,
        intervalSeconds: 300,
        sessionDate: "2026-08-10",
      },
      userId,
      gen,
    );
    await enqueueWatchContraction(
      {
        startedAt: "2026-08-10T14:06:00.000Z",
        durationSeconds: 50,
        sessionDate: "2026-08-10",
      },
      userId,
      gen,
    );

    const queuedBefore = await readWatchContractions(userId);
    expect(queuedBefore).toHaveLength(2);

    await mountAndDrain();

    expect(mockApiSaveWatchContraction).toHaveBeenCalledTimes(2);
    expect(mockApiSaveWatchContraction).toHaveBeenCalledWith(
      expect.objectContaining({ durationSeconds: 60, intervalSeconds: 300 }),
      expect.any(Function),
    );
    expect(mockApiSaveWatchContraction).toHaveBeenCalledWith(
      expect.objectContaining({ durationSeconds: 50 }),
      expect.any(Function),
    );

    expect(mockRemoveWatchContractionById).toHaveBeenCalledTimes(2);
    expect(mockRemoveWatchContractionById).toHaveBeenCalledWith(
      userId,
      queuedBefore[0]._clientId,
    );
    expect(mockRemoveWatchContractionById).toHaveBeenCalledWith(
      userId,
      queuedBefore[1]._clientId,
    );

    expect(await readWatchContractions(userId)).toHaveLength(0);
  });

  it("drains both queues in the same cold-start flush", async () => {
    const gen = getWatchQueueGeneration(userId);
    await enqueueWatchKickSession(
      {
        kickCount: 3,
        startedAt: "2026-08-11T09:00:00.000Z",
        endedAt: "2026-08-11T09:10:00.000Z",
      },
      userId,
      gen,
    );
    await enqueueWatchContraction(
      {
        startedAt: "2026-08-11T09:30:00.000Z",
        durationSeconds: 45,
        sessionDate: "2026-08-11",
      },
      userId,
      gen,
    );

    await mountAndDrain();

    expect(mockApiSaveWatchKickSession).toHaveBeenCalledTimes(1);
    expect(mockApiSaveWatchContraction).toHaveBeenCalledTimes(1);
    expect(mockRemoveWatchKickSessionById).toHaveBeenCalledTimes(1);
    expect(mockRemoveWatchContractionById).toHaveBeenCalledTimes(1);
    expect(await readWatchKickSessions(userId)).toHaveLength(0);
    expect(await readWatchContractions(userId)).toHaveLength(0);
  });

  it("keeps a kick session queued (no removal) when its save fails on cold start", async () => {
    mockApiSaveWatchKickSession.mockRejectedValueOnce(
      new Error("network still flaky"),
    );

    const gen = getWatchQueueGeneration(userId);
    await enqueueWatchKickSession(
      {
        kickCount: 9,
        startedAt: "2026-08-11T12:00:00.000Z",
        endedAt: "2026-08-11T12:15:00.000Z",
      },
      userId,
      gen,
    );

    await mountAndDrain();

    expect(mockApiSaveWatchKickSession).toHaveBeenCalledTimes(1);
    // Failed save → no removal call, item stays queued for the next attempt.
    expect(mockRemoveWatchKickSessionById).not.toHaveBeenCalled();
    const after = await readWatchKickSessions(userId);
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ kickCount: 9 });
  });

  it("does not call the API on cold start when the queues are empty", async () => {
    await mountAndDrain();

    expect(mockApiSaveWatchKickSession).not.toHaveBeenCalled();
    expect(mockApiSaveWatchContraction).not.toHaveBeenCalled();
    expect(mockRemoveWatchKickSessionById).not.toHaveBeenCalled();
    expect(mockRemoveWatchContractionById).not.toHaveBeenCalled();
  });
});
