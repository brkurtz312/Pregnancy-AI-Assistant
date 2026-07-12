/**
 * sweepUnreferencedMediaFiles — unit tests
 *
 * Verifies that the sweep function:
 *   - deletes on-disk files that have no corresponding media index entry
 *   - leaves files that ARE referenced by the media index untouched
 *   - is a no-op when the directory does not exist
 *   - is a no-op when the directory is empty
 *   - handles an empty index (all files are orphans) correctly
 */

const mockGetInfoAsync = jest.fn();
const mockReadDirectoryAsync = jest.fn();
const mockDeleteAsync = jest.fn();

jest.mock("expo-file-system/legacy", () => ({
  documentDirectory: "/tmp/",
  getInfoAsync: (...args: unknown[]) => mockGetInfoAsync(...args),
  readDirectoryAsync: (...args: unknown[]) => mockReadDirectoryAsync(...args),
  makeDirectoryAsync: jest.fn(async () => {}),
  copyAsync: jest.fn(async () => {}),
  deleteAsync: (...args: unknown[]) => mockDeleteAsync(...args),
}));

import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  sweepUnreferencedMediaFiles,
  JOURNAL_MEDIA_DIR,
  JOURNAL_MEDIA_INDEX_KEY,
} from "@/lib/journal";
import type { JournalMedia } from "@/lib/journal";

const PHOTO_REF: JournalMedia = {
  id: "photo-ref-001",
  uri: JOURNAL_MEDIA_DIR + "photo-ref-001.jpg",
  type: "photo",
  category: "bump",
};

const VIDEO_REF: JournalMedia = {
  id: "video-ref-001",
  uri: JOURNAL_MEDIA_DIR + "video-ref-001.mp4",
  type: "video",
  category: "general",
};

describe("sweepUnreferencedMediaFiles", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    mockGetInfoAsync.mockReset();
    mockReadDirectoryAsync.mockReset();
    mockDeleteAsync.mockReset();
    mockDeleteAsync.mockResolvedValue(undefined);
  });

  it("deletes an on-disk file that has no corresponding media index entry", async () => {
    // Directory exists and contains one orphan file
    mockGetInfoAsync.mockResolvedValue({ exists: true });
    mockReadDirectoryAsync.mockResolvedValue(["orphan-photo.jpg"]);

    // Media index is empty — the file is not referenced
    await AsyncStorage.setItem(JOURNAL_MEDIA_INDEX_KEY, JSON.stringify({}));

    await sweepUnreferencedMediaFiles();

    expect(mockDeleteAsync).toHaveBeenCalledWith(
      JOURNAL_MEDIA_DIR + "orphan-photo.jpg",
      { idempotent: true },
    );
  });

  it("does not delete a file that is referenced in the media index", async () => {
    mockGetInfoAsync.mockResolvedValue({ exists: true });
    mockReadDirectoryAsync.mockResolvedValue(["photo-ref-001.jpg"]);

    await AsyncStorage.setItem(
      JOURNAL_MEDIA_INDEX_KEY,
      JSON.stringify({ "entry-aaa": [PHOTO_REF] }),
    );

    await sweepUnreferencedMediaFiles();

    expect(mockDeleteAsync).not.toHaveBeenCalled();
  });

  it("deletes only the unreferenced file when the directory has both referenced and orphaned files", async () => {
    mockGetInfoAsync.mockResolvedValue({ exists: true });
    mockReadDirectoryAsync.mockResolvedValue([
      "photo-ref-001.jpg",
      "orphan-photo.jpg",
    ]);

    await AsyncStorage.setItem(
      JOURNAL_MEDIA_INDEX_KEY,
      JSON.stringify({ "entry-aaa": [PHOTO_REF] }),
    );

    await sweepUnreferencedMediaFiles();

    const deletedArgs = mockDeleteAsync.mock.calls.map(
      (c: unknown[]) => c[0] as string,
    );
    expect(deletedArgs).toContain(JOURNAL_MEDIA_DIR + "orphan-photo.jpg");
    expect(deletedArgs).not.toContain(JOURNAL_MEDIA_DIR + "photo-ref-001.jpg");
  });

  it("deletes all files when the media index is empty", async () => {
    mockGetInfoAsync.mockResolvedValue({ exists: true });
    mockReadDirectoryAsync.mockResolvedValue(["orphan-a.jpg", "orphan-b.mp4"]);

    // No index entry — both files are orphans
    await AsyncStorage.setItem(JOURNAL_MEDIA_INDEX_KEY, JSON.stringify({}));

    await sweepUnreferencedMediaFiles();

    const deletedArgs = mockDeleteAsync.mock.calls.map(
      (c: unknown[]) => c[0] as string,
    );
    expect(deletedArgs).toContain(JOURNAL_MEDIA_DIR + "orphan-a.jpg");
    expect(deletedArgs).toContain(JOURNAL_MEDIA_DIR + "orphan-b.mp4");
  });

  it("is a no-op when JOURNAL_MEDIA_DIR does not exist", async () => {
    mockGetInfoAsync.mockResolvedValue({ exists: false });

    await sweepUnreferencedMediaFiles();

    expect(mockReadDirectoryAsync).not.toHaveBeenCalled();
    expect(mockDeleteAsync).not.toHaveBeenCalled();
  });

  it("is a no-op when the directory is empty", async () => {
    mockGetInfoAsync.mockResolvedValue({ exists: true });
    mockReadDirectoryAsync.mockResolvedValue([]);

    await sweepUnreferencedMediaFiles();

    expect(mockDeleteAsync).not.toHaveBeenCalled();
  });

  it("handles multiple entries each with multiple media items correctly", async () => {
    mockGetInfoAsync.mockResolvedValue({ exists: true });
    mockReadDirectoryAsync.mockResolvedValue([
      "photo-ref-001.jpg",
      "video-ref-001.mp4",
      "orphan.jpg",
    ]);

    await AsyncStorage.setItem(
      JOURNAL_MEDIA_INDEX_KEY,
      JSON.stringify({
        "entry-aaa": [PHOTO_REF],
        "entry-bbb": [VIDEO_REF],
      }),
    );

    await sweepUnreferencedMediaFiles();

    const deletedArgs = mockDeleteAsync.mock.calls.map(
      (c: unknown[]) => c[0] as string,
    );
    expect(deletedArgs).toEqual([JOURNAL_MEDIA_DIR + "orphan.jpg"]);
  });

  it("does not throw when deleteAsync rejects for an individual file", async () => {
    mockGetInfoAsync.mockResolvedValue({ exists: true });
    mockReadDirectoryAsync.mockResolvedValue(["orphan.jpg"]);
    mockDeleteAsync.mockRejectedValue(new Error("permission denied"));

    await AsyncStorage.setItem(JOURNAL_MEDIA_INDEX_KEY, JSON.stringify({}));

    await expect(sweepUnreferencedMediaFiles()).resolves.toBeUndefined();
  });
});
