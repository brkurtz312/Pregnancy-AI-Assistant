/**
 * Screen-level orphan media index cleanup test
 *
 * Exercises the journal.tsx merge path end-to-end to confirm that
 * pruneOrphanedMediaIndexKeys is called (and actually removes stale keys)
 * when the server omits an entry that still has a media index key locally.
 *
 * This complements the lib-level unit tests in journalMediaOrphanCleanup.test.ts
 * and guards against regressions such as:
 *   - The pruneOrphanedMediaIndexKeys call being moved after cacheEntries
 *     (or removed entirely) in journal.tsx
 *   - The Set passed to pruneOrphanedMediaIndexKeys being built incorrectly
 *     (e.g. from localEntries instead of the merged list)
 *
 * Unlike the other sync tests, this file does NOT mock @/lib/journal.
 * The real implementation runs against the in-memory AsyncStorage mock so the
 * test can directly inspect AsyncStorage state after the sync completes.
 */

import React from "react";
import { act, create } from "react-test-renderer";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { flushAsync } from "../test-helpers/testUtils";
import {
  JOURNAL_KEY,
  JOURNAL_OWNER_KEY,
  JOURNAL_MEDIA_INDEX_KEY,
  loadMediaIndex,
} from "@/lib/journal";
import type { JournalEntry, JournalMedia } from "@/lib/journal";

// ─── RN + Expo infrastructure mocks ──────────────────────────────────────────

jest.mock("expo-file-system/legacy", () => ({
  documentDirectory: "/tmp/",
  getInfoAsync: jest.fn(async () => ({ exists: true })),
  makeDirectoryAsync: jest.fn(async () => {}),
  copyAsync: jest.fn(async () => {}),
  deleteAsync: jest.fn(async () => {}),
}));

import * as FileSystem from "expo-file-system/legacy";
const mockDeleteAsync = FileSystem.deleteAsync as jest.Mock;

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

