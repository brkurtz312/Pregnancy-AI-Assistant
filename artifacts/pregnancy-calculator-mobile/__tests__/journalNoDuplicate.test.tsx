/**
 * Combined integration test: global sync hook → journal screen sync path
 *
 * Scenario: the global background sync hook fires on reconnect (because the
 * journal screen is NOT mounted) and successfully pushes a local-ID entry to
 * the server.  The hook calls replaceEntryId so AsyncStorage is updated with
 * the server UUID.  Shortly after, the journal screen mounts and runs its own
 * sync pass.  This test confirms the screen does NOT call apiUpsertJournalEntry
 * a second time — the entry in AsyncStorage already carries the server UUID so
 * it is NOT in localOnlyEntries.
 *
 * Unlike globalBackgroundSync.test.tsx (which mocks @/lib/journal entirely),
 * this file lets the real journal lib functions run against the in-memory
 * AsyncStorage mock configured in jest.  That allows replaceEntryId to
 * physically update storage in Phase 1, and loadEntries in Phase 2 to read
 * the updated value, proving the no-duplicate guarantee end-to-end.
 */

import React from "react";
import { act, create } from "react-test-renderer";
import AsyncStorage from "@react-native-async-storage/async-storage";

// ─── expo-file-system/legacy mock (imported by lib/journal.ts) ────────────────
// Only documentDirectory is used at module-load time; the async methods are
// only called by deleteEntry / copyMediaToDocuments which are not exercised here.

jest.mock("expo-file-system/legacy", () => ({
  documentDirectory: "/tmp/",
  getInfoAsync: jest.fn(async () => ({ exists: true })),
  makeDirectoryAsync: jest.fn(async () => {}),
  copyAsync: jest.fn(async () => {}),
  deleteAsync: jest.fn(async () => {}),
}));

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

// ─── React Query — useQueryClient is called by the hook; stub it out ─────────

jest.mock("@tanstack/react-query", () => ({
  useQueryClient: jest.fn(() => ({
    invalidateQueries: jest.fn().mockResolvedValue(undefined),
    getQueryData: jest.fn().mockReturnValue(undefined),
  })),
}));

// ─── API client query-key helpers ─────────────────────────────────────────────

jest.mock("@workspace/api-client-react", () => ({
  getListKickSessionsQueryKey: jest.fn((p: object) => ["kick-sessions", p]),
  getListContractionsQueryKey: jest.fn((p: object) => ["contractions", p]),
  getGetProfileQueryKey: jest.fn(() => ["profile"]),
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
}));

// ─── sync-api mock ────────────────────────────────────────────────────────────
// apiUpsertJournalEntry is mocked so we can control the return value and count
// calls.  isServerUuid uses the real regex so the journal lib's filter works.

jest.mock("@/lib/sync-api", () => ({
  apiUpsertJournalEntry: jest.fn(async () => ({})),
  apiLoadJournalEntries: jest.fn(async () => []),
  apiSaveHospitalBag: jest.fn(async () => {}),
  apiSaveBirthPlanAnswers: jest.fn(async () => {}),
  isServerUuid: jest.fn((id: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id),
  ),
}));

// ─── Hospital-bag / birth-plan libs ───────────────────────────────────────────

jest.mock("@/lib/hospital-bag", () => ({
  loadHospitalBagChecklist: jest.fn(async () => []),
}));

jest.mock("@/lib/birth-plan", () => ({
  loadBirthPlanAnswers: jest.fn(async () => ({})),
}));

// ─── NOTE: @/lib/journal is NOT mocked ───────────────────────────────────────
// Real loadEntries / upsertEntry / replaceEntryId run against the in-memory
// AsyncStorage mock wired up by moduleNameMapper in package.json.

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { useAuth } from "@clerk/expo";
import {
  hasPendingSync,
  clearPendingSync,
  tryAcquireSyncLock,
} from "@/lib/sync-queue";
import { apiUpsertJournalEntry, apiLoadJournalEntries } from "@/lib/sync-api";
import { upsertEntry, loadEntries } from "@/lib/journal";
import { useGlobalBackgroundSync } from "@/hooks/useGlobalBackgroundSync";

const mockUseAuth = useAuth as jest.Mock;
const mockHasPendingSync = hasPendingSync as jest.Mock;
const mockClearPendingSync = clearPendingSync as jest.Mock;
const mockTryAcquireSyncLock = tryAcquireSyncLock as jest.Mock;
const mockApiUpsertJournal = apiUpsertJournalEntry as jest.Mock;
const mockApiLoadJournal = apiLoadJournalEntries as jest.Mock;

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const SERVER_UUID = "00000000-0000-4000-8000-000000000099";

