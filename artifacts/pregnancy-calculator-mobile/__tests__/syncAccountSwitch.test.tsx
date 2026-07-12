/**
 * Mid-session account-switch tests
 *
 * Scenario: a user (A) is already signed in and has fully loaded their
 * hospital bag / birth plan data.  While the screen is still mounted, they
 * sign out and a different user (B) signs in — without a reinstall.
 *
 * The clearHospitalBagCache / clearBirthPlanCache guards exist specifically
 * for this path.  These tests confirm:
 *
 *   1. clearHospitalBagCache / clearBirthPlanCache IS called when the cache
 *      owner differs from the newly-signed-in user.
 *   2. apiLoadHospitalBag / apiLoadBirthPlanAnswers is called again with
 *      user B's token getter.
 *   3. User B's server data — not user A's — is displayed after the switch.
 */

import React from "react";
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

// ─── NetInfo mock ─────────────────────────────────────────────────────────────

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
  tryAcquireSyncLock: jest.fn(() => true),
  releaseSyncLock: jest.fn(),
}));

jest.mock("@/hooks/useNetReconnect", () => ({
  useNetReconnect: jest.fn(),
}));

jest.mock("@/components/SyncBanner", () => ({
  SyncBanner: () => null,
}));

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: "Light", Medium: "Medium", Heavy: "Heavy" },
}));

jest.mock("expo-print", () => ({
  printToFileAsync: jest.fn(async () => ({ uri: "file://test.pdf" })),
}));

jest.mock("@/components/AskCard", () => ({ AskCard: () => null }));

// ─── Sync API mock ────────────────────────────────────────────────────────────

jest.mock("@/lib/sync-api", () => ({
  apiLoadHospitalBag: jest.fn(),
  apiSaveHospitalBag: jest.fn(async () => {}),
  apiLoadBirthPlanAnswers: jest.fn(),
  apiSaveBirthPlanAnswers: jest.fn(async () => {}),
}));

// ─── Hospital Bag lib mock ────────────────────────────────────────────────────

jest.mock("@/lib/hospital-bag", () => ({
  loadHospitalBagChecklist: jest.fn(async () => []),
  saveHospitalBagChecklist: jest.fn(async () => {}),
  countChecked: jest.fn(() => ({ checked: 0, total: 3 })),
  buildHospitalBagHtml: jest.fn(() => "<html/>"),
  getHospitalBagCacheOwner: jest.fn(async () => null),
  setHospitalBagCacheOwner: jest.fn(async () => {}),
  clearHospitalBagCache: jest.fn(async () => {}),
}));

// ─── Birth Plan lib mock ──────────────────────────────────────────────────────

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
  loadBirthPlanAnswers: jest.fn(async () => ({})),
  saveBirthPlanAnswers: jest.fn(async () => {}),
  markBirthPlanGenerated: jest.fn(async () => {}),
  buildBirthPlanHtml: jest.fn(() => "<html/>"),
  BIRTH_PLAN_SECTIONS: [
    {
      id: "about",
      title: "About You",
      fields: [
        {
          id: "yourName",
          label: "Your name",
          type: "text",
          placeholder: "e.g. Jane Smith",
        },
      ],
    },
  ],
  getBirthPlanCacheOwner: jest.fn(async () => null),
  setBirthPlanCacheOwner: jest.fn(async () => {}),
  clearBirthPlanCache: jest.fn(async () => {}),
}));

// ─── Imports ──────────────────────────────────────────────────────────────────

import { useAuth, useUser } from "@clerk/expo";
import { apiLoadHospitalBag, apiLoadBirthPlanAnswers } from "@/lib/sync-api";
import {
  getHospitalBagCacheOwner,
  setHospitalBagCacheOwner,
  clearHospitalBagCache,
} from "@/lib/hospital-bag";
import {
  getBirthPlanCacheOwner,
  setBirthPlanCacheOwner,
  clearBirthPlanCache,
} from "@/lib/birth-plan";

const mockUseAuth = useAuth as jest.Mock;
const mockUseUser = useUser as jest.Mock;

const mockApiLoadHospitalBag = apiLoadHospitalBag as jest.Mock;
const mockGetHospitalBagCacheOwner = getHospitalBagCacheOwner as jest.Mock;
const mockSetHospitalBagCacheOwner = setHospitalBagCacheOwner as jest.Mock;
const mockClearHospitalBagCache = clearHospitalBagCache as jest.Mock;

