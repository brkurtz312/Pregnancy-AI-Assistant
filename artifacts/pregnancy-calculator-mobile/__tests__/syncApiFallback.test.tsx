/**
 * Tests that confirm the sync API fallback paths prevent data loss.
 *
 * For each of the three tools (Journal, Hospital Bag, Birth Plan):
 *   1. When the sync API fails on LOAD → local AsyncStorage data is used instead
 *   2. When the sync API fails on SAVE → changes are written to AsyncStorage so
 *      they survive an app restart (regression fix in hospital-bag and birth-plan)
 *
 * "Unsaved changes" safety: the save-fallback tests specifically verify that a
 * user interaction (toggle, field change) is never silently dropped when the
 * network is down.
 */

import React from "react";
import { TouchableOpacity } from "react-native";
import { act, create } from "react-test-renderer";

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

// ─── Shared Clerk mock ────────────────────────────────────────────────────────

jest.mock("@clerk/expo", () => ({
  useAuth: jest.fn(),
  useUser: jest.fn(),
}));

// ─── Shared expo-router mock ──────────────────────────────────────────────────

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

// ─── NetInfo mock (no-op listener, always online) ─────────────────────────────

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

// ─── Sync queue + reconnect hook mocks ────────────────────────────────────────

jest.mock("@/lib/sync-queue", () => ({
  markPendingSync: jest.fn(async () => {}),
  clearPendingSync: jest.fn(async () => {}),
  hasPendingSync: jest.fn(async () => false),
}));

jest.mock("@/hooks/useNetReconnect", () => ({
  useNetReconnect: jest.fn(),
}));

jest.mock("@/components/SyncBanner", () => ({
  SyncBanner: () => null,
}));

import { useAuth, useUser } from "@clerk/expo";

const mockUseAuth = useAuth as jest.Mock;
const mockUseUser = useUser as jest.Mock;

function setSignedIn(id = "user-123") {
  mockUseAuth.mockReturnValue({
    isSignedIn: true,
    getToken: jest.fn(async () => "tok"),
  });
  mockUseUser.mockReturnValue({ user: { id } });
}

// ─── Test data ────────────────────────────────────────────────────────────────

const LOCAL_ENTRY = {
  id: "local-abc",
  text: "A local journal entry",
  mood: undefined,
  gestationalWeeks: 20,
  gestationalDays: 0,
  postpartumDays: undefined,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  media: [],
};

const SERVER_ENTRY = {
  id: "00000000-0000-4000-8000-000000000001",
  text: "A server journal entry",
  mood: undefined,
  gestationalWeeks: 20,
  gestationalDays: 0,
  postpartumDays: undefined,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  media: [],
};

const LOCAL_CATEGORIES = [
  {
    id: "cat1",
    title: "For Mum",
    items: [{ id: "item1", label: "Pyjamas", checked: false }],
  },
];

const SERVER_CATEGORIES = [
  {
    id: "cat1",
    title: "For Mum",
    items: [{ id: "item1", label: "Pyjamas", checked: true }],
  },
];

const LOCAL_ANSWERS = { painRelief: "epidural" };
const SERVER_ANSWERS = { painRelief: "natural" };

// ─────────────────────────────────────────────────────────────────────────────
// JOURNAL
// ─────────────────────────────────────────────────────────────────────────────

jest.mock("expo-image", () => ({ Image: "Image" }));
jest.mock("@/lib/journal-pdf", () => ({ exportJournalPdf: jest.fn() }));
jest.mock("@/hooks/usePass", () => ({ usePass: () => ({ hasPass: false }) }));
jest.mock("@/components/PassGate", () => ({ PassGate: () => null }));
jest.mock("@/constants/free-limits", () => ({
  FREE_JOURNAL_ENTRY_LIMIT: 5,
}));

jest.mock("@/lib/journal", () => ({
  loadEntries: jest.fn(),
  cacheEntries: jest.fn(async () => {}),
  getAgeLabel: jest.fn(() => ""),
  MOOD_OPTIONS: [],
  getJournalCacheOwner: jest.fn(async () => null),
  setJournalCacheOwner: jest.fn(async () => {}),
  clearJournalCache: jest.fn(async () => {}),
}));

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

