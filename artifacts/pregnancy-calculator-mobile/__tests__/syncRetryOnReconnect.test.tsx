/**
 * Tests confirming the retry-on-reconnect path for all three sync-enabled tools:
 * Journal, Hospital Bag, and Birth Plan.
 *
 * Scenario: the API is unreachable when the user makes changes (or on initial
 * load), so data is stored locally with a pending-sync marker. When connectivity
 * is restored, useNetReconnect fires its callback and the pending data is pushed
 * to the server.
 *
 * The key difference from syncApiFallback.test.tsx: here we mock useNetReconnect
 * to *capture* the callback so tests can fire it, rather than treating it as a
 * no-op.
 */

import React from "react";
import { TouchableOpacity } from "react-native";
import { act, create } from "react-test-renderer";
import { flushAsync } from "../test-helpers/testUtils";

// ─── Shared RN mocks ──────────────────────────────────────────────────────────

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

// ─── NetInfo (no-op listener, start online) ───────────────────────────────────

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

// ─── useNetReconnect — captures callback so tests can fire it ─────────────────
//
// Each render call replaces capturedReconnectCb with the latest closure so it
// is always up-to-date (mirrors the onReconnectRef pattern in the real hook).

let capturedReconnectCb: (() => void) | null = null;

jest.mock("@/hooks/useNetReconnect", () => ({
  useNetReconnect: jest.fn((cb: () => void) => {
    capturedReconnectCb = cb;
  }),
}));

// ─── Shared misc mocks ────────────────────────────────────────────────────────

jest.mock("@/lib/sync-queue", () => ({
  markPendingSync: jest.fn(async () => {}),
  clearPendingSync: jest.fn(async () => {}),
  hasPendingSync: jest.fn(async () => false),
  tryAcquireSyncLock: jest.fn(() => true),
  releaseSyncLock: jest.fn(),
}));

jest.mock("@/components/SyncBanner", () => ({
  SyncBanner: () => null,
}));

// ─── Journal-specific mocks ───────────────────────────────────────────────────

jest.mock("expo-image", () => ({ Image: "Image" }));
jest.mock("@/lib/journal-pdf", () => ({ exportJournalPdf: jest.fn() }));
jest.mock("@/hooks/usePass", () => ({ usePass: () => ({ hasPass: false }) }));
jest.mock("@/components/PassGate", () => ({ PassGate: () => null }));
jest.mock("@/constants/free-limits", () => ({ FREE_JOURNAL_ENTRY_LIMIT: 5 }));

jest.mock("@/lib/journal", () => ({
  loadEntries: jest.fn(),
  cacheEntries: jest.fn(async () => {}),
  getAgeLabel: jest.fn(() => ""),
  MOOD_OPTIONS: [],
  getJournalCacheOwner: jest.fn(async () => null),
  setJournalCacheOwner: jest.fn(async () => {}),
  clearJournalCache: jest.fn(async () => {}),
  loadMediaIndex: jest.fn(async () => ({})),
  reindexMediaForEntry: jest.fn(async () => {}),
  pruneOrphanedMediaIndexKeys: jest.fn(async () => {}),
}));

// ─── Hospital-bag-specific mocks ──────────────────────────────────────────────

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: "Light", Medium: "Medium", Heavy: "Heavy" },
}));

jest.mock("expo-print", () => ({
  printToFileAsync: jest.fn(async () => ({ uri: "file://test.pdf" })),
}));

jest.mock("@/components/AskCard", () => ({ AskCard: () => null }));

jest.mock("@/lib/hospital-bag", () => ({
  loadHospitalBagChecklist: jest.fn(),
  saveHospitalBagChecklist: jest.fn(async () => {}),
  countChecked: jest.fn(() => ({ checked: 1, total: 1 })),
  buildHospitalBagHtml: jest.fn(() => "<html/>"),
  getHospitalBagCacheOwner: jest.fn(async () => null),
  setHospitalBagCacheOwner: jest.fn(async () => {}),
  clearHospitalBagCache: jest.fn(async () => {}),
}));

// ─── Birth-plan-specific mocks ────────────────────────────────────────────────

