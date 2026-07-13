/**
 * Screen-level test — storage-full alert in journal-entry.tsx
 *
 * Confirms that when `upsertEntry` throws a `JournalKeyWriteError` (e.g.
 * because the device's AsyncStorage quota is exhausted), `handleSave` shows
 * the targeted "Could not save entry" alert rather than the generic
 * "Couldn't save" fallback.  Also confirms that a plain Error does NOT
 * trigger the storage-full alert.
 *
 * Why a screen-level test?
 * The lib-level behaviour (upsertEntry throwing JournalKeyWriteError on an
 * AsyncStorage write failure) is already exercised elsewhere.  This test
 * focuses on the wiring inside `journal-entry.tsx`: specifically that the
 * `catch (err)` block calls `Alert.alert` with the right title when
 * JournalKeyWriteError is thrown, and that the two error branches are
 * mutually exclusive.
 */

// ─── expo-file-system/legacy (required by lib/journal.ts at module load) ──────

jest.mock("expo-file-system/legacy", () => ({
  documentDirectory: "/tmp/",
  getInfoAsync: jest.fn(async () => ({ exists: true })),
  makeDirectoryAsync: jest.fn(async () => {}),
  copyAsync: jest.fn(async () => {}),
  deleteAsync: jest.fn(async () => {}),
}));

// ─── @/lib/journal — keep real JournalKeyWriteError, mock upsertEntry ─────────

jest.mock("@/lib/journal", () => {
  const actual =
    jest.requireActual<typeof import("@/lib/journal")>("@/lib/journal");
  return {
    ...actual,
    upsertEntry: jest.fn(),
    loadEntries: jest.fn(async () => []),
    getJournalPrompts: jest.fn(() => []),
  };
});

// ─── RN + Expo infrastructure mocks ──────────────────────────────────────────

jest.mock("react-native-reanimated", () =>
  require("react-native-reanimated/mock"),
);

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock("@expo/vector-icons", () => ({ Ionicons: "Ionicons" }));

jest.mock("expo-image", () => ({ Image: "Image" }));

jest.mock("expo-image-picker", () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({
    status: "denied",
  })),
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: true })),
}));

// ─── Workspace / hooks mocks ──────────────────────────────────────────────────

jest.mock("@workspace/api-client-react", () => ({
  useGetProfile: jest.fn(() => ({ data: undefined })),
  getGetProfileQueryKey: jest.fn(() => ["profile"]),
}));

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
    destructive: "#e53e3e",
  }),
}));

jest.mock("@/hooks/usePass", () => ({
  usePass: () => ({ hasPass: false }),
}));

jest.mock("@/components/PassGate", () => ({ PassGate: () => null }));

jest.mock("@/constants/free-limits", () => ({ FREE_PHOTO_LIMIT: 3 }));

jest.mock("@/lib/pregnancy-math", () => ({
  getGestationalAgeAtDate: jest.fn(() => ({ weeks: 28, days: 0 })),
}));

// ─── Clerk mock ───────────────────────────────────────────────────────────────

jest.mock("@clerk/expo", () => ({
  useAuth: jest.fn(() => ({
    isSignedIn: false,
    getToken: jest.fn(async () => null),
  })),
}));

// ─── expo-router mock ─────────────────────────────────────────────────────────

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), push: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({})),
}));

// ─── Sync mocks ───────────────────────────────────────────────────────────────

jest.mock("@/lib/sync-api", () => ({
  apiUpsertJournalEntry: jest.fn(async () => ({ id: "new-id" })),
  apiDeleteJournalEntry: jest.fn(async () => {}),
}));

jest.mock("@/lib/sync-queue", () => ({
  markPendingSync: jest.fn(async () => {}),
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import React from "react";
import { act, create } from "react-test-renderer";
import { Alert, TextInput } from "react-native";
import { flushAsync } from "../test-helpers/testUtils";
import { JournalKeyWriteError } from "@/lib/journal";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderJournalEntryScreen() {
  const JournalEntryScreen = require("../app/journal-entry")
    .default as React.ComponentType;
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(React.createElement(JournalEntryScreen));
  });
  return renderer;
}

/**
 * Returns the Save button instance — the only TouchableOpacity in the screen
 * that has a `disabled` prop (which toggles on/off while saving).
 */
function findSaveButton(renderer: ReturnType<typeof create>) {
  return renderer.root.findAll(
    (el) =>
      el.props.onPress !== undefined &&
      "disabled" in el.props &&
      el.props.activeOpacity !== undefined,
  )[0];
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("journal-entry.tsx — handleSave storage-full alert wiring", () => {
  jest.setTimeout(30000);
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  it("shows 'Could not save entry' alert when upsertEntry throws JournalKeyWriteError", async () => {
    const { upsertEntry } = require("@/lib/journal") as {
      upsertEntry: jest.Mock;
    };
    upsertEntry.mockRejectedValue(
      new JournalKeyWriteError(new Error("AsyncStorage quota exceeded")),
    );

    const renderer = renderJournalEntryScreen();

    const inputs = renderer.root.findAllByType(TextInput);
    await act(async () => {
      inputs[0].props.onChangeText("My journal entry text");
    });

    const saveButton = findSaveButton(renderer);
    await act(async () => {
      saveButton.props.onPress();
    });
    await flushAsync();

    const calls = alertSpy.mock.calls;

    const storageFullCall = calls.find(
      (args) => args[0] === "Could not save entry",
    );
    expect(storageFullCall).toBeDefined();
    expect(storageFullCall![1]).toMatch(/storage/i);

    const genericCall = calls.find((args) => args[0] === "Couldn't save");
    expect(genericCall).toBeUndefined();

    const { router } = require("expo-router");
    expect(router.back).not.toHaveBeenCalled();
  });

  it("does NOT show 'Could not save entry' for a plain Error (shows generic alert instead)", async () => {
    const { upsertEntry } = require("@/lib/journal") as {
      upsertEntry: jest.Mock;
    };
    upsertEntry.mockRejectedValue(new Error("unexpected failure"));

    const renderer = renderJournalEntryScreen();

    const inputs = renderer.root.findAllByType(TextInput);
    await act(async () => {
      inputs[0].props.onChangeText("My journal entry text");
    });

    const saveButton = findSaveButton(renderer);
    await act(async () => {
      saveButton.props.onPress();
    });
    await flushAsync();

    const calls = alertSpy.mock.calls;

    const genericCall = calls.find((args) => args[0] === "Couldn't save");
    expect(genericCall).toBeDefined();

    const storageFullCall = calls.find(
      (args) => args[0] === "Could not save entry",
    );
    expect(storageFullCall).toBeUndefined();
  });
});
