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
  MediaIndexWriteError,
  JournalKeyWriteError,
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
// Partial-write safety — media index is written before the entry list
//
// If the process dies (or AsyncStorage throws) after the media index is
// written but before persistEntries completes, the index must already reflect
// the latest media so photos are not lost.  The entry list is the lossy side
// of the write; the index is the recovery source.
// ─────────────────────────────────────────────────────────────────────────────

describe("Partial-write safety — media index is durable even when persistEntries throws", () => {
  // AsyncStorage.setItem in the jest mock is itself a jest.fn() that
  // internally calls asMock.multiSet.  jest.spyOn wraps it in-place via
  // mockImplementation, and mockRestore()/restoreAllMocks() do not reliably
  // unwind the cross-reference chain when another jest.fn() is involved.
  //
  // To avoid this, we save and restore the property directly — no jest.spyOn
  // — and clean up unconditionally in afterEach via try/finally so that a
  // failing test cannot poison later suites.

  let savedSetItem: (typeof AsyncStorage)["setItem"];

  beforeEach(async () => {
    savedSetItem = AsyncStorage.setItem; // snapshot before any replacement
    await AsyncStorage.clear();
  });

  afterEach(async () => {
    // Restore unconditionally — even if the test threw
    (AsyncStorage as Record<string, unknown>)["setItem"] = savedSetItem;
    await AsyncStorage.clear();
  });

  it("JOURNAL_KEY is not written when the JOURNAL_MEDIA_INDEX_KEY write throws", async () => {
    // If the first write (media index) fails, the second write (entry list)
    // must NOT be attempted — otherwise the entry list would be ahead of the
    // index, which is exactly the out-of-sync state the task requires us to
    // prevent.
    const writtenKeys: string[] = [];

    (AsyncStorage as Record<string, unknown>)["setItem"] = async (
      key: string,
      _value: string,
    ) => {
      writtenKeys.push(key);
      if (key === JOURNAL_MEDIA_INDEX_KEY) {
        throw new Error("Simulated AsyncStorage failure on media index write");
      }
    };

    // upsertEntry now wraps media-index failures as MediaIndexWriteError
    const warnSpy = jest
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    await expect(upsertEntry(ENTRY_WITH_PHOTO)).rejects.toBeInstanceOf(
      MediaIndexWriteError,
    );
    warnSpy.mockRestore();

    // The entry-list key must NOT appear in the writes because the media
    // index write threw before we ever reached persistEntries.
    expect(writtenKeys).toContain(JOURNAL_MEDIA_INDEX_KEY);
    expect(writtenKeys).not.toContain(JOURNAL_KEY);
  });

  it("media index holds the photo even when the JOURNAL_KEY write throws (both attempts)", async () => {
    // Replace setItem with a direct function (no jest.spyOn) so the restore
    // in afterEach is a simple property assignment that always works.
    // Both the first attempt and the retry will fail → JournalKeyWriteError.
    const capturedWrites = new Map<string, string>();

    (AsyncStorage as Record<string, unknown>)["setItem"] = async (
      key: string,
      value: string,
    ) => {
      if (key === JOURNAL_KEY) {
        throw new Error("Simulated AsyncStorage failure on entry list write");
      }
      capturedWrites.set(key, value);
    };

    // After one automatic retry both attempts failed → JournalKeyWriteError surfaces
    await expect(upsertEntry(ENTRY_WITH_PHOTO)).rejects.toBeInstanceOf(
      JournalKeyWriteError,
    );

    // The media index write must have been captured before the entry write
    // was even attempted — the photo must be in the captured payload.
    expect(capturedWrites.has(JOURNAL_MEDIA_INDEX_KEY)).toBe(true);
    const index = JSON.parse(
      capturedWrites.get(JOURNAL_MEDIA_INDEX_KEY)!,
    ) as Record<string, JournalMedia[]>;
    expect(index[ENTRY_WITH_PHOTO.id]).toEqual([PHOTO]);
  });

  it("write order: JOURNAL_MEDIA_INDEX_KEY is always set before JOURNAL_KEY", async () => {
    // Track write key order without calling through to AsyncStorage (the
    // mock's setItem delegates to multiSet via a closure reference, so calling
    // the original from inside a replacement triggers recursion).
    const callOrder: string[] = [];

    (AsyncStorage as Record<string, unknown>)["setItem"] = async (
      key: string,
      _value: string,
    ) => {
      callOrder.push(key);
    };

    await upsertEntry(ENTRY_WITH_PHOTO);

    const indexPos = callOrder.indexOf(JOURNAL_MEDIA_INDEX_KEY);
    const entryPos = callOrder.indexOf(JOURNAL_KEY);
    expect(indexPos).toBeGreaterThanOrEqual(0);
    expect(entryPos).toBeGreaterThanOrEqual(0);
    // The media index must be written strictly before the entry list.
    expect(indexPos).toBeLessThan(entryPos);
  });

  it("upsertEntry throws JournalKeyWriteError (not a plain Error) when both JOURNAL_KEY write attempts fail", async () => {
    // This is the core regression guard for the entry-list protection:
    // when persistEntries fails on both the initial attempt and the automatic
    // retry, the caller receives a typed JournalKeyWriteError so it can show
    // a targeted "Could not save entry — please try again" notice rather than
    // letting the failure go unnoticed.
    (AsyncStorage as Record<string, unknown>)["setItem"] = async (
      key: string,
      _value: string,
    ) => {
      if (key === JOURNAL_KEY) {
        throw new Error("Simulated persistent AsyncStorage failure");
      }
    };

    const err = await upsertEntry(ENTRY_WITH_PHOTO).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(JournalKeyWriteError);
    expect((err as JournalKeyWriteError).name).toBe("JournalKeyWriteError");
    expect((err as JournalKeyWriteError).message).toBe(
      "Could not save journal entry list",
    );
  });

  it("upsertEntry succeeds when the JOURNAL_KEY write fails once but succeeds on retry", async () => {
    // Simulates a transient storage blip: the first attempt throws, the
    // retry succeeds.  The entry must end up in AsyncStorage (checked via
    // the real loadEntries) and no error must surface to the caller.
    let journalKeyWriteCount = 0;
    const realSetItem = savedSetItem; // captured in beforeEach

    (AsyncStorage as Record<string, unknown>)["setItem"] = async (
      key: string,
      value: string,
    ) => {
      if (key === JOURNAL_KEY) {
        journalKeyWriteCount += 1;
        if (journalKeyWriteCount === 1) {
          throw new Error("Simulated transient AsyncStorage failure");
        }
      }
      // Delegate to the real implementation for all other writes (and for the
      // retry) so that loadEntries can read the persisted data afterwards.
      await realSetItem.call(AsyncStorage, key, value);
    };

    await expect(upsertEntry(ENTRY_WITH_PHOTO)).resolves.toBeUndefined();

    // Restore so loadEntries can use the real AsyncStorage
    (AsyncStorage as Record<string, unknown>)["setItem"] = savedSetItem;

    const entries = await loadEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe(ENTRY_WITH_PHOTO.id);
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

// ─────────────────────────────────────────────────────────────────────────────
// AsyncStorage write failure — visible signal, not silent data loss
//
// When persistMediaIndex throws (e.g. storage full), the failure must:
//   1. Emit a console.warn so it is visible in device/CI logs.
//   2. Cause upsertEntry to throw a MediaIndexWriteError (not a generic Error)
//      so that the UI layer can show a targeted notice to the user.
//   3. NOT silently swallow the error and leave the app in an inconsistent state.
// ─────────────────────────────────────────────────────────────────────────────

describe("AsyncStorage write failure — persistMediaIndex emits a visible warning", () => {
  let savedSetItem: (typeof AsyncStorage)["setItem"];

  beforeEach(async () => {
    savedSetItem = AsyncStorage.setItem;
    await AsyncStorage.clear();
  });

  afterEach(async () => {
    (AsyncStorage as Record<string, unknown>)["setItem"] = savedSetItem;
    await AsyncStorage.clear();
  });

  it("console.warn is called when the media index write throws", async () => {
    const warnSpy = jest
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);

    (AsyncStorage as Record<string, unknown>)["setItem"] = async (
      key: string,
      _value: string,
    ) => {
      if (key === JOURNAL_MEDIA_INDEX_KEY) {
        throw new Error("AsyncStorage full");
      }
    };

    await expect(upsertEntry(ENTRY_WITH_PHOTO)).rejects.toThrow();

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toMatch(/Failed to persist media index/);

    warnSpy.mockRestore();
  });

  it("upsertEntry throws MediaIndexWriteError (not a plain Error) when media index write fails", async () => {
    (AsyncStorage as Record<string, unknown>)["setItem"] = async (
      key: string,
      _value: string,
    ) => {
      if (key === JOURNAL_MEDIA_INDEX_KEY) {
        throw new Error("AsyncStorage full");
      }
    };

    const warnSpy = jest
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);

    let caught: unknown;
    try {
      await upsertEntry(ENTRY_WITH_PHOTO);
    } catch (err) {
      caught = err;
    }
    warnSpy.mockRestore();

    expect(caught).toBeInstanceOf(MediaIndexWriteError);
    expect((caught as MediaIndexWriteError).message).toBe(
      "Could not save photo index",
    );
  });

  it("MediaIndexWriteError preserves the original cause", async () => {
    const originalError = new Error("AsyncStorage full");

    (AsyncStorage as Record<string, unknown>)["setItem"] = async (
      key: string,
      _value: string,
    ) => {
      if (key === JOURNAL_MEDIA_INDEX_KEY) {
        throw originalError;
      }
    };

    const warnSpy = jest
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);

    let caught: unknown;
    try {
      await upsertEntry(ENTRY_WITH_PHOTO);
    } catch (err) {
      caught = err;
    }
    warnSpy.mockRestore();

    expect((caught as MediaIndexWriteError).cause).toBe(originalError);
  });

  it("the failure is NOT silently swallowed — upsertEntry rejects", async () => {
    (AsyncStorage as Record<string, unknown>)["setItem"] = async (
      key: string,
      _value: string,
    ) => {
      if (key === JOURNAL_MEDIA_INDEX_KEY) {
        throw new Error("AsyncStorage full");
      }
    };

    const warnSpy = jest
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);

    await expect(upsertEntry(ENTRY_WITH_PHOTO)).rejects.toBeInstanceOf(
      MediaIndexWriteError,
    );

    warnSpy.mockRestore();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Storage-full scenario — both setItem calls throw
//
// When a device runs out of storage, AsyncStorage.setItem can throw for every
// write attempt.  In that case upsertEntry must:
//   1. Propagate the error to the caller (no silent swallow).
//   2. Leave the journal entry list in its pre-upsert state — the new entry
//      must NOT appear in loadEntries.
//   3. Leave the media index in its pre-upsert state — the new entry's media
//      must NOT appear in loadMediaIndex.
//
// This is guaranteed by the write ordering in upsertEntry: the media-index
// write is attempted first.  When it throws (MediaIndexWriteError), the entry
// list write is never attempted, so both AsyncStorage keys remain at their
// last-known-good state.
// ─────────────────────────────────────────────────────────────────────────────

describe("Storage-full scenario — both setItem calls throw leaves journal in pre-upsert state", () => {
  let savedSetItem: (typeof AsyncStorage)["setItem"];

  const PRE_EXISTING_PHOTO: JournalMedia = {
    id: "pre-existing-photo-001",
    uri: "file:///Documents/journal-media/pre-existing-photo-001.jpg",
    type: "photo",
    category: "bump",
  };
  const PRE_EXISTING_ENTRY: JournalEntry = {
    id: "pre-existing-entry-uuid",
    text: "Entry that existed before storage ran out",
    mood: "happy",
    gestationalWeeks: 24,
    gestationalDays: 0,
    createdAt: "2026-05-01T08:00:00.000Z",
    updatedAt: "2026-05-01T08:00:00.000Z",
    media: [PRE_EXISTING_PHOTO],
  };

  const NEW_ENTRY_WITH_PHOTO: JournalEntry = {
    id: "new-entry-uuid-storage-full",
    text: "Entry that could not be saved because storage was full",
    mood: "anxious",
    gestationalWeeks: 25,
    gestationalDays: 0,
    createdAt: "2026-05-08T10:00:00.000Z",
    updatedAt: "2026-05-08T10:00:00.000Z",
    media: [
      {
        id: "new-photo-storage-full-001",
        uri: "file:///Documents/journal-media/new-photo-storage-full-001.jpg",
        type: "photo",
        category: "ultrasound",
      },
    ],
  };

  beforeEach(async () => {
    savedSetItem = AsyncStorage.setItem;
    await AsyncStorage.clear();
    // Seed a pre-existing entry so we can verify state does NOT change
    await upsertEntry(PRE_EXISTING_ENTRY);
  });

  afterEach(async () => {
    (AsyncStorage as Record<string, unknown>)["setItem"] = savedSetItem;
    await AsyncStorage.clear();
  });

  it("upsertEntry propagates the error (MediaIndexWriteError) when both setItem calls throw", async () => {
    const warnSpy = jest
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);

    (AsyncStorage as Record<string, unknown>)["setItem"] = async (
      _key: string,
      _value: string,
    ) => {
      throw new Error("Device storage full");
    };

    await expect(upsertEntry(NEW_ENTRY_WITH_PHOTO)).rejects.toBeInstanceOf(
      MediaIndexWriteError,
    );

    warnSpy.mockRestore();
  });

  it("loadEntries returns the pre-upsert state when both setItem calls throw", async () => {
    const warnSpy = jest
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);

    (AsyncStorage as Record<string, unknown>)["setItem"] = async (
      _key: string,
      _value: string,
    ) => {
      throw new Error("Device storage full");
    };

    await upsertEntry(NEW_ENTRY_WITH_PHOTO).catch(() => {});

    // Restore so loadEntries can read from real AsyncStorage
    (AsyncStorage as Record<string, unknown>)["setItem"] = savedSetItem;
    warnSpy.mockRestore();

    const entries = await loadEntries();
    // Only the pre-existing entry must be present; the failed entry must not appear
    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe(PRE_EXISTING_ENTRY.id);
    expect(
      entries.find((e) => e.id === NEW_ENTRY_WITH_PHOTO.id),
    ).toBeUndefined();
  });

  it("loadMediaIndex returns the pre-upsert state when both setItem calls throw", async () => {
    const warnSpy = jest
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);

    (AsyncStorage as Record<string, unknown>)["setItem"] = async (
      _key: string,
      _value: string,
    ) => {
      throw new Error("Device storage full");
    };

    await upsertEntry(NEW_ENTRY_WITH_PHOTO).catch(() => {});

    // Restore so loadMediaIndex can read from real AsyncStorage
    (AsyncStorage as Record<string, unknown>)["setItem"] = savedSetItem;
    warnSpy.mockRestore();

    const index = await loadMediaIndex();
    // Pre-existing entry's media must be unchanged
    expect(index[PRE_EXISTING_ENTRY.id]).toEqual([PRE_EXISTING_PHOTO]);
    // The failed entry's photo must NOT have been indexed
    expect(index[NEW_ENTRY_WITH_PHOTO.id]).toBeUndefined();
    expect(Object.keys(index)).toHaveLength(1);
  });
});