import {
  apiLoadJournalEntries,
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

const mockApiLoadJournal = apiLoadJournalEntries as jest.Mock;
const mockLoadEntries = loadEntries as jest.Mock;
const mockCacheEntries = cacheEntries as jest.Mock;
const mockGetJournalCacheOwner = getJournalCacheOwner as jest.Mock;
const mockClearJournalCache = clearJournalCache as jest.Mock;

describe("Journal — sync API fallback", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setSignedIn();
    mockCacheEntries.mockResolvedValue(undefined);
    mockGetJournalCacheOwner.mockResolvedValue(null);
    mockClearJournalCache.mockResolvedValue(undefined);
  });

  it("loads entries from AsyncStorage when the API call fails", async () => {
    // Generous timeout: the first require() in this describe block triggers
    // React Compiler + Jest module transform, which takes ~4-5 s in CI.
    jest.setTimeout(15000);
    mockApiLoadJournal.mockRejectedValue(new Error("network error"));
    mockLoadEntries.mockResolvedValue([LOCAL_ENTRY]);

    const JournalScreen = require("../app/journal").default;
    let renderer: ReturnType<typeof create>;
    act(() => {
      renderer = create(React.createElement(JournalScreen));
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(mockLoadEntries).toHaveBeenCalled();
    const json = JSON.stringify(renderer!.toJSON());
    expect(json).toContain("A local journal entry");
  });

  it("does not show stale local entries when the API succeeds", async () => {
    mockApiLoadJournal.mockResolvedValue([SERVER_ENTRY]);
    mockLoadEntries.mockResolvedValue([LOCAL_ENTRY]);

    const JournalScreen = require("../app/journal").default;
    let renderer: ReturnType<typeof create>;
    act(() => {
      renderer = create(React.createElement(JournalScreen));
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    const json = JSON.stringify(renderer!.toJSON());
    expect(json).toContain("A server journal entry");
    expect(json).not.toContain("A local journal entry");
  });

  it("still shows entries for a signed-out user", async () => {
    mockUseAuth.mockReturnValue({ isSignedIn: false, getToken: jest.fn() });
    mockUseUser.mockReturnValue({ user: null });
    mockLoadEntries.mockResolvedValue([LOCAL_ENTRY]);

    const JournalScreen = require("../app/journal").default;
    let renderer: ReturnType<typeof create>;
    act(() => {
      renderer = create(React.createElement(JournalScreen));
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(mockLoadEntries).toHaveBeenCalled();
    expect(mockApiLoadJournal).not.toHaveBeenCalled();
    const json = JSON.stringify(renderer!.toJSON());
    expect(json).toContain("A local journal entry");
  });

  it("clears stale local entries when a different user signs in", async () => {
    // Owner stamped from a previous session as "user-A"; now "user-B" signs in.
    mockGetJournalCacheOwner.mockResolvedValue("user-A");
    setSignedIn("user-B");
    // Server has no entries for user-B yet (fresh account).
    mockApiLoadJournal.mockResolvedValue([]);
    // After clearJournalCache the local store is empty (models storage state).
    mockLoadEntries.mockResolvedValue([]);

    const JournalScreen = require("../app/journal").default;
    let renderer: ReturnType<typeof create>;
    act(() => {
      renderer = create(React.createElement(JournalScreen));
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    // The stale cache should have been cleared.
    expect(mockClearJournalCache).toHaveBeenCalled();
    // User B should see an empty journal, not user A's entries.
    const json = JSON.stringify(renderer!.toJSON());
    expect(json).not.toContain("A local journal entry");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// HOSPITAL BAG
// ─────────────────────────────────────────────────────────────────────────────

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

import {
  loadHospitalBagChecklist,
  saveHospitalBagChecklist,
  getHospitalBagCacheOwner,
  clearHospitalBagCache,
} from "@/lib/hospital-bag";
import {
  apiLoadHospitalBag as _apiLoadHospitalBag,
  apiSaveHospitalBag as _apiSaveHospitalBag,
} from "@/lib/sync-api";

const mockApiLoadHospitalBag = apiLoadHospitalBag as jest.Mock;
const mockApiSaveHospitalBag = apiSaveHospitalBag as jest.Mock;
const mockLoadHospitalBag = loadHospitalBagChecklist as jest.Mock;
const mockSaveHospitalBag = saveHospitalBagChecklist as jest.Mock;
const mockGetHospitalBagCacheOwner = getHospitalBagCacheOwner as jest.Mock;
const mockClearHospitalBagCache = clearHospitalBagCache as jest.Mock;

describe("Hospital Bag — sync API fallback", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setSignedIn();
    mockSaveHospitalBag.mockResolvedValue(undefined);
    mockGetHospitalBagCacheOwner.mockResolvedValue(null);
    mockClearHospitalBagCache.mockResolvedValue(undefined);
  });

  it("loads from AsyncStorage when the API call fails on load", async () => {
    mockApiLoadHospitalBag.mockRejectedValue(new Error("network error"));
    mockLoadHospitalBag.mockResolvedValue(LOCAL_CATEGORIES);

    const HospitalBagScreen = require("../app/hospital-bag").default;
    let renderer: ReturnType<typeof create>;
    act(() => {
      renderer = create(React.createElement(HospitalBagScreen));
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(mockLoadHospitalBag).toHaveBeenCalled();
    const json = JSON.stringify(renderer!.toJSON());
    expect(json).toContain("Pyjamas");
  });

  it("uses server categories when the API succeeds", async () => {
    mockApiLoadHospitalBag.mockResolvedValue(SERVER_CATEGORIES);
    mockLoadHospitalBag.mockResolvedValue(LOCAL_CATEGORIES);

    const HospitalBagScreen = require("../app/hospital-bag").default;
    let renderer: ReturnType<typeof create>;
    act(() => {
      renderer = create(React.createElement(HospitalBagScreen));
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(mockApiLoadHospitalBag).toHaveBeenCalled();
    const json = JSON.stringify(renderer!.toJSON());
    expect(json).toContain("Pyjamas");
  });

  it("writes to AsyncStorage when the API save fails — prevents data loss on restart", async () => {
    mockApiLoadHospitalBag.mockResolvedValue(SERVER_CATEGORIES);
    mockLoadHospitalBag.mockResolvedValue(SERVER_CATEGORIES);
    mockApiSaveHospitalBag.mockRejectedValue(new Error("network error"));

    const HospitalBagScreen = require("../app/hospital-bag").default;
    let renderer: ReturnType<typeof create>;
    act(() => {
      renderer = create(React.createElement(HospitalBagScreen));
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    const root = renderer!.root;
    const itemToggles = root.findAll(
      (n: { type: unknown; props: { activeOpacity?: number } }) =>
        n.type === TouchableOpacity && n.props.activeOpacity === 0.7,
    );
    expect(itemToggles.length).toBeGreaterThan(0);

    await act(async () => {
      itemToggles[0].props.onPress();
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(mockApiSaveHospitalBag).toHaveBeenCalled();
    expect(mockSaveHospitalBag).toHaveBeenCalled();
  });

  it("does not write to AsyncStorage when the API save succeeds", async () => {
    mockApiLoadHospitalBag.mockResolvedValue(SERVER_CATEGORIES);
    mockLoadHospitalBag.mockResolvedValue(SERVER_CATEGORIES);
    mockApiSaveHospitalBag.mockResolvedValue(undefined);

    const HospitalBagScreen = require("../app/hospital-bag").default;
    let renderer: ReturnType<typeof create>;
    act(() => {
      renderer = create(React.createElement(HospitalBagScreen));
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    const root = renderer!.root;
    const itemToggles = root.findAll(
      (n: { type: unknown; props: { activeOpacity?: number } }) =>
        n.type === TouchableOpacity && n.props.activeOpacity === 0.7,
    );
    expect(itemToggles.length).toBeGreaterThan(0);

    await act(async () => {
      itemToggles[0].props.onPress();
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(mockApiSaveHospitalBag).toHaveBeenCalled();
    expect(mockSaveHospitalBag).not.toHaveBeenCalled();
  });

  it("still loads checklist for a signed-out user", async () => {
    mockUseAuth.mockReturnValue({ isSignedIn: false, getToken: jest.fn() });
    mockUseUser.mockReturnValue({ user: null });
    mockLoadHospitalBag.mockResolvedValue(LOCAL_CATEGORIES);

    const HospitalBagScreen = require("../app/hospital-bag").default;
    act(() => {
      create(React.createElement(HospitalBagScreen));
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(mockLoadHospitalBag).toHaveBeenCalled();
    expect(mockApiLoadHospitalBag).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BIRTH PLAN
// ─────────────────────────────────────────────────────────────────────────────

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

import {
  loadBirthPlanAnswers,
  saveBirthPlanAnswers,
  getBirthPlanCacheOwner,
  clearBirthPlanCache,
} from "@/lib/birth-plan";
import {
  apiLoadBirthPlanAnswers as _apiLoadBirthPlanAnswers,
  apiSaveBirthPlanAnswers as _apiSaveBirthPlanAnswers,
} from "@/lib/sync-api";

const mockApiLoadBirthPlan = apiLoadBirthPlanAnswers as jest.Mock;
const mockApiSaveBirthPlan = apiSaveBirthPlanAnswers as jest.Mock;
const mockLoadBirthPlan = loadBirthPlanAnswers as jest.Mock;
const mockSaveBirthPlan = saveBirthPlanAnswers as jest.Mock;
const mockGetBirthPlanCacheOwner = getBirthPlanCacheOwner as jest.Mock;
const mockClearBirthPlanCache = clearBirthPlanCache as jest.Mock;

describe("Birth Plan — sync API fallback", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setSignedIn();
    mockSaveBirthPlan.mockResolvedValue(undefined);
    mockGetBirthPlanCacheOwner.mockResolvedValue(null);
    mockClearBirthPlanCache.mockResolvedValue(undefined);
  });

  it("loads answers from AsyncStorage when the API call fails on load", async () => {
    mockApiLoadBirthPlan.mockRejectedValue(new Error("network error"));
    mockLoadBirthPlan.mockResolvedValue(LOCAL_ANSWERS);

    const BirthPlanScreen = require("../app/birth-plan").default;
    act(() => {
      create(React.createElement(BirthPlanScreen));
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(mockLoadBirthPlan).toHaveBeenCalled();
  });

  it("uses server answers when the API succeeds", async () => {
    mockApiLoadBirthPlan.mockResolvedValue(SERVER_ANSWERS);
    mockLoadBirthPlan.mockResolvedValue(LOCAL_ANSWERS);

    const BirthPlanScreen = require("../app/birth-plan").default;
    act(() => {
      create(React.createElement(BirthPlanScreen));
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(mockApiLoadBirthPlan).toHaveBeenCalled();
    expect(mockLoadBirthPlan).not.toHaveBeenCalled();
  });

  it("writes to AsyncStorage when the API save fails — prevents data loss on restart", async () => {
    mockApiLoadBirthPlan.mockResolvedValue({});
    mockLoadBirthPlan.mockResolvedValue({});
    mockApiSaveBirthPlan.mockRejectedValue(new Error("network error"));

    const BirthPlanScreen = require("../app/birth-plan").default;
    let renderer: ReturnType<typeof create>;
    act(() => {
      renderer = create(React.createElement(BirthPlanScreen));
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    const root = renderer!.root;
    const fieldToggles = root.findAll(
      (n: { type: unknown; props: { activeOpacity?: number } }) =>
        n.type === TouchableOpacity && n.props.activeOpacity === 0.7,
    );
    expect(fieldToggles.length).toBeGreaterThan(0);

    await act(async () => {
      fieldToggles[0].props.onPress();
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(mockApiSaveBirthPlan).toHaveBeenCalled();
    expect(mockSaveBirthPlan).toHaveBeenCalledWith(
      expect.objectContaining({ moveFreelyDuringLabour: true }),
    );
  });

  it("does not write to AsyncStorage when the API save succeeds", async () => {
    mockApiLoadBirthPlan.mockResolvedValue({});
    mockLoadBirthPlan.mockResolvedValue({});
    mockApiSaveBirthPlan.mockResolvedValue(undefined);

    const BirthPlanScreen = require("../app/birth-plan").default;
    let renderer: ReturnType<typeof create>;
    act(() => {
      renderer = create(React.createElement(BirthPlanScreen));
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    const root = renderer!.root;
    const fieldToggles = root.findAll(
      (n: { type: unknown; props: { activeOpacity?: number } }) =>
        n.type === TouchableOpacity && n.props.activeOpacity === 0.7,
    );
    expect(fieldToggles.length).toBeGreaterThan(0);

    await act(async () => {
      fieldToggles[0].props.onPress();
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(mockApiSaveBirthPlan).toHaveBeenCalled();
    expect(mockSaveBirthPlan).not.toHaveBeenCalled();
  });

  it("still loads answers for a signed-out user", async () => {
    mockUseAuth.mockReturnValue({ isSignedIn: false, getToken: jest.fn() });
    mockUseUser.mockReturnValue({ user: null });
    mockLoadBirthPlan.mockResolvedValue(LOCAL_ANSWERS);

    const BirthPlanScreen = require("../app/birth-plan").default;
    act(() => {
      create(React.createElement(BirthPlanScreen));
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(mockLoadBirthPlan).toHaveBeenCalled();
    expect(mockApiLoadBirthPlan).not.toHaveBeenCalled();
  });
});
