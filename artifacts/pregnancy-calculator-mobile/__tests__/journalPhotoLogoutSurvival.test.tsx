/**
 * Journal photo survival across logout / login cycle — lib-level tests
 *
 * Verifies that photos attached to journal entries remain visible after a
 * user signs out and signs back in.  The key mechanism is:
 *
 *   1. upsertEntry writes the entry's media array to JOURNAL_MEDIA_INDEX_KEY,
 *      a separate AsyncStorage key that is intentionally excluded from
 *      clearJournalCache.
 *   2. clearJournalCache only removes JOURNAL_KEY and JOURNAL_OWNER_KEY, so
 *      the media index survives a logout.
 *   3. When the user signs back in, journal.tsx loads server entries (which
 *      carry no local media URIs because media is stored on-device only), then
 *      falls back to the media index to re-attach photos.  The photo thumbnail
 *      must appear in the list.
 *
 * Unlike syncColdReinstall.test.tsx (which mocks the entire @/lib/journal
 * module and tests the screen render path), this file uses the REAL journal
 * lib functions against the in-memory AsyncStorage mock.  This proves the
 * write path (upsertEntry → clearJournalCache → loadMediaIndex) end-to-end
 * without relying on any screen-render machinery.
 *
 * Screen-level confirmation (rendered photo badge visible after re-login) is
 * covered by the "re-attaches photos via the media index fallback after cache
 * wipe" test in syncColdReinstall.test.tsx.
 */

// expo-file-system/legacy is imported by lib/journal.ts at module load time.
// Only documentDirectory is used at that point; the async methods are only
// invoked by deleteEntry / copyMediaToDocuments / clearJournalCache (cross-user).
jest.mock("expo-file-system/legacy", () => ({
  documentDirectory: "/tmp/",
  getInfoAsync: jest.fn(async () => ({ exists: true })),
  makeDirectoryAsync: jest.fn(async () => {}),
  copyAsync: jest.fn(async () => {}),
  deleteAsync: jest.fn(async () => {}),
}));

import * as FileSystem from "expo-file-system/legacy";

import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  upsertEntry,
  clearJournalCache,
  loadMediaIndex,
  reindexMediaForEntry,
  loadEntries,
  JOURNAL_KEY,
  JOURNAL_MEDIA_INDEX_KEY,
  JOURNAL_OWNER_KEY,
  setJournalCacheOwner,
} from "@/lib/journal";
import type { JournalEntry, JournalMedia } from "@/lib/journal";

const PHOTO: JournalMedia = {
  id: "photo-001",
  uri: "file:///var/mobile/Containers/Data/Application/APPID/Documents/journal-media/photo-001.jpg",
  type: "photo",
  category: "bump",
};

const ENTRY_WITH_PHOTO: JournalEntry = {
  id: "server-uuid-aabb-ccdd-eeff",
  text: "Beautiful bump at 28 weeks!",
  mood: "happy",
  gestationalWeeks: 28,
  gestationalDays: 0,
  createdAt: "2026-05-01T10:00:00.000Z",
  updatedAt: "2026-05-01T10:00:00.000Z",
  media: [PHOTO],
};

describe("Journal photo write path — upsertEntry keeps media index in sync", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it("upsertEntry stores the entry's media in JOURNAL_MEDIA_INDEX_KEY", async () => {
    await upsertEntry(ENTRY_WITH_PHOTO);

    const raw = await AsyncStorage.getItem(JOURNAL_MEDIA_INDEX_KEY);
    expect(raw).not.toBeNull();
    const index = JSON.parse(raw!) as Record<string, JournalMedia[]>;
    expect(index[ENTRY_WITH_PHOTO.id]).toEqual([PHOTO]);
  });

  it("upsertEntry stores the entry in JOURNAL_KEY", async () => {
    await upsertEntry(ENTRY_WITH_PHOTO);

    const entries = await loadEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe(ENTRY_WITH_PHOTO.id);
    expect(entries[0].media).toEqual([PHOTO]);
  });

  it("upsertEntry updating an existing entry also updates the media index", async () => {
    // First write: entry with a photo
    await upsertEntry(ENTRY_WITH_PHOTO);

    // Second write: same entry, no photo (user removed the photo)
    const entryNoPhoto: JournalEntry = { ...ENTRY_WITH_PHOTO, media: [] };
    await upsertEntry(entryNoPhoto);

    const index = await loadMediaIndex();
    // Media index entry for this id should be gone (empty media removes the key)
    expect(index[ENTRY_WITH_PHOTO.id]).toBeUndefined();
  });
});