jest.mock("expo-sharing", () => ({
  isAvailableAsync: jest.fn(async () => false),
}));

jest.mock("expo-asset", () => ({
  Asset: {
    fromModule: jest.fn(() => ({
      downloadAsync: jest.fn(async () => {}),
      localUri: "file://test.pdf",
      uri: "file://test.pdf",
    })),
  },
}));

jest.mock("expo-file-system/legacy", () => ({
  cacheDirectory: "file://cache/",
  copyAsync: jest.fn(async () => {}),
  deleteAsync: jest.fn(async () => {}),
}));

jest.mock("@/lib/birth-plan", () => ({
  loadBirthPlanAnswers: jest.fn(),
  saveBirthPlanAnswers: jest.fn(async () => {}),
  markBirthPlanGenerated: jest.fn(async () => {}),
  buildBirthPlanHtml: jest.fn(() => "<html/>"),
  BIRTH_PLAN_SECTIONS: [
    {
      id: "s1",
      title: "Labour Preferences",
      fields: [
        {
          id: "moveFreelyDuringLabour",
          label: "I would like to move freely during labour",
          type: "boolean",
        },
      ],
    },
  ],
  getBirthPlanCacheOwner: jest.fn(async () => null),
  setBirthPlanCacheOwner: jest.fn(async () => {}),
  clearBirthPlanCache: jest.fn(async () => {}),
}));

// ─── sync-api mock (all endpoints) ────────────────────────────────────────────

