/**
 * Photo-index corruption warning tests
 *
 * Verifies that when AsyncStorage.setItem fails inside persistMediaIndex,
 * the callers that handle reindex and prune paths emit a console.warn with
 * context-specific messages rather than silently swallowing the error.
 *
 * Covered functions:
 *  - reindexMediaForEntry   (ID-promotion path, called during migration/sync)
 *  - pruneOrphanedMediaIndexKeys (orphan-eviction path, called after every sync)
 *
 * Note: AsyncStorage.setItem in the jest mock is itself a jest.fn() that
 * internally calls asMock.multiSet. jest.spyOn wraps it in-place but
 * mockRestore() does not reliably unwind that cross-reference chain.
 * To avoid test pollution, we save and restore the property directly —
 * no jest.spyOn — and always restore in afterEach via try/finally.
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
  reindexMediaForEntry,
  pruneOrphanedMediaIndexKeys,
} from "@/lib/journal";
import type { JournalEntry, JournalMedia } from "@/lib/journal";

const PHOTO: JournalMedia = {
  id: "photo-111",
  uri: "file:///tmp/journal-media/photo-111.jpg",
  type: "photo",
  category: "general",
};

const ENTRY: JournalEntry = {
  id: "local-id-abc",
  text: "Test entry",
  mood: "happy",
  gestationalWeeks: 20,
  gestationalDays: 0,
  createdAt: "2026-07-01T10:00:00.000Z",
  updatedAt: "2026-07-01T10:00:00.000Z",
  media: [PHOTO],
};

const ENTRY_B: JournalEntry = {
  id: "entry-bbb",
  text: "Entry B",
  mood: "excited",
  gestationalWeeks: 24,
  gestationalDays: 0,
  createdAt: "2026-06-01T10:00:00.000Z",
  updatedAt: "2026-06-01T10:00:00.000Z",
  media: [
    {
      id: "photo-bbb",
      uri: "file:///tmp/journal-media/photo-bbb.jpg",
      type: "photo",
      category: "bump",
    },
  ],
};

describe("reindexMediaForEntry — warns and rethrows when persistMediaIndex fails", () => {
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

  it("emits console.warn when AsyncStorage.setItem fails during reindex", async () => {
    await upsertEntry(ENTRY);

    // Replace setItem to fail only for the next call (the reindex write)
    const storageError = new Error("storage full");
    (AsyncStorage as Record<string, unknown>)["setItem"] = async () => {
      throw storageError;
    };

    await expect(
      reindexMediaForEntry("local-id-abc", "server-uuid-xyz"),
    ).rejects.toThrow("storage full");

    const warnMessages = warnSpy.mock.calls.map((args: unknown[]) =>
      args.join(" "),
    );
    const hasReindexWarn = warnMessages.some(
      (msg: string) =>
        msg.includes("reindexMediaForEntry") &&
        msg.includes("local-id-abc") &&
        msg.includes("server-uuid-xyz"),
    );
    expect(hasReindexWarn).toBe(true);
  });

  it("does NOT warn when reindexMediaForEntry succeeds", async () => {
    await upsertEntry(ENTRY);

    await reindexMediaForEntry("local-id-abc", "server-uuid-xyz");

    const warnMessages = warnSpy.mock.calls.map((args: unknown[]) =>
      args.join(" "),
    );
    const hasReindexWarn = warnMessages.some((msg: string) =>
      msg.includes("reindexMediaForEntry"),
    );
    expect(hasReindexWarn).toBe(false);
  });

  it("does NOT warn when oldId === newId (no-op path, no write attempted)", async () => {
    await upsertEntry(ENTRY);

    await reindexMediaForEntry("local-id-abc", "local-id-abc");

    const warnMessages = warnSpy.mock.calls.map((args: unknown[]) =>
      args.join(" "),
    );
    const hasReindexWarn = warnMessages.some((msg: string) =>
      msg.includes("reindexMediaForEntry"),
    );
    expect(hasReindexWarn).toBe(false);
  });
});

describe("pruneOrphanedMediaIndexKeys — warns and rethrows when persistMediaIndex fails", () => {
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

  it("emits console.warn when AsyncStorage.setItem fails during prune", async () => {
    await upsertEntry(ENTRY);
    await upsertEntry(ENTRY_B);

    // Fail the write that pruneOrphanedMediaIndexKeys will attempt
    const storageError = new Error("disk quota exceeded");
    (AsyncStorage as Record<string, unknown>)["setItem"] = async () => {
      throw storageError;
    };

    await expect(
      pruneOrphanedMediaIndexKeys(new Set([ENTRY.id])),
    ).rejects.toThrow("disk quota exceeded");

    const warnMessages = warnSpy.mock.calls.map((args: unknown[]) =>
      args.join(" "),
    );
    const hasPruneWarn = warnMessages.some((msg: string) =>
      msg.includes("pruneOrphanedMediaIndexKeys"),
    );
    expect(hasPruneWarn).toBe(true);
  });

  it("does NOT warn when pruneOrphanedMediaIndexKeys succeeds", async () => {
    await upsertEntry(ENTRY);
    await upsertEntry(ENTRY_B);

    await pruneOrphanedMediaIndexKeys(new Set([ENTRY.id]));

    const warnMessages = warnSpy.mock.calls.map((args: unknown[]) =>
      args.join(" "),
    );
    const hasPruneWarn = warnMessages.some((msg: string) =>
      msg.includes("pruneOrphanedMediaIndexKeys"),
    );
    expect(hasPruneWarn).toBe(false);
  });

  it("does NOT warn when there are no orphans to prune (no write needed)", async () => {
    await upsertEntry(ENTRY);

    await pruneOrphanedMediaIndexKeys(new Set([ENTRY.id]));

    const warnMessages = warnSpy.mock.calls.map((args: unknown[]) =>
      args.join(" "),
    );
    const hasPruneWarn = warnMessages.some((msg: string) =>
      msg.includes("pruneOrphanedMediaIndexKeys"),
    );
    expect(hasPruneWarn).toBe(false);
  });
});
