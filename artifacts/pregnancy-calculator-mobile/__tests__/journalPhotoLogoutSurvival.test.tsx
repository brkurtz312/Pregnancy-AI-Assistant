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
// invoked by deleteEntry / copyMediaToDocuments which are not exercised here.
jest.mock("expo-file-system/legacy", () => ({
  documentDirectory: "/tmp/",
  getInfoAsync: jest.fn(async () => ({ exists: true })),
  makeDirectoryAsync: jest.fn(async () => {}),
  copyAsync: jest.fn(async () => {}),
  deleteAsync: jest.fn(async () => {}),
}));

import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  upsertEntry,
  clearJournalCache,
  loadMediaIndex,
  reindexMediaForEntry,
  loadEntries,
  JOURNAL_KEY,
  JOURNAL_MEDIA_INDEX_KEY,
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