const mockApiLoadBirthPlan = apiLoadBirthPlanAnswers as jest.Mock;
const mockGetBirthPlanCacheOwner = getBirthPlanCacheOwner as jest.Mock;
const mockSetBirthPlanCacheOwner = setBirthPlanCacheOwner as jest.Mock;
const mockClearBirthPlanCache = clearBirthPlanCache as jest.Mock;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeGetToken(token: string) {
  return jest.fn(async () => token);
}

function setSignedIn(id: string, token: string) {
  const getToken = makeGetToken(token);
  mockUseAuth.mockReturnValue({
    isSignedIn: true,
    getToken,
  });
  mockUseUser.mockReturnValue({ user: { id } });
  return getToken;
}

// ─── Test data ────────────────────────────────────────────────────────────────

const USER_A_ID = "user-alpha";
const USER_B_ID = "user-beta";

const USER_A_BAG = [
  {
    id: "clothes",
    title: "Clothes",
    items: [
      { id: "c-0", label: "User A warm socks", checked: false, custom: false },
    ],
  },
];

const USER_B_BAG = [
  {
    id: "paperwork",
    title: "Paperwork",
    items: [
      {
        id: "p-0",
        label: "User B insurance card",
        checked: true,
        custom: false,
      },
    ],
  },
];

const USER_A_BIRTH_PLAN = { yourName: "Alice Alpha" };
const USER_B_BIRTH_PLAN = { yourName: "Betty Beta" };

// ─────────────────────────────────────────────────────────────────────────────
// HOSPITAL BAG — account switch mid-session
// ─────────────────────────────────────────────────────────────────────────────

