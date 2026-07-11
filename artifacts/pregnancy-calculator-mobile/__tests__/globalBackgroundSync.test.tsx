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

// ─── sync-api mock ────────────────────────────────────────────────────────────

jest.mock("@/lib/sync-api", () => ({
  apiUpsertJournalEntry: jest.fn(async () => ({})),
  apiSaveHospitalBag: jest.fn(async () => {}),
  apiSaveBirthPlanAnswers: jest.fn(async () => {}),
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
} from "@/lib/sync-queue";
import { loadEntries, replaceEntryId } from "@/lib/journal";
import { loadHospitalBagChecklist } from "@/lib/hospital-bag";
import { loadBirthPlanAnswers } from "@/lib/birth-plan";
import {
  apiUpsertJournalEntry,
  apiSaveHospitalBag,
  apiSaveBirthPlanAnswers,
} from "@/lib/sync-api";
import { useGlobalBackgroundSync } from "@/hooks/useGlobalBackgroundSync";

const mockUseAuth = useAuth as jest.Mock;
const mockHasPendingSync = hasPendingSync as jest.Mock;
const mockClearPendingSync = clearPendingSync as jest.Mock;
const mockTryAcquireSyncLock = tryAcquireSyncLock as jest.Mock;
const mockLoadEntries = loadEntries as jest.Mock;
const mockReplaceEntryId = replaceEntryId as jest.Mock;
const mockLoadHospitalBag = loadHospitalBagChecklist as jest.Mock;
const mockLoadBirthPlan = loadBirthPlanAnswers as jest.Mock;
const mockApiUpsertJournal = apiUpsertJournalEntry as jest.Mock;
const mockApiSaveHospitalBag = apiSaveHospitalBag as jest.Mock;
const mockApiSaveBirthPlan = apiSaveBirthPlanAnswers as jest.Mock;

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
    mockUseAuth.mockReturnValue({
      isSignedIn: true,
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
