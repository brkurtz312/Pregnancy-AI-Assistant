/**
 * Media index orphan cleanup — lib-level tests
 *
 * Verifies that pruneOrphanedMediaIndexKeys removes index keys that no longer
 * correspond to any entry in the merged list. This represents the scenario
 * where a server-side delete causes an entry to disappear from serverEntries
 * during a sync, but the local deleteEntry path was never called, leaving a
 * stale media index key behind.
 *
 * Also verifies that the actual on-disk files are deleted via
 * FileSystem.deleteAsync (idempotent: true) when a key is evicted, so that a
 * photo deleted on one device is also removed from disk on the other device's
 * next sync.
 */

jest.mock("expo-file-system/legacy", () => ({
  documentDirectory: "/tmp/",
  getInfoAsync: jest.fn(async () => ({ exists: true })),
  makeDirectoryAsync: jest.fn(async () => {}),
  copyAsync: jest.fn(async () => {}),
  deleteAsync: jest.fn(async () => {}),
}));

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import {
  upsertEntry,
  loadMediaIndex,
  pruneOrphanedMediaIndexKeys,
} from "@/lib/journal";
import type { JournalEntry, JournalMedia } from "@/lib/journal";

const mockDeleteAsync = FileSystem.deleteAsync as jest.Mock;

const PHOTO_A: JournalMedia = {
  id: "photo-aaa",
  uri: "file:///tmp/journal-media/photo-aaa.jpg",
  type: "photo",
  category: "bump",
};

const PHOTO_B: JournalMedia = {
  id: "photo-bbb",
  uri: "file:///tmp/journal-media/photo-bbb.jpg",
  type: "photo",
  category: "ultrasound",
};

const ENTRY_A: JournalEntry = {
  id: "entry-aaa",
  text: "Entry A",
  mood: "happy",
  gestationalWeeks: 20,
  gestationalDays: 0,
  createdAt: "2026-05-01T10:00:00.000Z",
  updatedAt: "2026-05-01T10:00:00.000Z",
  media: [PHOTO_A],
};

const ENTRY_B: JournalEntry = {
  id: "entry-bbb",
  text: "Entry B",
  mood: "excited",
  gestationalWeeks: 24,
  gestationalDays: 0,
  createdAt: "2026-06-01T10:00:00.000Z",
  updatedAt: "2026-06-01T10:00:00.000Z",
  media: [PHOTO_B],
};

describe("pruneOrphanedMediaIndexKeys", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    mockDeleteAsync.mockClear();
  });

  it("removes index keys not present in the known-entry set", async () => {
    // Both entries are written locally
    await upsertEntry(ENTRY_A);
    await upsertEntry(ENTRY_B);

    // Server-side delete removed ENTRY_B — merged list only has ENTRY_A
    await pruneOrphanedMediaIndexKeys(new Set([ENTRY_A.id]));

    const index = await loadMediaIndex();
    expect(index[ENTRY_A.id]).toEqual([PHOTO_A]);
    expect(index[ENTRY_B.id]).toBeUndefined();
  });

  it("calls deleteAsync for the orphaned photo URI when an entry is evicted", async () => {
    await upsertEntry(ENTRY_A);
    await upsertEntry(ENTRY_B);

    mockDeleteAsync.mockClear();

    // Server-side delete removed ENTRY_B — only ENTRY_A is known
    await pruneOrphanedMediaIndexKeys(new Set([ENTRY_A.id]));

    // The on-disk file for PHOTO_B must have been deleted
    expect(mockDeleteAsync).toHaveBeenCalledWith(PHOTO_B.uri, {
      idempotent: true,
    });
    // The surviving entry's photo must NOT have been deleted
    const deletedUris = mockDeleteAsync.mock.calls.map(
      (call: unknown[]) => call[0],
    );
    expect(deletedUris).not.toContain(PHOTO_A.uri);
  });

  it("calls deleteAsync for every photo in each evicted entry", async () => {
    const MULTI_PHOTO_ENTRY: JournalEntry = {
      ...ENTRY_B,
      media: [PHOTO_B, PHOTO_A],
    };
    await upsertEntry(ENTRY_A);
    await upsertEntry(MULTI_PHOTO_ENTRY);

    mockDeleteAsync.mockClear();

    await pruneOrphanedMediaIndexKeys(new Set());

    const deletedUris = mockDeleteAsync.mock.calls.map(
      (call: unknown[]) => call[0],
    );
    expect(deletedUris).toContain(PHOTO_A.uri);
    expect(deletedUris).toContain(PHOTO_B.uri);
    expect(mockDeleteAsync).toHaveBeenCalledWith(expect.any(String), {
      idempotent: true,
    });
  });

  it("does not call deleteAsync for entries that remain known", async () => {
    await upsertEntry(ENTRY_A);
    await upsertEntry(ENTRY_B);

    mockDeleteAsync.mockClear();

    // Both entries are still present on the server — nothing evicted
    await pruneOrphanedMediaIndexKeys(new Set([ENTRY_A.id, ENTRY_B.id]));

    expect(mockDeleteAsync).not.toHaveBeenCalled();
  });

  it("keeps all index keys when all entries are still known", async () => {
    await upsertEntry(ENTRY_A);
    await upsertEntry(ENTRY_B);

    // Merged list still has both entries — nothing should be pruned
    await pruneOrphanedMediaIndexKeys(new Set([ENTRY_A.id, ENTRY_B.id]));

    const index = await loadMediaIndex();
    expect(index[ENTRY_A.id]).toEqual([PHOTO_A]);
    expect(index[ENTRY_B.id]).toEqual([PHOTO_B]);
  });

  it("removes all index keys when merged list is empty", async () => {
    await upsertEntry(ENTRY_A);
    await upsertEntry(ENTRY_B);

    // All entries were deleted server-side
    await pruneOrphanedMediaIndexKeys(new Set());

    const index = await loadMediaIndex();
    expect(Object.keys(index)).toHaveLength(0);
  });

  it("is a no-op when the index is already empty", async () => {
    // Nothing in AsyncStorage — index is empty to start
    await pruneOrphanedMediaIndexKeys(new Set([ENTRY_A.id]));

    const index = await loadMediaIndex();
    expect(Object.keys(index)).toHaveLength(0);
  });

  it("does not write to AsyncStorage when nothing was pruned", async () => {
    await upsertEntry(ENTRY_A);

    const setItemSpy = jest.spyOn(AsyncStorage, "setItem");
    // Reset accumulated calls from earlier tests before checking.
    setItemSpy.mockClear();
    await pruneOrphanedMediaIndexKeys(new Set([ENTRY_A.id]));

    // No orphans — persistMediaIndex should not have been called
    expect(setItemSpy).not.toHaveBeenCalled();
    setItemSpy.mockRestore();
  });
});