describe("Hospital Bag — account switch mid-session", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSetHospitalBagCacheOwner.mockResolvedValue(undefined);
    mockClearHospitalBagCache.mockResolvedValue(undefined);
  });

  it("calls clearHospitalBagCache when a different user signs in", async () => {
    jest.setTimeout(15000);
    // User A loads first
    setSignedIn(USER_A_ID, "tok-a");
    mockGetHospitalBagCacheOwner.mockResolvedValue(null); // fresh on first load
    mockApiLoadHospitalBag.mockResolvedValue(USER_A_BAG);

    const HospitalBagScreen = require("../app/hospital-bag").default;
    let renderer: ReturnType<typeof create>;
    act(() => {
      renderer = create(React.createElement(HospitalBagScreen));
    });
    await flushAsync();

    // After user A's load the cache owner is stamped as user A
    mockGetHospitalBagCacheOwner.mockResolvedValue(USER_A_ID);
    mockClearHospitalBagCache.mockClear();

    // User B signs in — switch the Clerk mocks and force a re-render
    setSignedIn(USER_B_ID, "tok-b");
    mockApiLoadHospitalBag.mockResolvedValue(USER_B_BAG);

    act(() => {
      renderer!.update(React.createElement(HospitalBagScreen));
    });
    await flushAsync();

    // The stale-cache guard must have fired
    expect(mockClearHospitalBagCache).toHaveBeenCalledTimes(1);
  });

  it("calls apiLoadHospitalBag again with user B's token after the switch", async () => {
    // User A loads
    setSignedIn(USER_A_ID, "tok-a");
    mockGetHospitalBagCacheOwner.mockResolvedValue(null);
    mockApiLoadHospitalBag.mockResolvedValue(USER_A_BAG);

    const HospitalBagScreen = require("../app/hospital-bag").default;
    let renderer: ReturnType<typeof create>;
    act(() => {
      renderer = create(React.createElement(HospitalBagScreen));
    });
    await flushAsync();

    // User B signs in — capture B's getToken so we can assert it was used
    mockGetHospitalBagCacheOwner.mockResolvedValue(USER_A_ID);
    const getTokenB = setSignedIn(USER_B_ID, "tok-b");
    mockApiLoadHospitalBag.mockResolvedValue(USER_B_BAG);

    act(() => {
      renderer!.update(React.createElement(HospitalBagScreen));
    });
    await flushAsync();

    // The reload after the switch must have used user B's token getter, not A's
    expect(mockApiLoadHospitalBag).toHaveBeenLastCalledWith(getTokenB);
  });

  it("displays user B's bag items after the account switch, not user A's", async () => {
    // User A loads
    setSignedIn(USER_A_ID, "tok-a");
    mockGetHospitalBagCacheOwner.mockResolvedValue(null);
    mockApiLoadHospitalBag.mockResolvedValue(USER_A_BAG);

    const HospitalBagScreen = require("../app/hospital-bag").default;
    let renderer: ReturnType<typeof create>;
    act(() => {
      renderer = create(React.createElement(HospitalBagScreen));
    });
    await flushAsync();

    // Confirm user A's data loaded
    expect(JSON.stringify(renderer!.toJSON())).toContain("User A warm socks");

    // User B signs in
    mockGetHospitalBagCacheOwner.mockResolvedValue(USER_A_ID);
    setSignedIn(USER_B_ID, "tok-b");
    mockApiLoadHospitalBag.mockResolvedValue(USER_B_BAG);

    act(() => {
      renderer!.update(React.createElement(HospitalBagScreen));
    });
    await flushAsync();

    const json = JSON.stringify(renderer!.toJSON());
    expect(json).toContain("User B insurance card");
    expect(json).not.toContain("User A warm socks");
  });

  it("stamps the cache owner with user B's id after the switch", async () => {
    // User A loads
    setSignedIn(USER_A_ID, "tok-a");
    mockGetHospitalBagCacheOwner.mockResolvedValue(null);
    mockApiLoadHospitalBag.mockResolvedValue(USER_A_BAG);

    const HospitalBagScreen = require("../app/hospital-bag").default;
    let renderer: ReturnType<typeof create>;
    act(() => {
      renderer = create(React.createElement(HospitalBagScreen));
    });
    await flushAsync();

    mockSetHospitalBagCacheOwner.mockClear();

    // User B signs in
    mockGetHospitalBagCacheOwner.mockResolvedValue(USER_A_ID);
    setSignedIn(USER_B_ID, "tok-b");
    mockApiLoadHospitalBag.mockResolvedValue(USER_B_BAG);

    act(() => {
      renderer!.update(React.createElement(HospitalBagScreen));
    });
    await flushAsync();

    expect(mockSetHospitalBagCacheOwner).toHaveBeenCalledWith(USER_B_ID);
  });

  it("does NOT clear the cache when the same user signs in again (no cross-user switch)", async () => {
    // User A loads
    setSignedIn(USER_A_ID, "tok-a");
    mockGetHospitalBagCacheOwner.mockResolvedValue(null);
    mockApiLoadHospitalBag.mockResolvedValue(USER_A_BAG);

    const HospitalBagScreen = require("../app/hospital-bag").default;
    let renderer: ReturnType<typeof create>;
    act(() => {
      renderer = create(React.createElement(HospitalBagScreen));
    });
    await flushAsync();

    // Cache owner is now user A
    mockGetHospitalBagCacheOwner.mockResolvedValue(USER_A_ID);
    mockClearHospitalBagCache.mockClear();

    // Same user A signs in again (e.g., token refresh triggered re-render)
    setSignedIn(USER_A_ID, "tok-a-refreshed");
    mockApiLoadHospitalBag.mockResolvedValue(USER_A_BAG);

    act(() => {
      renderer!.update(React.createElement(HospitalBagScreen));
    });
    await flushAsync();

    // No cross-user switch — cache must NOT be cleared
    expect(mockClearHospitalBagCache).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BIRTH PLAN — account switch mid-session
// ─────────────────────────────────────────────────────────────────────────────

describe("Birth Plan — account switch mid-session", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSetBirthPlanCacheOwner.mockResolvedValue(undefined);
    mockClearBirthPlanCache.mockResolvedValue(undefined);
  });

  it("calls clearBirthPlanCache when a different user signs in", async () => {
    jest.setTimeout(15000);
    // User A loads first
    setSignedIn(USER_A_ID, "tok-a");
    mockGetBirthPlanCacheOwner.mockResolvedValue(null);
    mockApiLoadBirthPlan.mockResolvedValue(USER_A_BIRTH_PLAN);

    const BirthPlanScreen = require("../app/birth-plan").default;
    let renderer: ReturnType<typeof create>;
    act(() => {
      renderer = create(React.createElement(BirthPlanScreen));
    });
    await flushAsync();

    // After user A's load the cache owner is stamped as user A
    mockGetBirthPlanCacheOwner.mockResolvedValue(USER_A_ID);
    mockClearBirthPlanCache.mockClear();

    // User B signs in
    setSignedIn(USER_B_ID, "tok-b");
    mockApiLoadBirthPlan.mockResolvedValue(USER_B_BIRTH_PLAN);

    act(() => {
      renderer!.update(React.createElement(BirthPlanScreen));
    });
    await flushAsync();

    expect(mockClearBirthPlanCache).toHaveBeenCalledTimes(1);
  });

  it("calls apiLoadBirthPlanAnswers again with user B's token after the switch", async () => {
    // User A loads
    setSignedIn(USER_A_ID, "tok-a");
    mockGetBirthPlanCacheOwner.mockResolvedValue(null);
    mockApiLoadBirthPlan.mockResolvedValue(USER_A_BIRTH_PLAN);

    const BirthPlanScreen = require("../app/birth-plan").default;
    let renderer: ReturnType<typeof create>;
    act(() => {
      renderer = create(React.createElement(BirthPlanScreen));
    });
    await flushAsync();

    // User B signs in — capture B's getToken so we can assert it was used
    mockGetBirthPlanCacheOwner.mockResolvedValue(USER_A_ID);
    const getTokenB = setSignedIn(USER_B_ID, "tok-b");
    mockApiLoadBirthPlan.mockResolvedValue(USER_B_BIRTH_PLAN);

    act(() => {
      renderer!.update(React.createElement(BirthPlanScreen));
    });
    await flushAsync();

    // The reload after the switch must have used user B's token getter, not A's
    expect(mockApiLoadBirthPlan).toHaveBeenLastCalledWith(getTokenB);
  });

  it("displays user B's birth plan data after the account switch, not user A's", async () => {
    // User A loads
    setSignedIn(USER_A_ID, "tok-a");
    mockGetBirthPlanCacheOwner.mockResolvedValue(null);
    mockApiLoadBirthPlan.mockResolvedValue(USER_A_BIRTH_PLAN);

    const BirthPlanScreen = require("../app/birth-plan").default;
    let renderer: ReturnType<typeof create>;
    act(() => {
      renderer = create(React.createElement(BirthPlanScreen));
    });
    await flushAsync();

    // User A's name should be in the input value
    expect(JSON.stringify(renderer!.toJSON())).toContain("Alice Alpha");

    // User B signs in
    mockGetBirthPlanCacheOwner.mockResolvedValue(USER_A_ID);
    setSignedIn(USER_B_ID, "tok-b");
    mockApiLoadBirthPlan.mockResolvedValue(USER_B_BIRTH_PLAN);

    act(() => {
      renderer!.update(React.createElement(BirthPlanScreen));
    });
    await flushAsync();

    const json = JSON.stringify(renderer!.toJSON());
    expect(json).toContain("Betty Beta");
    expect(json).not.toContain("Alice Alpha");
  });

  it("stamps the cache owner with user B's id after the switch", async () => {
    // User A loads
    setSignedIn(USER_A_ID, "tok-a");
    mockGetBirthPlanCacheOwner.mockResolvedValue(null);
    mockApiLoadBirthPlan.mockResolvedValue(USER_A_BIRTH_PLAN);

    const BirthPlanScreen = require("../app/birth-plan").default;
    let renderer: ReturnType<typeof create>;
    act(() => {
      renderer = create(React.createElement(BirthPlanScreen));
    });
    await flushAsync();

    mockSetBirthPlanCacheOwner.mockClear();

    // User B signs in
    mockGetBirthPlanCacheOwner.mockResolvedValue(USER_A_ID);
    setSignedIn(USER_B_ID, "tok-b");
    mockApiLoadBirthPlan.mockResolvedValue(USER_B_BIRTH_PLAN);

    act(() => {
      renderer!.update(React.createElement(BirthPlanScreen));
    });
    await flushAsync();

    expect(mockSetBirthPlanCacheOwner).toHaveBeenCalledWith(USER_B_ID);
  });

  it("does NOT clear the cache when the same user signs in again (no cross-user switch)", async () => {
    // User A loads
    setSignedIn(USER_A_ID, "tok-a");
    mockGetBirthPlanCacheOwner.mockResolvedValue(null);
    mockApiLoadBirthPlan.mockResolvedValue(USER_A_BIRTH_PLAN);

    const BirthPlanScreen = require("../app/birth-plan").default;
    let renderer: ReturnType<typeof create>;
    act(() => {
      renderer = create(React.createElement(BirthPlanScreen));
    });
    await flushAsync();

    // Cache owner is now user A
    mockGetBirthPlanCacheOwner.mockResolvedValue(USER_A_ID);
    mockClearBirthPlanCache.mockClear();

    // Same user A signs in again
    setSignedIn(USER_A_ID, "tok-a-refreshed");
    mockApiLoadBirthPlan.mockResolvedValue(USER_A_BIRTH_PLAN);

    act(() => {
      renderer!.update(React.createElement(BirthPlanScreen));
    });
    await flushAsync();

    expect(mockClearBirthPlanCache).not.toHaveBeenCalled();
  });
});
