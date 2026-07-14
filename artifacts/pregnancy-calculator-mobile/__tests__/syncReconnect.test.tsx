/**
 * Offline-edits-on-reconnect test
 *
 * Scenario: the user writes journal entries while NetInfo reports
 * `isConnected: false`.  Those entries get local IDs (non-UUIDs) and are
 * persisted to AsyncStorage only.  When the network comes back the
 * `useNetReconnect` hook fires `syncNowRef.current()`, which runs the same
 * incremental-sync loop used at mount time.  This test exercises that
 * hook-integration path — distinct from the mount-time sync covered by
 * `syncColdReinstall.test.tsx`.
 *
 * Assertions:
 *   1. `apiUpsertJournalEntry` is called for every local-only entry once the
 *      reconnect callback fires.
 *   2. Entries that already exist on the server are NOT pushed again (no
 *      duplicates).
 *   3. The merged list (server + pushed local) is displayed in the UI.
 *   4. `cacheEntries` is called with the authoritative merged set so the next
 *      cold start has correct server UUIDs.
 */

import React from "react";
import { act, create } from "react-test-renderer";
import { flushAsync } from "../test-helpers/testUtils";

// This file uses fake timers + multiple flushAsync rounds.  Under concurrent
// CI load (all workspace test suites running in parallel) the combined act()
// overhead can exceed Jest's default 5 s per-test limit.  15 s gives
// comfortable headroom without masking genuinely hung tests.
jest.setTimeout(15000);

// ─── Shared RN mocks ──────────────────────────────────────────────────────────

jest.mock("react-native-reanimated", () =>
  require("react-native-reanimated/mock"),
);

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock("@expo/vector-icons", () => ({ Ionicons: "Ionicons" }));

jest.mock("@/hooks/useColors", () => ({
  useColors: () => ({
    background: "#fff",
    card: "#fff",
    border: "#eee",
    primary: "#e86cad",
    primaryForeground: "#fff",
    foreground: "#000",
    mutedForeground: "#666",
    muted: "#f5f5f5",
    accent: "#f0f0f0",
  }),
}));

// ─── Clerk mock ───────────────────────────────────────────────────────────────

jest.mock("@clerk/expo", () => ({
  useAuth: jest.fn(),
  useUser: jest.fn(),
}));

// ─── expo-router mock ─────────────────────────────────────────────────────────

jest.mock("expo-router", () => {
  const React = require("react");
  return {
    router: { back: jest.fn(), push: jest.fn() },
    useLocalSearchParams: jest.fn(() => ({})),
    useFocusEffect: (cb: () => (() => void) | void) => {
      React.useEffect(() => {
        cb();
      }, []); // eslint-disable-line react-hooks/exhaustive-deps
    },
  };
});

// ─── NetInfo mock ─────────────────────────────────────────────────────────────
// Starts offline; tests can call `simulateReconnect()` to fire the listener.

jest.mock("@react-native-community/netinfo", () => ({
  __esModule: true,
  default: {
    addEventListener: jest.fn(() => () => {}),
    fetch: jest.fn(async () => ({
      isConnected: false,
      isInternetReachable: false,
    })),
  },
}));

// ─── useNetReconnect mock — captures the callback so tests can fire it ────────

let capturedReconnectCallback: (() => void) | null = null;

jest.mock("@/hooks/useNetReconnect", () => ({
  useNetReconnect: jest.fn((cb: () => void) => {
    capturedReconnectCallback = cb;
  }),
}));

// ─── Sync queue mock ──────────────────────────────────────────────────────────

jest.mock("@/lib/sync-queue", () => ({
  markPendingSync: jest.fn(async () => {}),
  clearPendingSync: jest.fn(async () => {}),
  hasPendingSync: jest.fn(async () => false),
  tryAcquireSyncLock: jest.fn(() => true),
  releaseSyncLock: jest.fn(),
}));

// ─── UI component mocks ───────────────────────────────────────────────────────

jest.mock("@/components/SyncBanner", () => ({ SyncBanner: () => null }));

jest.mock("expo-image", () => ({ Image: "Image" }));
jest.mock("@/lib/journal-pdf", () => ({ exportJournalPdf: jest.fn() }));
jest.mock("@/hooks/usePass", () => ({ usePass: () => ({ hasPass: false }) }));
jest.mock("@/components/PassGate", () => ({ PassGate: () => null }));
jest.mock("@/constants/free-limits", () => ({
  FREE_JOURNAL_ENTRY_LIMIT: 5,
}));

// ─── Journal lib mock ─────────────────────────────────────────────────────────