describe("Journal photo survival — clearJournalCache does NOT wipe the media index", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    await upsertEntry(ENTRY_WITH_PHOTO);
  });

  it("clearJournalCache removes JOURNAL_KEY (entry list is gone)", async () => {
    await clearJournalCache();

    const raw = await AsyncStorage.getItem(JOURNAL_KEY);
    expect(raw).toBeNull();
  });

  it("clearJournalCache leaves JOURNAL_MEDIA_INDEX_KEY intact", async () => {
    await clearJournalCache();

    const raw = await AsyncStorage.getItem(JOURNAL_MEDIA_INDEX_KEY);
    expect(raw).not.toBeNull();
  });

  it("loadMediaIndex returns the photo after clearJournalCache (logout simulation)", async () => {
    // Step 1: user had an entry with a photo (upsertEntry called in beforeEach)
    // Step 2: user logs out → clearJournalCache is called
    await clearJournalCache();

    // Step 3: user signs back in — loadMediaIndex must still return the photo
    const index = await loadMediaIndex();
    expect(index[ENTRY_WITH_PHOTO.id]).toEqual([PHOTO]);
  });

  it("entry list is empty after logout but media index still holds the photo", async () => {
    // This is the core regression guard:
    // after logout the server entry arrives with no media URIs, but the photo
    // files are still on disk.  The merge step in journal.tsx uses loadMediaIndex
    // as a fallback to re-attach photos.  This test confirms the fallback source
    // (the media index) survives the logout.
    await clearJournalCache();

    const entries = await loadEntries();
    expect(entries).toHaveLength(0);

    const index = await loadMediaIndex();
    expect(Object.keys(index)).toHaveLength(1);
    expect(index[ENTRY_WITH_PHOTO.id]).toEqual([PHOTO]);
  });

  it("multiple entries with photos survive clearJournalCache", async () => {
    const SECOND_PHOTO: JournalMedia = {
      id: "photo-002",
      uri: "file:///var/mobile/Containers/Data/Application/APPID/Documents/journal-media/photo-002.jpg",
      type: "photo",
      category: "ultrasound",
    };
    const SECOND_ENTRY: JournalEntry = {
      id: "server-uuid-1111-2222-3333",
      text: "Ultrasound scan!",
      mood: "excited",
      gestationalWeeks: 20,
      gestationalDays: 0,
      createdAt: "2026-04-01T10:00:00.000Z",
      updatedAt: "2026-04-01T10:00:00.000Z",
      media: [SECOND_PHOTO],
    };

    await upsertEntry(SECOND_ENTRY);
    await clearJournalCache();

    const index = await loadMediaIndex();
    expect(index[ENTRY_WITH_PHOTO.id]).toEqual([PHOTO]);
    expect(index[SECOND_ENTRY.id]).toEqual([SECOND_PHOTO]);
  });
});