jest.mock("expo-image", () => ({ Image: "Image" }));
jest.mock("@/lib/journal-pdf", () => ({ exportJournalPdf: jest.fn() }));
jest.mock("@/hooks/usePass", () => ({ usePass: () => ({ hasPass: false }) }));
jest.mock("@/components/PassGate", () => ({ PassGate: () => null }));
jest.mock("@/constants/free-limits", () => ({
  FREE_JOURNAL_ENTRY_LIMIT: 5,
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

// ─── Sync queue + banner mocks ────────────────────────────────────────────────

jest.mock("@/lib/sync-queue", () => ({
  markPendingSync: jest.fn(async () => {}),
  clearPendingSync: jest.fn(async () => {}),
  hasPendingSync: jest.fn(async () => false),
  tryAcquireSyncLock: jest.fn(() => true),
  releaseSyncLock: jest.fn(),
}));

jest.mock("@/hooks/useNetReconnect", () => ({
  useNetReconnect: jest.fn(),
}));

jest.mock("@/components/SyncBanner", () => ({
  SyncBanner: () => null,
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

import { useAuth, useUser } from "@clerk/expo";
import { apiLoadJournalEntries } from "@/lib/sync-api";

const mockUseAuth = useAuth as jest.Mock;
const mockUseUser = useUser as jest.Mock;
const mockApiLoadJournal = apiLoadJournalEntries as jest.Mock;

function setSignedIn(id = "user-orphan-test") {
  mockUseAuth.mockReturnValue({
    isSignedIn: true,
    getToken: jest.fn(async () => "tok"),
  });
  mockUseUser.mockReturnValue({ user: { id } });
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const SURVIVING_ENTRY: JournalEntry = {
  id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  text: "This entry survives on the server",
  mood: "happy",
  gestationalWeeks: 20,
  gestationalDays: 0,
  createdAt: "2026-04-01T09:00:00.000Z",
  updatedAt: "2026-04-01T09:00:00.000Z",
  media: [],
};

const DELETED_ENTRY_ID = "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff";

const ORPHANED_MEDIA: JournalMedia[] = [
  {
    id: "photo-orphan-001",
    uri: "file:///tmp/journal-media/photo-orphan-001.jpg",
    type: "photo",
    category: "bump",
  },
];

// ─── Tests ────────────────────────────────────────────────────────────────────

jest.setTimeout(15000);

describe("Journal screen — orphaned media index keys cleaned up during sync", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    mockDeleteAsync.mockClear();
    setSignedIn();
    await AsyncStorage.clear();
  });

  it("removes the media index key for an entry that the server no longer returns", async () => {
    // Seed: local cache has both entries (surviving + the one deleted server-side)
    const localEntries: JournalEntry[] = [
      SURVIVING_ENTRY,
      {
        id: DELETED_ENTRY_ID,
        text: "This entry was deleted on the server",
        mood: "grateful",
        gestationalWeeks: 24,
        gestationalDays: 0,
        createdAt: "2026-05-01T10:00:00.000Z",
        updatedAt: "2026-05-01T10:00:00.000Z",
        media: ORPHANED_MEDIA,
      },
    ];
    await AsyncStorage.setItem(JOURNAL_KEY, JSON.stringify(localEntries));

    // Seed: cache owner matches signed-in user so no cross-user wipe fires
    await AsyncStorage.setItem(JOURNAL_OWNER_KEY, "user-orphan-test");

    // Seed: media index has a key for the deleted entry
    const initialMediaIndex = { [DELETED_ENTRY_ID]: ORPHANED_MEDIA };
    await AsyncStorage.setItem(
      JOURNAL_MEDIA_INDEX_KEY,
      JSON.stringify(initialMediaIndex),
    );

    // Server only returns the surviving entry — the deleted entry is absent
    mockApiLoadJournal.mockResolvedValue([SURVIVING_ENTRY]);

    const JournalScreen = require("../app/journal").default;
    act(() => {
      create(React.createElement(JournalScreen));
    });
    await flushAsync();

    // The stale media index key must be gone after the merge
    const indexAfterSync = await loadMediaIndex();
    expect(indexAfterSync[DELETED_ENTRY_ID]).toBeUndefined();

    // The on-disk file for the orphaned photo must have been deleted
    expect(mockDeleteAsync).toHaveBeenCalledWith(ORPHANED_MEDIA[0].uri, {
      idempotent: true,
    });
  });

  it("keeps the media index key for entries that are still present on the server", async () => {
    // Surviving entry also has media — its index key must be preserved
    const survivingMedia: JournalMedia[] = [
      {
        id: "photo-keep-001",
        uri: "file:///tmp/journal-media/photo-keep-001.jpg",
        type: "photo",
        category: "ultrasound",
      },
    ];

    const localEntries: JournalEntry[] = [
      { ...SURVIVING_ENTRY, media: survivingMedia },
    ];
    await AsyncStorage.setItem(JOURNAL_KEY, JSON.stringify(localEntries));
    await AsyncStorage.setItem(JOURNAL_OWNER_KEY, "user-orphan-test");

    // Media index has the surviving entry AND a stale key for a deleted entry
    const initialMediaIndex = {
      [SURVIVING_ENTRY.id]: survivingMedia,
      [DELETED_ENTRY_ID]: ORPHANED_MEDIA,
    };
    await AsyncStorage.setItem(
      JOURNAL_MEDIA_INDEX_KEY,
      JSON.stringify(initialMediaIndex),
    );

    // Server returns only the surviving entry
    mockApiLoadJournal.mockResolvedValue([{ ...SURVIVING_ENTRY, media: [] }]);

    const JournalScreen = require("../app/journal").default;
    act(() => {
      create(React.createElement(JournalScreen));
    });
    await flushAsync();

    const indexAfterSync = await loadMediaIndex();

    // Orphaned key for the deleted entry must be gone
    expect(indexAfterSync[DELETED_ENTRY_ID]).toBeUndefined();

    // Key for the surviving entry must still be present
    expect(indexAfterSync[SURVIVING_ENTRY.id]).toEqual(survivingMedia);
  });

  it("renders the surviving entry text after the sync that prunes orphaned keys", async () => {
    // Confirms the merge path completed correctly and the UI reflects it
    await AsyncStorage.setItem(JOURNAL_KEY, JSON.stringify([SURVIVING_ENTRY]));
    await AsyncStorage.setItem(JOURNAL_OWNER_KEY, "user-orphan-test");
    await AsyncStorage.setItem(
      JOURNAL_MEDIA_INDEX_KEY,
      JSON.stringify({ [DELETED_ENTRY_ID]: ORPHANED_MEDIA }),
    );

    mockApiLoadJournal.mockResolvedValue([SURVIVING_ENTRY]);

    const JournalScreen = require("../app/journal").default;
    let renderer: ReturnType<typeof create>;
    act(() => {
      renderer = create(React.createElement(JournalScreen));
    });
    await flushAsync();

    const json = JSON.stringify(renderer!.toJSON());
    expect(json).toContain("This entry survives on the server");
  });

  it("does not render a photo badge for the entry deleted on the server", async () => {
    // Scenario: user had entry X on the server with a local photo. While offline,
    // another device deleted entry X on the server. The media index still holds
    // the photo for X (only the local deleteEntry path removes it). The local
    // entry cache was already cleared by a previous logout/login cycle so the
    // deleted entry is NOT in localEntries — it exists only as an orphaned key
    // in the media index.
    //
    // After the next sync the merge produces a list that does not include X.
    // pruneOrphanedMediaIndexKeys evicts the stale key. The rendered journal
    // list must NOT show the photo badge (URI) for the deleted entry.

    const SURVIVING_PHOTO: JournalMedia = {
      id: "photo-keeps-001",
      uri: "file:///tmp/journal-media/photo-keeps-001.jpg",
      type: "photo",
      category: "bump",
    };

    // Local cache: only the surviving entry (deleted entry is absent)
    await AsyncStorage.setItem(
      JOURNAL_KEY,
      JSON.stringify([{ ...SURVIVING_ENTRY, media: [SURVIVING_PHOTO] }]),
    );
    await AsyncStorage.setItem(JOURNAL_OWNER_KEY, "user-orphan-test");

    // Media index: surviving entry's photo + orphaned key for the deleted entry
    await AsyncStorage.setItem(
      JOURNAL_MEDIA_INDEX_KEY,
      JSON.stringify({
        [SURVIVING_ENTRY.id]: [SURVIVING_PHOTO],
        [DELETED_ENTRY_ID]: ORPHANED_MEDIA,
      }),
    );

    // Server returns only the surviving entry — the deleted entry is absent
    mockApiLoadJournal.mockResolvedValue([{ ...SURVIVING_ENTRY, media: [] }]);

    const JournalScreen = require("../app/journal").default;
    let renderer: ReturnType<typeof create>;
    act(() => {
      renderer = create(React.createElement(JournalScreen));
    });
    await flushAsync();

    const json = JSON.stringify(renderer!.toJSON());

    // The orphaned photo URI must NOT appear anywhere in the rendered tree
    expect(json).not.toContain(ORPHANED_MEDIA[0].uri);

    // The surviving entry's photo badge IS present (confirms the merge
    // re-attached media correctly for entries still on the server)
    expect(json).toContain(SURVIVING_PHOTO.uri);

    // The media index must also be clean — orphaned key is gone
    const indexAfterSync = await loadMediaIndex();
    expect(indexAfterSync[DELETED_ENTRY_ID]).toBeUndefined();
    expect(indexAfterSync[SURVIVING_ENTRY.id]).toEqual([SURVIVING_PHOTO]);
  });

  // NOTE: This test is intentionally last.  Its AsyncStorage.setItem spy writes
  // directly to __INTERNAL_MOCK_STORAGE__ (bypassing the normal async mock chain)
  // to avoid dangling Promises that could leak into subsequent tests.  Keeping it
  // last means any residual in-flight work has nowhere to corrupt.
  it("completes sync and renders entries even when the prune write to AsyncStorage fails", async () => {
    // Seed AsyncStorage with data before replacing setItem — these writes go
    // through the real in-memory mock so the sync has something to work with.
    await AsyncStorage.setItem(JOURNAL_KEY, JSON.stringify([SURVIVING_ENTRY]));
    await AsyncStorage.setItem(JOURNAL_OWNER_KEY, "user-orphan-test");
    // Orphaned key: DELETED_ENTRY_ID will be absent from the server response,
    // which causes pruneOrphanedMediaIndexKeys to attempt a write.
    await AsyncStorage.setItem(
      JOURNAL_MEDIA_INDEX_KEY,
      JSON.stringify({ [DELETED_ENTRY_ID]: ORPHANED_MEDIA }),
    );

    // Server only returns the surviving entry — prune write is needed.
    mockApiLoadJournal.mockResolvedValue([SURVIVING_ENTRY]);

    // Intercept console.warn before rendering.
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    // Replace setItem so only the JOURNAL_MEDIA_INDEX_KEY write fails.
    //
    // IMPORTANT: for passing keys we write directly to __INTERNAL_MOCK_STORAGE__
    // rather than delegating to the real asMock.setItem.  The real asMock.setItem
    // is async (it awaits asMock.multiSet), which adds extra microtask ticks to the
    // sync chain and can leave cacheEntries/setJournalCacheOwner in-flight when the
    // test ends.  Writing synchronously here eliminates that async depth so the spy
    // does not produce dangling Promises.  The test is also positioned last to
    // ensure any residual async has no subsequent test to corrupt.
    type MockedStorage = typeof AsyncStorage & {
      __INTERNAL_MOCK_STORAGE__: Record<string, string>;
    };
    const internalStore = (AsyncStorage as MockedStorage)
      .__INTERNAL_MOCK_STORAGE__;
    const setItemSpy = jest
      .spyOn(AsyncStorage, "setItem")
      .mockImplementation(async (key: string, value: string) => {
        if (key === JOURNAL_MEDIA_INDEX_KEY) {
          // Simulates a storage-full error that only affects the prune write.
          throw new Error("Simulated storage-full error for prune write");
        }
        internalStore[key] = value;
      });

    try {
      const JournalScreen = require("../app/journal").default;
      let renderer: ReturnType<typeof create>;
      act(() => {
        renderer = create(React.createElement(JournalScreen));
      });
      await flushAsync();

      // The sync must complete — the surviving entry must appear in the
      // rendered tree even though the prune write failed.
      const json = JSON.stringify(renderer!.toJSON());
      expect(json).toContain("This entry survives on the server");

      // At least one warn must reference pruneOrphanedMediaIndexKeys so that
      // the journal.tsx catch block (and the lib-level catch block) are proven
      // to have fired.
      const allWarnMessages = warnSpy.mock.calls.map((args) =>
        args.map(String).join(" "),
      );
      expect(
        allWarnMessages.some((msg) =>
          msg.includes("pruneOrphanedMediaIndexKeys"),
        ),
      ).toBe(true);
    } finally {
      warnSpy.mockRestore();
      setItemSpy.mockRestore();
    }
  });
});
