import React from "react";
import { Platform, Text, TouchableOpacity } from "react-native";
import { act, create, type ReactTestInstance } from "react-test-renderer";

jest.mock("react-native-reanimated", () =>
  require("react-native-reanimated/mock"),
);

jest.mock("@clerk/expo", () => ({
  useAuth: jest.fn(),
  useUser: jest.fn(),
}));

jest.mock("expo-router", () => ({
  useRouter: jest.fn(),
}));

jest.mock("@expo/vector-icons", () => ({
  Ionicons: "Ionicons",
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock("@workspace/api-client-react", () => ({
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));

jest.mock("@/hooks/useColors", () => ({
  useColors: () => ({
    background: "#fff",
    card: "#fff",
    border: "#eee",
    primary: "#ff69b4",
    foreground: "#000",
    mutedForeground: "#666",
    muted: "#f5f5f5",
    accent: "#f0f0f0",
    destructive: "#ef4444",
  }),
}));

const mockReconcileRevenueCat = jest.fn().mockResolvedValue(undefined);
const mockStartCheckout = jest.fn();
const mockRedeemCode = jest.fn();
const mockRefresh = jest.fn();

jest.mock("@/hooks/usePass", () => ({
  usePass: jest.fn(),
}));

const mockPurchase = jest.fn();
const mockRestore = jest.fn();

jest.mock("@/modules/WatchConnectivity", () => ({
  __esModule: true,
  default: { signOut: jest.fn(async () => {}) },
}));
const mockWatchSignOut = (
  jest.requireMock("@/modules/WatchConnectivity") as {
    default: { signOut: jest.Mock };
  }
).default.signOut;

jest.mock("@/lib/appointment-reminders", () => ({
  cancelAllAppointmentReminders: jest.fn(async () => {}),
}));

jest.mock("@/lib/revenuecat", () => ({
  useSubscription: jest.fn(),
  isTestStore: jest.fn(() => true),
  isUserCancelledError: jest.fn((err: unknown) => {
    return (
      typeof err === "object" &&
      err !== null &&
      "userCancelled" in err &&
      (err as { userCancelled?: boolean }).userCancelled === true
    );
  }),
}));

import { useAuth, useUser } from "@clerk/expo";
import { useRouter } from "expo-router";
import { usePass } from "@/hooks/usePass";
import { useSubscription } from "@/lib/revenuecat";

import { AccountSheet } from "../components/AccountSheet";

const mockUseAuth = useAuth as jest.Mock;
const mockUseUser = useUser as jest.Mock;
const mockUseRouter = useRouter as jest.Mock;
const mockUsePass = usePass as jest.Mock;
const mockUseSubscription = useSubscription as jest.Mock;

function makePassMock(overrides: Partial<ReturnType<typeof usePass>> = {}) {
  return {
    isSignedIn: true,
    hasPass: false,
    freeUsed: 2,
    freeLimit: 5,
    freeRemaining: 3,
    isLoading: false,
    startCheckout: mockStartCheckout,
    isStartingCheckout: false,
    redeemCode: mockRedeemCode,
    isRedeeming: false,
    reconcileRevenueCat: mockReconcileRevenueCat,
    isReconciling: false,
    refresh: mockRefresh,
    ...overrides,
  };
}

function makeSubscriptionMock(
  overrides: Partial<ReturnType<typeof useSubscription>> = {},
) {
  return {
    available: true,
    customerInfo: undefined,
    offerings: undefined,
    passPackage: {
      identifier: "$rc_lifetime",
      product: { priceString: "$19.99", identifier: "full_pregnancy_pass" },
    } as unknown as ReturnType<typeof useSubscription>["passPackage"],
    isSubscribed: false,
    isLoading: false,
    purchase: mockPurchase,
    restore: mockRestore,
    isPurchasing: false,
    isRestoring: false,
    ...overrides,
  };
}

const mockOnClose = jest.fn();

function renderSheet(visible = true) {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      React.createElement(AccountSheet, { visible, onClose: mockOnClose }),
    );
  });
  return renderer;
}

/** Flatten a React children value (string | array | nested) into a plain string. */
function flatText(children: unknown): string {
  if (children == null) return "";
  if (typeof children === "string" || typeof children === "number")
    return String(children);
  if (Array.isArray(children)) return children.map(flatText).join("");
  return "";
}

/**
 * Walk upward from a Text node until we hit a TouchableOpacity ancestor.
 * Returns undefined if none found within the tree.
 */
function touchableParent(
  node: ReactTestInstance,
): ReactTestInstance | undefined {
  let cur: ReactTestInstance | null = node.parent;
  while (cur) {
    if (cur.type === TouchableOpacity) return cur;
    cur = cur.parent;
  }
  return undefined;
}

/**
 * Find the first TouchableOpacity whose rendered text contains the given
 * substring (handles children that are arrays or nested nodes).
 */
function findBtn(
  root: ReactTestInstance,
  label: string,
): ReactTestInstance | undefined {
  const textNodes = root.findAllByType(Text);
  for (const t of textNodes) {
    if (flatText(t.props.children).includes(label)) {
      const btn = touchableParent(t);
      if (btn) return btn;
    }
  }
  return undefined;
}

describe("AccountSheet — RevenueCat in-app purchase (native)", () => {
  const originalOS = Platform.OS;

  beforeAll(() => {
    Object.defineProperty(Platform, "OS", { value: "ios", writable: true });
  });

  afterAll(() => {
    Object.defineProperty(Platform, "OS", {
      value: originalOS,
      writable: true,
    });
  });

  beforeEach(() => {
    mockUseAuth.mockReturnValue({ isSignedIn: true, signOut: jest.fn() });
    mockUseUser.mockReturnValue({
      user: { primaryEmailAddress: { emailAddress: "test@example.com" } },
    });
    mockUseRouter.mockReturnValue({ push: jest.fn() });
    mockUsePass.mockReturnValue(makePassMock());
    mockUseSubscription.mockReturnValue(makeSubscriptionMock());
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("shows the Get the Pass button with live price from RevenueCat", async () => {
    const renderer = renderSheet();
    await act(async () => {});

    const root = renderer.root;
    const btn = findBtn(root, "Get the Pass");
    expect(btn).toBeDefined();

    const btnText = flatText(
      btn!.findAllByType(Text).map((t) => t.props.children),
    );
    expect(btnText).toContain("$19.99");
  });

  it("shows the pass-active card (no purchase button) when the user already holds a pass", async () => {
    mockUsePass.mockReturnValue(makePassMock({ hasPass: true }));
    const renderer = renderSheet();
    await act(async () => {});

    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain("Full Pregnancy Pass active");
    expect(findBtn(renderer.root, "Get the Pass")).toBeUndefined();
  });

  it("shows the confirm dialog after tapping Get the Pass", async () => {
    const renderer = renderSheet();
    await act(async () => {});

    const btn = findBtn(renderer.root, "Get the Pass");
    expect(btn).toBeDefined();

    await act(async () => {
      btn!.props.onPress();
    });

    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain("Confirm your purchase");
    expect(json).toContain("sandbox purchase");
  });

  it("calls subscription.purchase then reconcileRevenueCat when the user confirms", async () => {
    mockPurchase.mockResolvedValue({});

    const renderer = renderSheet();
    await act(async () => {});

    await act(async () => {
      findBtn(renderer.root, "Get the Pass")!.props.onPress();
    });

    const confirmBtn = findBtn(renderer.root, "Confirm");
    expect(confirmBtn).toBeDefined();

    await act(async () => {
      await confirmBtn!.props.onPress();
    });

    expect(mockPurchase).toHaveBeenCalledWith(
      expect.objectContaining({ identifier: "$rc_lifetime" }),
    );
    expect(mockReconcileRevenueCat).toHaveBeenCalled();
  });

  it("silently dismisses the confirm dialog (no reconcile) when the user cancels the native sheet", async () => {
    mockPurchase.mockRejectedValue({ userCancelled: true });

    const renderer = renderSheet();
    await act(async () => {});

    await act(async () => {
      findBtn(renderer.root, "Get the Pass")!.props.onPress();
    });

    const confirmBtn = findBtn(renderer.root, "Confirm");
    await act(async () => {
      await confirmBtn!.props.onPress();
    });

    expect(mockPurchase).toHaveBeenCalled();
    expect(mockReconcileRevenueCat).not.toHaveBeenCalled();
  });

  it("calls subscription.restore then reconcileRevenueCat when the user restores", async () => {
    mockRestore.mockResolvedValue({});

    const renderer = renderSheet();
    await act(async () => {});

    const restoreBtn = findBtn(renderer.root, "Restore purchases");
    expect(restoreBtn).toBeDefined();

    await act(async () => {
      await restoreBtn!.props.onPress();
    });

    expect(mockRestore).toHaveBeenCalled();
    expect(mockReconcileRevenueCat).toHaveBeenCalled();
  });

  it("shows a purchase error for a non-cancel store failure", async () => {
    mockPurchase.mockRejectedValue(new Error("Store error"));

    const renderer = renderSheet();
    await act(async () => {});

    await act(async () => {
      findBtn(renderer.root, "Get the Pass")!.props.onPress();
    });
    await act(async () => {
      await findBtn(renderer.root, "Confirm")!.props.onPress();
    });

    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain("Purchase couldn't be completed");
  });

  it("shows the remaining free question count on the status card", async () => {
    const renderer = renderSheet();
    await act(async () => {});

    const allText = renderer.root
      .findAllByType(Text)
      .map((t) => flatText(t.props.children))
      .join(" ");

    expect(allText).toContain("3");
    expect(allText).toContain("5");
    expect(allText).toContain("free AI questions left this week");
  });

  it("calls WatchConnectivity.signOut exactly once when Sign Out is pressed", async () => {
    const mockClerkSignOut = jest.fn(async () => {});
    mockUseAuth.mockReturnValue({
      isSignedIn: true,
      signOut: mockClerkSignOut,
    });

    const renderer = renderSheet();
    await act(async () => {});

    const signOutBtn = findBtn(renderer.root, "Sign Out");
    expect(signOutBtn).toBeDefined();

    await act(async () => {
      await signOutBtn!.props.onPress();
    });

    expect(mockClerkSignOut).toHaveBeenCalledTimes(1);
    expect(mockWatchSignOut).toHaveBeenCalledTimes(1);
  });

  it("does NOT call WatchConnectivity.signOut when Clerk signOut fails", async () => {
    const mockClerkSignOut = jest.fn(async () => {
      throw new Error("network");
    });
    mockUseAuth.mockReturnValue({
      isSignedIn: true,
      signOut: mockClerkSignOut,
    });

    const renderer = renderSheet();
    await act(async () => {});

    await act(async () => {
      await findBtn(renderer.root, "Sign Out")!.props.onPress();
    });

    expect(mockClerkSignOut).toHaveBeenCalledTimes(1);
    expect(mockWatchSignOut).not.toHaveBeenCalled();
  });
});