describe("Journal photo survival — reindexMediaForEntry re-keys before logout", () => {
  const LOCAL_ID = "local-base36-abc123";
  const SERVER_UUID = "aaaaaaaa-1111-4222-8333-bbbbbbbbbbbb";

  beforeEach(async () => {
    await AsyncStorage.clear();
    // Entry was created offline with a local ID
    await upsertEntry({ ...ENTRY_WITH_PHOTO, id: LOCAL_ID });
  });

  it("media index initially holds the photo under the local ID", async () => {
    const index = await loadMediaIndex();
    expect(index[LOCAL_ID]).toEqual([PHOTO]);
  });

  it("reindexMediaForEntry promotes the media index key from local ID to server UUID", async () => {
    // Server promotion: local ID → server UUID (happens during apiUpsertJournalEntry)
    await reindexMediaForEntry(LOCAL_ID, SERVER_UUID);

    const index = await loadMediaIndex();
    // Old local key is gone
    expect(index[LOCAL_ID]).toBeUndefined();
    // New server UUID key holds the photo
    expect(index[SERVER_UUID]).toEqual([PHOTO]);
  });

  it("photo is found under the server UUID key after promotion then clearJournalCache", async () => {
    // Server promotion first (happens during sync before or after the logout)
    await reindexMediaForEntry(LOCAL_ID, SERVER_UUID);

    // Logout: wipes JOURNAL_KEY but not JOURNAL_MEDIA_INDEX_KEY
    await clearJournalCache();

    // Sign back in: the media index must still have the photo under the server UUID
    const index = await loadMediaIndex();
    expect(index[SERVER_UUID]).toEqual([PHOTO]);
    expect(index[LOCAL_ID]).toBeUndefined();
  });

  it("reindexMediaForEntry is a no-op when oldId === newId", async () => {
    await reindexMediaForEntry(LOCAL_ID, LOCAL_ID);

    const index = await loadMediaIndex();
    // Key is unchanged
    expect(index[LOCAL_ID]).toEqual([PHOTO]);
  });

  it("reindexMediaForEntry is a no-op when oldId is not in the index", async () => {
    const UNKNOWN_ID = "unknown-id-not-in-index";
    await reindexMediaForEntry(UNKNOWN_ID, SERVER_UUID);

    const index = await loadMediaIndex();
    // No new key created for the unknown ID
    expect(index[SERVER_UUID]).toBeUndefined();
    // Original entry still intact
    expect(index[LOCAL_ID]).toEqual([PHOTO]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Corrupted media index — graceful degradation on parse failure
// ─────────────────────────────────────────────────────────────────────────────

describe("Corrupted media index — loadMediaIndex degrades gracefully", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it("returns an empty object when the stored value is not valid JSON", async () => {
    // Simulate storage corruption: the key exists but holds garbage bytes
    await AsyncStorage.setItem(JOURNAL_MEDIA_INDEX_KEY, "}{not valid json}{");

    const index = await loadMediaIndex();

    // Must not throw; must return an empty object so the app keeps running
    expect(index).toEqual({});
  });

  it("emits a console.warn (not an error) when JSON is corrupted", async () => {
    const warnSpy = jest
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);

    await AsyncStorage.setItem(JOURNAL_MEDIA_INDEX_KEY, "CORRUPTED");

    await loadMediaIndex();

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toMatch(/Media index corrupted/);

    warnSpy.mockRestore();
  });

  it("removes the corrupt AsyncStorage key immediately so photos reappear after restart", async () => {
    // Simulate storage corruption
    await AsyncStorage.setItem(JOURNAL_MEDIA_INDEX_KEY, "}{not valid json}{");

    // Suppress the expected warning
    const warnSpy = jest
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);

    await loadMediaIndex();

    warnSpy.mockRestore();

    // The corrupt key must be gone — a subsequent app restart will now return {}
    // from AsyncStorage.getItem rather than re-parsing the invalid value.
    const raw = await AsyncStorage.getItem(JOURNAL_MEDIA_INDEX_KEY);
    expect(raw).toBeNull();
  });

  it("does NOT emit a warning when the stored value is absent (empty storage)", async () => {
    const warnSpy = jest
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);

    await loadMediaIndex();

    expect(warnSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it("does NOT emit a warning when the stored value is valid JSON", async () => {
    const warnSpy = jest
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);

    await upsertEntry(ENTRY_WITH_PHOTO);
    await loadMediaIndex();

    expect(warnSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it("a subsequent upsertEntry call overwrites the corrupt index with valid data", async () => {
    // Seed corrupt value
    await AsyncStorage.setItem(JOURNAL_MEDIA_INDEX_KEY, "CORRUPTED");

    // Reading the corrupt index returns {} (graceful degradation)
    const beforeUpsert = await loadMediaIndex();
    expect(beforeUpsert).toEqual({});

    // Writing a new entry rebuilds the index from scratch
    await upsertEntry(ENTRY_WITH_PHOTO);

    const afterUpsert = await loadMediaIndex();
    expect(afterUpsert[ENTRY_WITH_PHOTO.id]).toEqual([PHOTO]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cross-user isolation — User A's photos must NOT leak to User B
//
// The media index intentionally survives clearJournalCache() so that photos
// reappear after a same-user logout/login.  But when a DIFFERENT user signs in
// on the same device the index must be cleared, otherwise User B would see
// User A's photo badge on unrelated journal entries.
//
// The fix: clearJournalCache({ includeMediaIndex: true }) is called from
// journal.tsx when cacheOwner !== null && cacheOwner !== userId.
// ─────────────────────────────────────────────────────────────────────────────

describe("Cross-user isolation — User A photos do NOT bleed into User B's journal", () => {
  const USER_A_ID = "user-aaaaaaaa-1111-4222-8333-aaaaaaaaaaaa";
  const USER_B_ID = "user-bbbbbbbb-1111-4222-8333-bbbbbbbbbbbb";

  const USER_A_PHOTO: JournalMedia = {
    id: "photo-user-a-001",
    uri: "file:///Documents/journal-media/photo-user-a-001.jpg",
    type: "photo",
    category: "bump",
  };

  const USER_A_ENTRY: JournalEntry = {
    id: "entry-user-a-uuid",
    text: "User A bump photo",
    mood: "happy",
    gestationalWeeks: 28,
    gestationalDays: 0,
    createdAt: "2026-05-01T10:00:00.000Z",
    updatedAt: "2026-05-01T10:00:00.000Z",
    media: [USER_A_PHOTO],
  };

  beforeEach(async () => {
    await AsyncStorage.clear();
    // Seed User A's session: entry + media index + cache owner
    await upsertEntry(USER_A_ENTRY);
    await setJournalCacheOwner(USER_A_ID);
  });

  it("media index holds User A's photo before any account switch", async () => {
    const index = await loadMediaIndex();
    expect(index[USER_A_ENTRY.id]).toEqual([USER_A_PHOTO]);
  });

  it("clearJournalCache({ includeMediaIndex: true }) wipes the media index (cross-user path)", async () => {
    // This is what journal.tsx calls when cacheOwner !== null && cacheOwner !== userId
    await clearJournalCache({ includeMediaIndex: true });

    const raw = await AsyncStorage.getItem(JOURNAL_MEDIA_INDEX_KEY);
    expect(raw).toBeNull();
  });

  it("loadMediaIndex returns empty after cross-user clearJournalCache — User A's photo badge is gone", async () => {
    // Simulate: User B signs in, cross-user path is triggered
    await clearJournalCache({ includeMediaIndex: true });

    const index = await loadMediaIndex();
    // User B's fresh journal must see no photos from User A
    expect(Object.keys(index)).toHaveLength(0);
    expect(index[USER_A_ENTRY.id]).toBeUndefined();
  });

  it("JOURNAL_KEY and JOURNAL_OWNER_KEY are also cleared on cross-user switch", async () => {
    await clearJournalCache({ includeMediaIndex: true });

    const entries = await AsyncStorage.getItem(JOURNAL_KEY);
    const owner = await AsyncStorage.getItem(JOURNAL_OWNER_KEY);
    expect(entries).toBeNull();
    expect(owner).toBeNull();
  });

  it("same-user clearJournalCache (no flag) still preserves the media index", async () => {
    // Same-user logout/login: photos must survive so they reappear after re-login
    await clearJournalCache();

    const index = await loadMediaIndex();
    expect(index[USER_A_ENTRY.id]).toEqual([USER_A_PHOTO]);
  });

  it("after cross-user wipe, User B's own photos can be stored without contamination from User A", async () => {
    const USER_B_PHOTO: JournalMedia = {
      id: "photo-user-b-001",
      uri: "file:///Documents/journal-media/photo-user-b-001.jpg",
      type: "photo",
      category: "ultrasound",
    };
    const USER_B_ENTRY: JournalEntry = {
      id: "entry-user-b-uuid",
      text: "User B ultrasound",
      mood: "excited",
      gestationalWeeks: 20,
      gestationalDays: 0,
      createdAt: "2026-06-01T10:00:00.000Z",
      updatedAt: "2026-06-01T10:00:00.000Z",
      media: [USER_B_PHOTO],
    };

    // Cross-user switch clears User A's index
    await clearJournalCache({ includeMediaIndex: true });

    // User B writes their own entry
    await upsertEntry(USER_B_ENTRY);
    await setJournalCacheOwner(USER_B_ID);

    const index = await loadMediaIndex();
    // Only User B's photo is present; User A's is gone
    expect(index[USER_B_ENTRY.id]).toEqual([USER_B_PHOTO]);
    expect(index[USER_A_ENTRY.id]).toBeUndefined();
    expect(Object.keys(index)).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// On-disk file cleanup — cross-user login must delete User A's photo files
//
// When a different user signs in, clearJournalCache({ includeMediaIndex: true })
// must call FileSystem.deleteAsync for every URI that was in the media index,
// so that photo files don't accumulate on shared devices over time.
//
// Same-user logout/login (no flag) must NOT delete any files — photos must
// survive on disk so they can reappear when the server entries are re-fetched.
// ─────────────────────────────────────────────────────────────────────────────

describe("On-disk file cleanup — cross-user login deletes User A's photo files", () => {
  const USER_A_PHOTO_1: JournalMedia = {
    id: "photo-disk-a-001",
    uri: "file:///Documents/journal-media/photo-disk-a-001.jpg",
    type: "photo",
    category: "bump",
  };
  const USER_A_PHOTO_2: JournalMedia = {
    id: "photo-disk-a-002",
    uri: "file:///Documents/journal-media/photo-disk-a-002.jpg",
    type: "photo",
    category: "ultrasound",
  };

  const USER_A_ENTRY_1: JournalEntry = {
    id: "entry-disk-a-uuid-1",
    text: "User A bump photo",
    mood: "happy",
    gestationalWeeks: 28,
    gestationalDays: 0,
    createdAt: "2026-05-01T10:00:00.000Z",
    updatedAt: "2026-05-01T10:00:00.000Z",
    media: [USER_A_PHOTO_1],
  };
  const USER_A_ENTRY_2: JournalEntry = {
    id: "entry-disk-a-uuid-2",
    text: "User A ultrasound",
    mood: "excited",
    gestationalWeeks: 20,
    gestationalDays: 0,
    createdAt: "2026-04-01T10:00:00.000Z",
    updatedAt: "2026-04-01T10:00:00.000Z",
    media: [USER_A_PHOTO_2],
  };

  const deleteAsync = FileSystem.deleteAsync as jest.Mock;

  beforeEach(async () => {
    await AsyncStorage.clear();
    deleteAsync.mockClear();
    // Seed User A's session with two entries, each with a photo
    await upsertEntry(USER_A_ENTRY_1);
    await upsertEntry(USER_A_ENTRY_2);
  });

  it("deleteAsync is called for each of User A's on-disk photo files when User B signs in", async () => {
    await clearJournalCache({ includeMediaIndex: true });

    const deletedUris = deleteAsync.mock.calls.map(
      (call: [string, ...unknown[]]) => call[0],
    );
    expect(deletedUris).toContain(USER_A_PHOTO_1.uri);
    expect(deletedUris).toContain(USER_A_PHOTO_2.uri);
  });

  it("deleteAsync is called with idempotent: true so missing files are silently ignored", async () => {
    await clearJournalCache({ includeMediaIndex: true });

    for (const call of deleteAsync.mock.calls as [
      string,
      { idempotent: boolean },
    ][]) {
      expect(call[1]).toEqual({ idempotent: true });
    }
  });

  it("deleteAsync is NOT called during a same-user logout/login (no-flag path)", async () => {
    // Same-user logout: photos must stay on disk
    await clearJournalCache();

    expect(deleteAsync).not.toHaveBeenCalled();
  });

  it("media index is wiped after on-disk files are deleted", async () => {
    await clearJournalCache({ includeMediaIndex: true });

    const index = await loadMediaIndex();
    expect(Object.keys(index)).toHaveLength(0);
  });

  it("deleteAsync is a no-op on cross-user clear when the media index is empty", async () => {
    await AsyncStorage.clear();
    deleteAsync.mockClear();

    // Cross-user clear with an empty index: should not throw, deleteAsync not called
    await clearJournalCache({ includeMediaIndex: true });

    expect(deleteAsync).not.toHaveBeenCalled();
  });
});
