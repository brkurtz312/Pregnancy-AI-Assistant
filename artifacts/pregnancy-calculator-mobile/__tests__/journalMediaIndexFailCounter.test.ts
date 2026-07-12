/**
 * Media-index persist failure counter tests
 *
 * Verifies that:
 *  - getMediaIndexFailCount() returns 0 when no failures have been recorded
 *  - persistMediaIndex failures increment the counter (via upsertEntry)
 *  - persistMediaIndex success resets the counter to 0
 *  - the counter accumulates across multiple consecutive failures
 *  - MEDIA_INDEX_PERSIST_FAIL_THRESHOLD is exported and equals 3
 *
 * Testing strategy:
 *  - Use upsertEntry as the observable entry-point for persistMediaIndex; it
 *    wraps the failure in MediaIndexWriteError and we catch that to confirm the
 *    path was taken.
 *  - After each call that should fail, assert getMediaIndexFailCount() returned
 *    an incremented value.
 *  - After a successful call, assert getMediaIndexFailCount() returns 0.
 *
 * setItem injection follows the same save/restore pattern used in
 * journalIndexCorruptionWarn.test.ts to avoid jest.spyOn cross-reference
 * pollution with the AsyncStorage mock internals.
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
  getMediaIndexFailCount,
  MEDIA_INDEX_PERSIST_FAIL_THRESHOLD,
  MediaIndexWriteError,
  JOURNAL_MEDIA_INDEX_FAIL_COUNT_KEY,
} from "@/lib/journal";
import type { JournalEntry, JournalMedia } from "@/lib/journal";

const PHOTO: JournalMedia = {
  id: "photo-counter-001",
  uri: "file:///tmp/journal-media/photo-counter-001.jpg",
  type: "photo",
  category: "general",
};

const ENTRY: JournalEntry = {
  id: "entry-counter-abc",
  text: "Counter test entry",
  mood: "happy",
  gestationalWeeks: 28,
  gestationalDays: 0,
  createdAt: "2026-07-12T10:00:00.000Z",
  updatedAt: "2026-07-12T10:00:00.000Z",
  media: [PHOTO],
};

describe("MEDIA_INDEX_PERSIST_FAIL_THRESHOLD", () => {
  it("is exported and equals 3", () => {
    expect(MEDIA_INDEX_PERSIST_FAIL_THRESHOLD).toBe(3);
  });
});

describe("getMediaIndexFailCount", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });
  afterEach(async () => {
    await AsyncStorage.clear();
  });

  it("returns 0 when no failures have been recorded", async () => {
    expect(await getMediaIndexFailCount()).toBe(0);
  });

  it("returns 0 when the key is missing", async () => {
    await AsyncStorage.removeItem(JOURNAL_MEDIA_INDEX_FAIL_COUNT_KEY);
    expect(await getMediaIndexFailCount()).toBe(0);
  });

  it("returns 0 when the stored value is not a number", async () => {
    await AsyncStorage.setItem(
      JOURNAL_MEDIA_INDEX_FAIL_COUNT_KEY,
      "notanumber",
    );
    expect(await getMediaIndexFailCount()).toBe(0);
  });

  it("returns the stored integer when present", async () => {
    await AsyncStorage.setItem(JOURNAL_MEDIA_INDEX_FAIL_COUNT_KEY, "5");
    expect(await getMediaIndexFailCount()).toBe(5);
  });
});

describe("persistMediaIndex failure counter — increments on failure, resets on success", () => {
  let savedSetItem: (typeof AsyncStorage)["setItem"];
  let warnSpy: jest.SpyInstance;

  beforeEach(async () => {
    savedSetItem = AsyncStorage.setItem;
    await AsyncStorage.clear();
    jest.clearAllMocks();
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(async () => {
    (AsyncStorage as Record<string, unknown>)["setItem"] = savedSetItem;
    warnSpy.mockRestore();
    await AsyncStorage.clear();
  });

  it("increments the counter from 0 to 1 after one persistMediaIndex failure", async () => {
    expect(await getMediaIndexFailCount()).toBe(0);

    // Make the media-index setItem call fail.  The counter increment uses its
    // own setItem call but the fail injection below only fires once, so the
    // counter write succeeds on the second call.
    let callCount = 0;
    const storageError = new Error("storage full");
    (AsyncStorage as Record<string, unknown>)["setItem"] = async (
      key: string,
      value: string,
    ) => {
      callCount++;
      if (callCount === 1) throw storageError;
      return savedSetItem(key, value);
    };

    await expect(upsertEntry(ENTRY)).rejects.toBeInstanceOf(
      MediaIndexWriteError,
    );

    (AsyncStorage as Record<string, unknown>)["setItem"] = savedSetItem;

    expect(await getMediaIndexFailCount()).toBe(1);
  });

  it("accumulates the counter across multiple consecutive failures", async () => {
    // Seed an existing failure count of 1 so we can observe accumulation.
    await AsyncStorage.setItem(JOURNAL_MEDIA_INDEX_FAIL_COUNT_KEY, "1");

    const storageError = new Error("quota exceeded");
    let callCount = 0;
    (AsyncStorage as Record<string, unknown>)["setItem"] = async (
      key: string,
      value: string,
    ) => {
      callCount++;
      if (callCount === 1) throw storageError;
      return savedSetItem(key, value);
    };

    await expect(upsertEntry(ENTRY)).rejects.toBeInstanceOf(
      MediaIndexWriteError,
    );

    (AsyncStorage as Record<string, unknown>)["setItem"] = savedSetItem;

    expect(await getMediaIndexFailCount()).toBe(2);
  });

  it("resets the counter to 0 after a successful persistMediaIndex write", async () => {
    // Pre-seed the counter to simulate accumulated past failures.
    await AsyncStorage.setItem(
      JOURNAL_MEDIA_INDEX_FAIL_COUNT_KEY,
      String(MEDIA_INDEX_PERSIST_FAIL_THRESHOLD),
    );
    expect(await getMediaIndexFailCount()).toBe(
      MEDIA_INDEX_PERSIST_FAIL_THRESHOLD,
    );

    // Successful upsert — persistMediaIndex should call resetMediaIndexFailCount.
    await upsertEntry(ENTRY);

    expect(await getMediaIndexFailCount()).toBe(0);
  });

  it("counter stays at 0 when there is no previous failure", async () => {
    expect(await getMediaIndexFailCount()).toBe(0);

    await upsertEntry(ENTRY);

    expect(await getMediaIndexFailCount()).toBe(0);
  });
});
