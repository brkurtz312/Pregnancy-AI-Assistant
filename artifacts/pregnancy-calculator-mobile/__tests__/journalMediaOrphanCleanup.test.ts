/**
 * Media index orphan cleanup — lib-level tests
 *
 * Verifies that pruneOrphanedMediaIndexKeys removes index keys that no longer
 * correspond to any entry in the merged list. This represents the scenario
 * where a server-side delete causes an entry to disappear from serverEntries
 * during a sync, but the local deleteEntry path was never called, leaving a
 * stale media index key behind.
 */

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
  loadMediaIndex,
  pruneOrphanedMediaIndexKeys,
} from "@/lib/journal";
import type { JournalEntry, JournalMedia } from "@/lib/journal";

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
