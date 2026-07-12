/**
 * Screen-level offline-edit photo reappearance test
 *
 * Verifies that photos attached to an entry that was created (or edited) while
 * offline are still visible after the entry is promoted from a local base36 ID
 * to a server-assigned UUID during the first successful sync.
 *
 * The critical path under test (journal.tsx):
 *   1. Entry created offline → stored with a local base36 ID.
 *   2. Media index records the photo under that local ID.
 *   3. On reconnect, journal.tsx calls apiUpsertJournalEntry for every
 *      "local-only" entry (one whose ID is not in the server list).
 *   4. Server responds with a new UUID.
 *   5. journal.tsx calls reindexMediaForEntry(localId, serverUuid) to
 *      re-key the media index.
 *   6. loadMediaIndex() must now return the photo under the new server UUID.
 *
 * Unlike syncColdReinstall.test.tsx (which mocks the entire @/lib/journal
 * module), this file does NOT mock @/lib/journal.  The real implementation
 * runs against the in-memory AsyncStorage mock so the test can directly inspect
 * AsyncStorage state after the sync and confirm the re-keying happened.
 *
 * This complements journalPhotoLogoutSurvival.test.tsx (lib-level unit tests
 * for reindexMediaForEntry) and guards against screen-level regressions such as:
 *   - The reindexMediaForEntry call being removed from journal.tsx.
 *   - The call being placed after cacheEntries instead of before it.
 *   - The old local ID remaining in the index alongside (or instead of) the
 *     new server UUID after a successful sync.
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
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      id,
    ),
  ),
}));

import { useAuth, useUser } from "@clerk/expo";
import {
  apiLoadJournalEntries,
  apiUpsertJournalEntry,
} from "@/lib/sync-api";

const mockUseAuth = useAuth as jest.Mock;
const mockUseUser = useUser as jest.Mock;
const mockApiLoadJournal = apiLoadJournalEntries as jest.Mock;
const mockApiUpsert = apiUpsertJournalEntry as jest.Mock;

function setSignedIn(id = "user-offline-photo-test") {
  mockUseAuth.mockReturnValue({
    isSignedIn: true,
    getToken: jest.fn(async () => "tok"),
  });
  mockUseUser.mockReturnValue({ user: { id } });
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const LOCAL_ID = "abc123xyz789";
const SERVER_UUID = "dddddddd-eeee-4fff-8aaa-bbbbbbbbbbbb";

const OFFLINE_PHOTO: JournalMedia = {
  id: "photo-offline-001",
  uri: "file:///tmp/journal-media/photo-offline-001.jpg",
  type: "photo",
  category: "bump",
};

const LOCAL_ENTRY: JournalEntry = {
  id: LOCAL_ID,
  text: "First bump photo — taken while offline",
  mood: "excited",
  gestationalWeeks: 22,
  gestationalDays: 3,
  createdAt: "2026-06-15T08:00:00.000Z",
  updatedAt: "2026-06-15T08:00:00.000Z",
  media: [OFFLINE_PHOTO],
};

const SERVER_ENTRY_PROMOTED: JournalEntry = {
  ...LOCAL_ENTRY,
  id: SERVER_UUID,
  media: [],
};

const EXISTING_SERVER_ENTRY: JournalEntry = {
  id: "aaaaaaaa-1111-4222-8333-cccccccccccc",
  text: "Earlier server entry",
  mood: "happy",
  gestationalWeeks: 20,
  gestationalDays: 0,
  createdAt: "2026-06-01T09:00:00.000Z",
  updatedAt: "2026-06-01T09:00:00.000Z",
  media: [],
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Journal screen — offline entry photos reappear under new server UUID after sync", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    setSignedIn();
    await AsyncStorage.clear();
  });

  it("media is accessible under the server UUID after a local-only entry is promoted during sync", async () => {
    jest.setTimeout(15000);

    // Seed: local entry cache contains the offline entry (local ID only)
    await AsyncStorage.setItem(
      JOURNAL_KEY,
      JSON.stringify([EXISTING_SERVER_ENTRY, LOCAL_ENTRY]),
    );

    // Seed: cache owner matches the signed-in user (no cross-user wipe)
    await AsyncStorage.setItem(JOURNAL_OWNER_KEY, "user-offline-photo-test");

    // Seed: media index holds the photo under the local ID
    await AsyncStorage.setItem(
      JOURNAL_MEDIA_INDEX_KEY,
      JSON.stringify({ [LOCAL_ID]: [OFFLINE_PHOTO] }),
    );

    // Server already has the existing entry but NOT the local-only entry
    mockApiLoadJournal.mockResolvedValue([EXISTING_SERVER_ENTRY]);

    // Server promotes the local entry and assigns a real UUID
    mockApiUpsert.mockResolvedValue(SERVER_ENTRY_PROMOTED);

    const JournalScreen = require("../app/journal").default;
    act(() => {
      create(React.createElement(JournalScreen));
    });
    await flushAsync();

    const indexAfterSync = await loadMediaIndex();

    // Photo must be accessible under the new server UUID
    expect(indexAfterSync[SERVER_UUID]).toEqual([OFFLINE_PHOTO]);

    // Old local ID key must be gone
    expect(indexAfterSync[LOCAL_ID]).toBeUndefined();
  });

  it("photo from the promoted entry is visible in the rendered journal list", async () => {
    jest.setTimeout(15000);

    await AsyncStorage.setItem(
      JOURNAL_KEY,
      JSON.stringify([LOCAL_ENTRY]),
    );
    await AsyncStorage.setItem(JOURNAL_OWNER_KEY, "user-offline-photo-test");
    await AsyncStorage.setItem(
      JOURNAL_MEDIA_INDEX_KEY,
      JSON.stringify({ [LOCAL_ID]: [OFFLINE_PHOTO] }),
    );

    // Server has no entries yet — this triggers the migration branch (push all
    // local entries). After promotion the media index must be re-keyed.
    mockApiLoadJournal.mockResolvedValue([]);
    mockApiUpsert.mockResolvedValue(SERVER_ENTRY_PROMOTED);

    const JournalScreen = require("../app/journal").default;
    let renderer: ReturnType<typeof create>;
    act(() => {
      renderer = create(React.createElement(JournalScreen));
    });
    await flushAsync();

    // The entry text must appear in the rendered tree (sync completed)
    const json = JSON.stringify(renderer!.toJSON());
    expect(json).toContain("First bump photo — taken while offline");

    // The media index must be re-keyed to the server UUID
    const indexAfterSync = await loadMediaIndex();
    expect(indexAfterSync[SERVER_UUID]).toEqual([OFFLINE_PHOTO]);
    expect(indexAfterSync[LOCAL_ID]).toBeUndefined();
  });

  it("photo URI is present in the rendered output after the local ID is promoted", async () => {
    jest.setTimeout(15000);

    // Existing server entry plus the offline local entry
    await AsyncStorage.setItem(
      JOURNAL_KEY,
      JSON.stringify([EXISTING_SERVER_ENTRY, LOCAL_ENTRY]),
    );
    await AsyncStorage.setItem(JOURNAL_OWNER_KEY, "user-offline-photo-test");
    await AsyncStorage.setItem(
      JOURNAL_MEDIA_INDEX_KEY,
      JSON.stringify({ [LOCAL_ID]: [OFFLINE_PHOTO] }),
    );

    // Server knows about the existing entry only; the local entry is pushed and
    // assigned a server UUID
    mockApiLoadJournal.mockResolvedValue([EXISTING_SERVER_ENTRY]);
    mockApiUpsert.mockResolvedValue(SERVER_ENTRY_PROMOTED);

    const JournalScreen = require("../app/journal").default;
    let renderer: ReturnType<typeof create>;
    act(() => {
      renderer = create(React.createElement(JournalScreen));
    });
    await flushAsync();

    // Photo URI must appear in the rendered journal list so the thumbnail badge
    // is visible to the user after sync
    const json = JSON.stringify(renderer!.toJSON());
    expect(json).toContain(OFFLINE_PHOTO.uri);

    // And the index must be clean (local key gone, server UUID key present)
    const indexAfterSync = await loadMediaIndex();
    expect(indexAfterSync[SERVER_UUID]).toEqual([OFFLINE_PHOTO]);
    expect(indexAfterSync[LOCAL_ID]).toBeUndefined();
  });

  it("photos from an entry edited offline (updated text + new photo) also reappear after sync", async () => {
    jest.setTimeout(15000);

    const SECOND_PHOTO: JournalMedia = {
      id: "photo-offline-002",
      uri: "file:///tmp/journal-media/photo-offline-002.jpg",
      type: "photo",
      category: "ultrasound",
    };

    const EDITED_LOCAL_ENTRY: JournalEntry = {
      ...LOCAL_ENTRY,
      text: "Edited while offline — added ultrasound photo",
      media: [OFFLINE_PHOTO, SECOND_PHOTO],
    };

    const EDITED_SERVER_ENTRY: JournalEntry = {
      ...EDITED_LOCAL_ENTRY,
      id: SERVER_UUID,
      media: [],
    };

    await AsyncStorage.setItem(
      JOURNAL_KEY,
      JSON.stringify([EXISTING_SERVER_ENTRY, EDITED_LOCAL_ENTRY]),
    );
    await AsyncStorage.setItem(JOURNAL_OWNER_KEY, "user-offline-photo-test");

    // Media index holds both photos under the local ID
    await AsyncStorage.setItem(
      JOURNAL_MEDIA_INDEX_KEY,
      JSON.stringify({
        [LOCAL_ID]: [OFFLINE_PHOTO, SECOND_PHOTO],
      }),
    );

    mockApiLoadJournal.mockResolvedValue([EXISTING_SERVER_ENTRY]);
    mockApiUpsert.mockResolvedValue(EDITED_SERVER_ENTRY);

    const JournalScreen = require("../app/journal").default;
    act(() => {
      create(React.createElement(JournalScreen));
    });
    await flushAsync();

    const indexAfterSync = await loadMediaIndex();

    // Both photos must be accessible under the new server UUID
    expect(indexAfterSync[SERVER_UUID]).toEqual([OFFLINE_PHOTO, SECOND_PHOTO]);

    // Local ID key must be gone
    expect(indexAfterSync[LOCAL_ID]).toBeUndefined();
  });

  it("photos from other entries are unaffected when one local entry is promoted", async () => {
    jest.setTimeout(15000);

    const OTHER_SERVER_ID = "ffffffff-2222-4333-8444-555555555555";
    const OTHER_PHOTO: JournalMedia = {
      id: "photo-other-001",
      uri: "file:///tmp/journal-media/photo-other-001.jpg",
      type: "photo",
      category: "general",
    };

    const OTHER_SERVER_ENTRY: JournalEntry = {
      id: OTHER_SERVER_ID,
      text: "Another entry already on the server",
      mood: "grateful",
      gestationalWeeks: 24,
      gestationalDays: 0,
      createdAt: "2026-06-10T09:00:00.000Z",
      updatedAt: "2026-06-10T09:00:00.000Z",
      media: [OTHER_PHOTO],
    };

    await AsyncStorage.setItem(
      JOURNAL_KEY,
      JSON.stringify([OTHER_SERVER_ENTRY, LOCAL_ENTRY]),
    );
    await AsyncStorage.setItem(JOURNAL_OWNER_KEY, "user-offline-photo-test");

    // Media index has both entries' photos
    await AsyncStorage.setItem(
      JOURNAL_MEDIA_INDEX_KEY,
      JSON.stringify({
        [OTHER_SERVER_ID]: [OTHER_PHOTO],
        [LOCAL_ID]: [OFFLINE_PHOTO],
      }),
    );

    // Server knows only the other entry; local entry is pushed and promoted
    mockApiLoadJournal.mockResolvedValue([OTHER_SERVER_ENTRY]);
    mockApiUpsert.mockResolvedValue(SERVER_ENTRY_PROMOTED);

    const JournalScreen = require("../app/journal").default;
    act(() => {
      create(React.createElement(JournalScreen));
    });
    await flushAsync();

    const indexAfterSync = await loadMediaIndex();

    // The promoted entry's photo is now under the server UUID
    expect(indexAfterSync[SERVER_UUID]).toEqual([OFFLINE_PHOTO]);
    expect(indexAfterSync[LOCAL_ID]).toBeUndefined();

    // The other server entry's photos are untouched
    expect(indexAfterSync[OTHER_SERVER_ID]).toEqual([OTHER_PHOTO]);
  });
});