jest.mock("@/lib/sync-api", () => ({
  apiLoadJournalEntries: jest.fn(),
  apiUpsertJournalEntry: jest.fn(),
  apiLoadHospitalBag: jest.fn(),
  apiSaveHospitalBag: jest.fn(),
  apiLoadBirthPlanAnswers: jest.fn(),
  apiSaveBirthPlanAnswers: jest.fn(),
  isServerUuid: jest.fn((id: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id),
  ),
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { useAuth, useUser } from "@clerk/expo";
import { clearPendingSync } from "@/lib/sync-queue";
import {
  apiLoadJournalEntries,
  apiUpsertJournalEntry,
  apiLoadHospitalBag,
  apiSaveHospitalBag,
  apiLoadBirthPlanAnswers,
  apiSaveBirthPlanAnswers,
} from "@/lib/sync-api";
import {
  loadEntries,
  cacheEntries,
  getJournalCacheOwner,
  clearJournalCache,
} from "@/lib/journal";
import {
  loadHospitalBagChecklist,
  saveHospitalBagChecklist,
  getHospitalBagCacheOwner,
  clearHospitalBagCache,
} from "@/lib/hospital-bag";
import {
  loadBirthPlanAnswers,
  saveBirthPlanAnswers,
  getBirthPlanCacheOwner,
  clearBirthPlanCache,
} from "@/lib/birth-plan";

const mockUseAuth = useAuth as jest.Mock;
const mockUseUser = useUser as jest.Mock;
const mockClearPendingSync = clearPendingSync as jest.Mock;

const mockApiLoadJournal = apiLoadJournalEntries as jest.Mock;
const mockApiUpsertJournal = apiUpsertJournalEntry as jest.Mock;
const mockLoadEntries = loadEntries as jest.Mock;
const mockCacheEntries = cacheEntries as jest.Mock;
const mockGetJournalCacheOwner = getJournalCacheOwner as jest.Mock;
const mockClearJournalCache = clearJournalCache as jest.Mock;

const mockApiLoadHospitalBag = apiLoadHospitalBag as jest.Mock;
const mockApiSaveHospitalBag = apiSaveHospitalBag as jest.Mock;
const mockLoadHospitalBag = loadHospitalBagChecklist as jest.Mock;
const mockSaveHospitalBag = saveHospitalBagChecklist as jest.Mock;
const mockGetHospitalBagCacheOwner = getHospitalBagCacheOwner as jest.Mock;
const mockClearHospitalBagCache = clearHospitalBagCache as jest.Mock;

const mockApiLoadBirthPlan = apiLoadBirthPlanAnswers as jest.Mock;
const mockApiSaveBirthPlan = apiSaveBirthPlanAnswers as jest.Mock;
const mockLoadBirthPlan = loadBirthPlanAnswers as jest.Mock;
const mockSaveBirthPlan = saveBirthPlanAnswers as jest.Mock;
const mockGetBirthPlanCacheOwner = getBirthPlanCacheOwner as jest.Mock;
const mockClearBirthPlanCache = clearBirthPlanCache as jest.Mock;

function setSignedIn(id = "user-123") {
  mockUseAuth.mockReturnValue({
    isSignedIn: true,
    getToken: jest.fn(async () => "tok"),
  });
  mockUseUser.mockReturnValue({ user: { id } });
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const LOCAL_ENTRY = {
  id: "local-abc",
  text: "Offline journal entry",
  mood: undefined,
  gestationalWeeks: 20,
  gestationalDays: 0,
  postpartumDays: undefined,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  media: [],
};

const SERVER_ENTRY_FOR_LOCAL = {
  id: "00000000-0000-4000-8000-000000000001",
  text: "Offline journal entry",
  mood: undefined,
  gestationalWeeks: 20,
  gestationalDays: 0,
  postpartumDays: undefined,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  media: [],
};

const CATEGORIES = [
  {
    id: "cat1",
    title: "For Mum",
    items: [{ id: "item1", label: "Pyjamas", checked: false }],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// JOURNAL — retry on reconnect
// ─────────────────────────────────────────────────────────────────────────────

describe("Journal — retry local-only entries when connectivity is restored", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedReconnectCb = null;
    setSignedIn();
    mockCacheEntries.mockResolvedValue(undefined);
    mockGetJournalCacheOwner.mockResolvedValue(null);
    mockClearJournalCache.mockResolvedValue(undefined);
  });

  it("pushes a local-only entry to the server on reconnect after an offline load failure", async () => {
    jest.setTimeout(15000);

    // First sync (mount / focus): API is unreachable → fall back to local cache
    mockApiLoadJournal
      .mockRejectedValueOnce(new Error("no network"))
      // Second sync (reconnect): API is back — server has no entries for this user
      .mockResolvedValueOnce([]);

    // Local store holds one entry created while offline (non-UUID id)
    mockLoadEntries.mockResolvedValue([LOCAL_ENTRY]);

    // When the local-only entry is upserted the server assigns a UUID
    mockApiUpsertJournal.mockResolvedValue(SERVER_ENTRY_FOR_LOCAL);

    const JournalScreen = require("../app/journal").default;
    act(() => {
      create(React.createElement(JournalScreen));
    });
    await flushAsync(1);

    // After the offline failure the entry is NOT yet on the server
    expect(mockApiUpsertJournal).not.toHaveBeenCalled();
    // And a reconnect callback should have been registered
    expect(capturedReconnectCb).not.toBeNull();

    // Simulate the network coming back online
    await act(async () => {
      capturedReconnectCb!();
      await new Promise<void>((r) => process.nextTick(r));
    });

    // The full sync ran a second time
    expect(mockApiLoadJournal).toHaveBeenCalledTimes(2);
    // The local-only entry (non-UUID id) was pushed to the server
    expect(mockApiUpsertJournal).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "local-abc",
        text: "Offline journal entry",
      }),
      expect.any(Function),
    );
    // Pending marker cleared because sync succeeded
    expect(mockClearPendingSync).toHaveBeenCalledWith("journal");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// HOSPITAL BAG — retry on reconnect
// ─────────────────────────────────────────────────────────────────────────────

describe("Hospital Bag — retry save when connectivity is restored", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedReconnectCb = null;
    setSignedIn();
    mockSaveHospitalBag.mockResolvedValue(undefined);
    mockGetHospitalBagCacheOwner.mockResolvedValue(null);
    mockClearHospitalBagCache.mockResolvedValue(undefined);
  });

  it("re-pushes the checklist to the server on reconnect after a save failure", async () => {
    // Initial load succeeds
    mockApiLoadHospitalBag.mockResolvedValue(CATEGORIES);
    mockLoadHospitalBag.mockResolvedValue(CATEGORIES);

    // First save attempt (after user toggle) fails because the device is offline
    mockApiSaveHospitalBag
      .mockRejectedValueOnce(new Error("no network"))
      // Retry on reconnect succeeds
      .mockResolvedValue(undefined);

    const HospitalBagScreen = require("../app/hospital-bag").default;
    let renderer: ReturnType<typeof create>;
    act(() => {
      renderer = create(React.createElement(HospitalBagScreen));
    });
    await flushAsync(1);

    // Trigger a checkbox toggle to invoke persist → apiSaveHospitalBag (fails)
    const root = renderer!.root;
    const itemToggles = root.findAll(
      (n: { type: unknown; props: { activeOpacity?: number } }) =>
        n.type === TouchableOpacity && n.props.activeOpacity === 0.7,
    );
    expect(itemToggles.length).toBeGreaterThan(0);

    await act(async () => {
      itemToggles[0].props.onPress();
      await new Promise<void>((r) => process.nextTick(r));
    });

    // First save attempt failed (offline); data written to AsyncStorage
    expect(mockApiSaveHospitalBag).toHaveBeenCalledTimes(1);
    expect(mockSaveHospitalBag).toHaveBeenCalledTimes(1);

    // Reconnect callback must have been registered
    expect(capturedReconnectCb).not.toBeNull();

    // Simulate connectivity restored
    await act(async () => {
      capturedReconnectCb!();
      await new Promise<void>((r) => process.nextTick(r));
    });

    // Retry call succeeded — server now has the latest checklist
    expect(mockApiSaveHospitalBag).toHaveBeenCalledTimes(2);
    expect(mockClearPendingSync).toHaveBeenCalledWith("hospital-bag");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BIRTH PLAN — retry on reconnect
// ─────────────────────────────────────────────────────────────────────────────

describe("Birth Plan — retry save when connectivity is restored", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedReconnectCb = null;
    setSignedIn();
    mockSaveBirthPlan.mockResolvedValue(undefined);
    mockGetBirthPlanCacheOwner.mockResolvedValue(null);
    mockClearBirthPlanCache.mockResolvedValue(undefined);
  });

  it("re-pushes birth plan answers to the server on reconnect after a save failure", async () => {
    // Initial load succeeds with empty answers
    mockApiLoadBirthPlan.mockResolvedValue({});
    mockLoadBirthPlan.mockResolvedValue({});

    // First save attempt (after user edits a field) fails because device is offline
    mockApiSaveBirthPlan
      .mockRejectedValueOnce(new Error("no network"))
      // Retry on reconnect succeeds
      .mockResolvedValue(undefined);

    const BirthPlanScreen = require("../app/birth-plan").default;
    let renderer: ReturnType<typeof create>;
    act(() => {
      renderer = create(React.createElement(BirthPlanScreen));
    });
    await flushAsync(1);

    // Trigger a boolean field toggle → setField → apiSaveBirthPlanAnswers (fails)
    const root = renderer!.root;
    const fieldToggles = root.findAll(
      (n: { type: unknown; props: { activeOpacity?: number } }) =>
        n.type === TouchableOpacity && n.props.activeOpacity === 0.7,
    );
    expect(fieldToggles.length).toBeGreaterThan(0);

    await act(async () => {
      fieldToggles[0].props.onPress();
      await new Promise<void>((r) => process.nextTick(r));
    });

    // First save attempt failed; data written locally as fallback
    expect(mockApiSaveBirthPlan).toHaveBeenCalledTimes(1);
    expect(mockSaveBirthPlan).toHaveBeenCalledWith(
      expect.objectContaining({ moveFreelyDuringLabour: true }),
    );

    // Reconnect callback must have been registered
    expect(capturedReconnectCb).not.toBeNull();

    // Simulate connectivity restored
    await act(async () => {
      capturedReconnectCb!();
      await new Promise<void>((r) => process.nextTick(r));
    });

    // Retry call succeeded — server now has the latest answers
    expect(mockApiSaveBirthPlan).toHaveBeenCalledTimes(2);
    expect(mockClearPendingSync).toHaveBeenCalledWith("birth-plan");
  });
});