jest.mock("@/lib/journal", () => ({
  loadEntries: jest.fn(),
  cacheEntries: jest.fn(async () => {}),
  getAgeLabel: jest.fn(() => "Week 36"),
  MOOD_OPTIONS: [],
  getJournalCacheOwner: jest.fn(async () => "user-offline"),
  setJournalCacheOwner: jest.fn(async () => {}),
  clearJournalCache: jest.fn(async () => {}),
  loadMediaIndex: jest.fn(async () => ({})),
  reindexMediaForEntry: jest.fn(async () => {}),
  pruneOrphanedMediaIndexKeys: jest.fn(async () => {}),
  sweepUnreferencedMediaFiles: jest.fn(async () => {}),
  getMediaIndexFailCount: jest.fn(async () => 0),
  MEDIA_INDEX_PERSIST_FAIL_THRESHOLD: 3,
}));

// ─── Sync API mock ────────────────────────────────────────────────────────────

jest.mock("@/lib/sync-api", () => ({
  apiLoadJournalEntries: jest.fn(),
  apiUpsertJournalEntry: jest.fn(),
  apiLoadHospitalBag: jest.fn(),
  apiSaveHospitalBag: jest.fn(),
  apiLoadBirthPlanAnswers: jest.fn(),
  apiSaveBirthPlanAnswers: jest.fn(),
  isServerUuid: jest.fn((id: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id),
  ),
}));

// ─── Imports after mocks ──────────────────────────────────────────────────────

import { useAuth, useUser } from "@clerk/expo";
import { apiLoadJournalEntries, apiUpsertJournalEntry } from "@/lib/sync-api";
import { loadEntries, cacheEntries, getJournalCacheOwner } from "@/lib/journal";

const mockUseAuth = useAuth as jest.Mock;
const mockUseUser = useUser as jest.Mock;
const mockApiLoadJournal = apiLoadJournalEntries as jest.Mock;
const mockApiUpsert = apiUpsertJournalEntry as jest.Mock;
const mockLoadEntries = loadEntries as jest.Mock;
const mockCacheEntries = cacheEntries as jest.Mock;
const mockGetJournalCacheOwner = getJournalCacheOwner as jest.Mock;

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const SERVER_ENTRY_1 = {
  id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  text: "Glucose test done — all clear!",
  mood: "happy",
  gestationalWeeks: 28,
  gestationalDays: 0,
  postpartumDays: undefined,
  createdAt: "2026-04-01T10:00:00.000Z",
  updatedAt: "2026-04-01T10:00:00.000Z",
  media: [],
};

/** Written while offline — local ID (non-UUID). */
const OFFLINE_ENTRY_1 = {
  id: "local-offline-reconnect-001",
  text: "Felt strong kicks tonight while offline.",
  mood: "excited",
  gestationalWeeks: 32,
  gestationalDays: 3,
  postpartumDays: undefined,
  createdAt: "2026-05-05T21:00:00.000Z",
  updatedAt: "2026-05-05T21:00:00.000Z",
  media: [],
};

/** Written while offline — local ID (non-UUID). */
const OFFLINE_ENTRY_2 = {
  id: "local-offline-reconnect-002",
  text: "Nursery fully set up — so excited!",
  mood: "calm",
  gestationalWeeks: 35,
  gestationalDays: 1,
  postpartumDays: undefined,
  createdAt: "2026-05-18T14:00:00.000Z",
  updatedAt: "2026-05-18T14:00:00.000Z",
  media: [],
};