const LOCAL_ENTRY = {
  id: "local-dup-check",
  text: "Written offline, risk of duplicate",
  mood: undefined,
  gestationalWeeks: 22,
  gestationalDays: 3,
  postpartumDays: undefined,
  createdAt: "2026-05-01T08:00:00.000Z",
  updatedAt: "2026-05-01T08:00:00.000Z",
  media: [] as never[],
} as const;

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

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Global sync → journal screen: no duplicate upsert", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    netInfoListener = null;

    // Wipe the in-memory AsyncStorage between tests so there is no cross-test
    // contamination.
    await AsyncStorage.clear();

    mockUseAuth.mockReturnValue({
      isSignedIn: true,
      userId: "user-test",
      getToken: jest.fn(async () => "tok"),
    });
  });

  it("replaceEntryId updates AsyncStorage so the journal screen finds a server UUID and skips re-upsert", async () => {
    // ── Seed AsyncStorage with a local-ID entry ────────────────────────────────
    // This is the state right after the user wrote a journal entry while offline.
    await upsertEntry({ ...LOCAL_ENTRY });

    // Confirm the seeded entry has a local (non-UUID) id.
    const seededEntries = await loadEntries();
    expect(seededEntries).toHaveLength(1);
    expect(seededEntries[0].id).toBe(LOCAL_ENTRY.id);

    // ── Phase 1: global sync hook fires on reconnect ───────────────────────────
    // hasPendingSync returns true for "journal" (marker was set when the entry
    // was written offline).
    mockHasPendingSync.mockImplementation(
      async (key: string) => key === "journal",
    );
    // Lock is free — global hook wins the race (journal screen is not mounted).
    mockTryAcquireSyncLock.mockReturnValue(true);
    // Server responds with the same entry but assigned a UUID.
    mockApiUpsertJournal.mockResolvedValue({ ...LOCAL_ENTRY, id: SERVER_UUID });

    act(() => {
      create(React.createElement(SyncHost));
    });

    await act(async () => {
      goOfflineThenOnline();
      await new Promise((r) => setTimeout(r, 0));
    });

    // The global hook must have called the API exactly once.
    expect(mockApiUpsertJournal).toHaveBeenCalledTimes(1);
    expect(mockApiUpsertJournal).toHaveBeenCalledWith(
      expect.objectContaining({ id: LOCAL_ENTRY.id }),
      expect.any(Function),
    );

    // The pending marker must be cleared after a successful sync.
    expect(mockClearPendingSync).toHaveBeenCalledWith("journal");

    // ── Verify AsyncStorage was physically updated ─────────────────────────────
    // replaceEntryId (real function) must have written the server UUID so the
    // journal screen sees it on its next load.
    const entriesAfterGlobalSync = await loadEntries();
    expect(entriesAfterGlobalSync).toHaveLength(1);
    expect(entriesAfterGlobalSync[0].id).toBe(SERVER_UUID);

    // ── Phase 2: journal screen's sync path runs ───────────────────────────────
    // The screen fetches the authoritative list from the server (same UUID).
    mockApiLoadJournal.mockResolvedValue([
      { ...LOCAL_ENTRY, id: SERVER_UUID, media: [] },
    ]);

    // Replicate the journal screen's localOnlyEntries decision logic:
    //   serverEntries  = what the server returned
    //   localEntries   = what AsyncStorage holds (updated by Phase 1)
    //   localOnlyEntries = entries whose IDs are NOT in the server set
    const serverEntries = await mockApiLoadJournal();
    const localEntries = await loadEntries();
    const serverIds = new Set(serverEntries.map((e: { id: string }) => e.id));
    const localOnlyEntries = localEntries.filter(
      (e: { id: string }) => !serverIds.has(e.id),
    );

    // Push any local-only entries (this is exactly what journal.tsx does).
    for (const e of localOnlyEntries) {
      await apiUpsertJournalEntry(
        e as Parameters<typeof apiUpsertJournalEntry>[0],
        async () => "tok",
      );
    }

    // The API must still have been called exactly ONCE in total — the Phase 1
    // global sync.  Phase 2 found zero local-only entries (the entry's ID is
    // now a server UUID that is present in the server response), so it did not
    // call apiUpsertJournalEntry again.
    expect(mockApiUpsertJournal).toHaveBeenCalledTimes(1);
    expect(localOnlyEntries).toHaveLength(0);
  });

  it("global sync replaces the local ID in AsyncStorage so a subsequent loadEntries call sees only the server UUID", async () => {
    // Simpler companion test: just verifies the storage state after Phase 1
    // without simulating Phase 2 inline.  Useful as a standalone regression
    // guard for the replaceEntryId integration.
    await upsertEntry({ ...LOCAL_ENTRY });

    mockHasPendingSync.mockImplementation(
      async (key: string) => key === "journal",
    );
    mockTryAcquireSyncLock.mockReturnValue(true);
    mockApiUpsertJournal.mockResolvedValue({ ...LOCAL_ENTRY, id: SERVER_UUID });

    act(() => {
      create(React.createElement(SyncHost));
    });

    await act(async () => {
      goOfflineThenOnline();
      await new Promise((r) => setTimeout(r, 0));
    });

    const entries = await loadEntries();
    // There must be exactly one entry and its ID must be the server UUID.
    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe(SERVER_UUID);
    // The original local ID must no longer exist in storage.
    const localIdStillPresent = entries.some((e) => e.id === LOCAL_ENTRY.id);
    expect(localIdStillPresent).toBe(false);
  });

  it("does not replace the local ID when the upsert fails, leaving the entry available for a retry", async () => {
    await upsertEntry({ ...LOCAL_ENTRY });

    mockHasPendingSync.mockImplementation(
      async (key: string) => key === "journal",
    );
    mockTryAcquireSyncLock.mockReturnValue(true);
    mockApiUpsertJournal.mockRejectedValue(new Error("network error"));

    act(() => {
      create(React.createElement(SyncHost));
    });

    await act(async () => {
      goOfflineThenOnline();
      await new Promise((r) => setTimeout(r, 0));
    });

    // The local ID must still be in storage so the next reconnect retries.
    const entries = await loadEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe(LOCAL_ENTRY.id);

    // Pending marker must NOT be cleared.
    expect(mockClearPendingSync).not.toHaveBeenCalledWith("journal");
  });

  it("journal screen finds no local-only entries when global sync already promoted all local IDs", async () => {
    // Multi-entry variant: two offline entries, both synced by the global hook.
    const LOCAL_ENTRY_2 = {
      id: "local-second",
      text: "Second offline entry",
      mood: undefined,
      gestationalWeeks: 23,
      gestationalDays: 0,
      postpartumDays: undefined,
      createdAt: "2026-05-02T09:00:00.000Z",
      updatedAt: "2026-05-02T09:00:00.000Z",
      media: [] as never[],
    } as const;

    const SERVER_UUID_2 = "00000000-0000-4000-8000-000000000100";

    await upsertEntry({ ...LOCAL_ENTRY });
    await upsertEntry({ ...LOCAL_ENTRY_2 });

    mockHasPendingSync.mockImplementation(
      async (key: string) => key === "journal",
    );
    mockTryAcquireSyncLock.mockReturnValue(true);

    // Return different server UUIDs for each entry based on the local ID.
    mockApiUpsertJournal.mockImplementation(async (entry: { id: string }) => ({
      ...entry,
      id: entry.id === LOCAL_ENTRY.id ? SERVER_UUID : SERVER_UUID_2,
    }));

    act(() => {
      create(React.createElement(SyncHost));
    });

    await act(async () => {
      goOfflineThenOnline();
      await new Promise((r) => setTimeout(r, 0));
    });

    // Both entries must have been pushed.
    expect(mockApiUpsertJournal).toHaveBeenCalledTimes(2);

    // AsyncStorage must hold only server UUIDs now.
    const entries = await loadEntries();
    expect(entries).toHaveLength(2);
    const ids = new Set(entries.map((e) => e.id));
    expect(ids.has(SERVER_UUID)).toBe(true);
    expect(ids.has(SERVER_UUID_2)).toBe(true);
    expect(ids.has(LOCAL_ENTRY.id)).toBe(false);
    expect(ids.has(LOCAL_ENTRY_2.id)).toBe(false);

    // Journal screen's localOnlyEntries logic against server state containing
    // both UUIDs: must find zero local-only entries.
    mockApiLoadJournal.mockResolvedValue([
      { ...LOCAL_ENTRY, id: SERVER_UUID, media: [] },
      { ...LOCAL_ENTRY_2, id: SERVER_UUID_2, media: [] },
    ]);

    const serverEntries = await mockApiLoadJournal();
    const localEntries = await loadEntries();
    const serverIds = new Set(serverEntries.map((e: { id: string }) => e.id));
    const localOnlyEntries = localEntries.filter(
      (e: { id: string }) => !serverIds.has(e.id),
    );

    for (const e of localOnlyEntries) {
      await apiUpsertJournalEntry(
        e as Parameters<typeof apiUpsertJournalEntry>[0],
        async () => "tok",
      );
    }

    // Still 2 total (Phase 1 only), no extra calls from Phase 2.
    expect(mockApiUpsertJournal).toHaveBeenCalledTimes(2);
    expect(localOnlyEntries).toHaveLength(0);
  });
});