/** What the server returns after the offline entries are pushed. */
const SYNCED_ENTRY_1 = {
  ...OFFLINE_ENTRY_1,
  id: "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff",
};
const SYNCED_ENTRY_2 = {
  ...OFFLINE_ENTRY_2,
  id: "cccccccc-dddd-4eee-8fff-000000000000",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function setSignedIn(id = "user-offline") {
  mockUseAuth.mockReturnValue({
    isSignedIn: true,
    getToken: jest.fn(async () => "tok"),
  });
  mockUseUser.mockReturnValue({ user: { id } });
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Journal — offline edits sync back on reconnect (useNetReconnect path)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedReconnectCallback = null;
    setSignedIn();

    mockCacheEntries.mockResolvedValue(undefined);
    mockGetJournalCacheOwner.mockResolvedValue("user-offline");

    // AsyncStorage holds: one server-synced entry + two written offline.
    mockLoadEntries.mockResolvedValue([
      SERVER_ENTRY_1,
      OFFLINE_ENTRY_1,
      OFFLINE_ENTRY_2,
    ]);
  });

  it("pushes local-only entries via apiUpsertJournalEntry when the reconnect callback fires", async () => {
    // First call (mount, offline): the API is unreachable.
    // Second call (reconnect): the API is back and returns the server set.
    mockApiLoadJournal
      .mockRejectedValueOnce(new Error("Network request failed"))
      .mockResolvedValueOnce([SERVER_ENTRY_1]);

    mockApiUpsert
      .mockResolvedValueOnce(SYNCED_ENTRY_1)
      .mockResolvedValueOnce(SYNCED_ENTRY_2);

    const JournalScreen = require("../app/journal").default;
    act(() => {
      create(React.createElement(JournalScreen));
    });

    // Let the initial offline load settle.
    await flushAsync(1);

    // Network is back — fire the reconnect callback captured from
    // useNetReconnect.  This mirrors what the hook does when NetInfo
    // transitions from isConnected=false to isConnected=true.
    expect(capturedReconnectCallback).not.toBeNull();
    await act(async () => {
      capturedReconnectCallback!();
      await new Promise<void>((r) => process.nextTick(r));
    });

    // Both offline entries must have been pushed after the reconnect.
    expect(mockApiUpsert).toHaveBeenCalledTimes(2);
    expect(mockApiUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: "local-offline-reconnect-001" }),
      expect.any(Function),
    );
    expect(mockApiUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: "local-offline-reconnect-002" }),
      expect.any(Function),
    );
  }, 15000);

  it("does NOT push the entry that was already on the server before going offline", async () => {
    mockApiLoadJournal
      .mockRejectedValueOnce(new Error("Network request failed"))
      .mockResolvedValueOnce([SERVER_ENTRY_1]);

    mockApiUpsert
      .mockResolvedValueOnce(SYNCED_ENTRY_1)
      .mockResolvedValueOnce(SYNCED_ENTRY_2);

    const JournalScreen = require("../app/journal").default;
    act(() => {
      create(React.createElement(JournalScreen));
    });
    await flushAsync(1);

    await act(async () => {
      capturedReconnectCallback!();
      await new Promise<void>((r) => process.nextTick(r));
    });

    // Only 2 pushes — not 3 (server entry must not be re-uploaded).
    expect(mockApiUpsert).toHaveBeenCalledTimes(2);
    expect(mockApiUpsert).not.toHaveBeenCalledWith(
      expect.objectContaining({ id: SERVER_ENTRY_1.id }),
      expect.any(Function),
    );
  });

  it("renders offline entries in the UI after the reconnect sync completes", async () => {
    mockApiLoadJournal
      .mockRejectedValueOnce(new Error("Network request failed"))
      .mockResolvedValueOnce([SERVER_ENTRY_1]);

    mockApiUpsert
      .mockResolvedValueOnce(SYNCED_ENTRY_1)
      .mockResolvedValueOnce(SYNCED_ENTRY_2);

    const JournalScreen = require("../app/journal").default;
    let renderer: ReturnType<typeof create>;
    act(() => {
      renderer = create(React.createElement(JournalScreen));
    });
    await flushAsync(1);

    await act(async () => {
      capturedReconnectCallback!();
      await new Promise<void>((r) => process.nextTick(r));
    });

    const json = JSON.stringify(renderer!.toJSON());
    expect(json).toContain("Felt strong kicks tonight while offline.");
    expect(json).toContain("Nursery fully set up — so excited!");
    expect(json).toContain("Glucose test done — all clear!");
  });

  it("caches the merged list (server + pushed offline entries) into AsyncStorage after reconnect", async () => {
    mockApiLoadJournal
      .mockRejectedValueOnce(new Error("Network request failed"))
      .mockResolvedValueOnce([SERVER_ENTRY_1]);

    mockApiUpsert
      .mockResolvedValueOnce(SYNCED_ENTRY_1)
      .mockResolvedValueOnce(SYNCED_ENTRY_2);

    const JournalScreen = require("../app/journal").default;
    act(() => {
      create(React.createElement(JournalScreen));
    });
    await flushAsync(1);

    await act(async () => {
      capturedReconnectCallback!();
      await new Promise<void>((r) => process.nextTick(r));
    });

    // cacheEntries must be called with the authoritative merged result so the
    // next cold start has server UUIDs for every entry.
    expect(mockCacheEntries).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: SERVER_ENTRY_1.id }),
        expect.objectContaining({ id: SYNCED_ENTRY_1.id }),
        expect.objectContaining({ id: SYNCED_ENTRY_2.id }),
      ]),
    );
  });

  it("still renders when one push fails mid-flight during the reconnect sync", async () => {
    mockApiLoadJournal
      .mockRejectedValueOnce(new Error("Network request failed"))
      .mockResolvedValueOnce([SERVER_ENTRY_1]);

    // First push succeeds, second fails (mid-flight drop).
    mockApiUpsert
      .mockResolvedValueOnce(SYNCED_ENTRY_1)
      .mockRejectedValueOnce(new Error("timeout"));

    const JournalScreen = require("../app/journal").default;
    let renderer: ReturnType<typeof create>;
    expect(() => {
      act(() => {
        renderer = create(React.createElement(JournalScreen));
      });
    }).not.toThrow();

    await flushAsync(1);

    await act(async () => {
      capturedReconnectCallback!();
      await new Promise<void>((r) => process.nextTick(r));
    });

    expect(renderer!.toJSON()).not.toBeNull();
    const json = JSON.stringify(renderer!.toJSON());
    // Successfully synced entry is displayed.
    expect(json).toContain("Felt strong kicks tonight while offline.");
    // Failed entry is kept locally with its original id and still displayed.
    expect(json).toContain("Nursery fully set up — so excited!");
  });
});
