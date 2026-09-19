/**
 * A failed `Purchases.logIn` used to be swallowed by the catch that exists for
 * `logOut` throwing when already anonymous. The purchase then went through on
 * an anonymous RevenueCat customer, and `/billing/revenuecat/reconcile` — which
 * looks the customer up by Clerk user id — found nothing. Apple took the money
 * and the pass was never granted, with no trace of why.
 */
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Text } from "react-native";
import { act, create } from "react-test-renderer";

process.env.EXPO_PUBLIC_REVENUECAT_TEST_API_KEY = "test_key";
process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY = "ios_key";
process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY = "android_key";

const mockPurchases = {
  configure: jest.fn(),
  logIn: jest.fn(),
  logOut: jest.fn(),
  getCustomerInfo: jest.fn(),
  getOfferings: jest.fn(),
  purchasePackage: jest.fn(),
  restorePurchases: jest.fn(),
};

jest.mock("react-native-purchases", () => ({
  __esModule: true,
  default: mockPurchases,
}));

const mockUseAuth = jest.fn();
jest.mock("@clerk/expo", () => ({ useAuth: () => mockUseAuth() }));

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { executionEnvironment: "standalone" },
}));

type Subscription = {
  purchase: (pkg: unknown) => Promise<unknown>;
  restore: () => Promise<unknown>;
  identityError: string | null;
};

/** Renders the provider and hands the context value back to the test. */
async function mountSubscription(): Promise<{
  current: () => Subscription;
}> {
  const { SubscriptionProvider, useSubscription } = require("@/lib/revenuecat");

  let value: Subscription | null = null;
  function Probe() {
    value = useSubscription();
    return <Text>probe</Text>;
  }

  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  await act(async () => {
    create(
      <QueryClientProvider client={client}>
        <SubscriptionProvider>
          <Probe />
        </SubscriptionProvider>
      </QueryClientProvider>,
    );
  });

  return {
    current: () => {
      if (!value) throw new Error("subscription context not mounted");
      return value;
    },
  };
}

const PACKAGE = { identifier: "pass" };

describe("RevenueCat identification", () => {
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    // Deliberately no jest.resetModules(): a fresh module registry would hand
    // the hook a second copy of React while the renderer keeps the first, and
    // every hook call then reads a null dispatcher.
    mockUseAuth.mockReturnValue({ userId: "user_123" });
    mockPurchases.getCustomerInfo.mockResolvedValue({
      entitlements: { active: {} },
    });
    mockPurchases.getOfferings.mockResolvedValue({ current: null });
    mockPurchases.logIn.mockResolvedValue({});
    mockPurchases.logOut.mockResolvedValue({});
    mockPurchases.purchasePackage.mockResolvedValue({ customerInfo: {} });
    mockPurchases.restorePurchases.mockResolvedValue({});
    consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it("identifies the signed-in user at start-up", async () => {
    const ctx = await mountSubscription();

    expect(mockPurchases.logIn).toHaveBeenCalledWith("user_123");
    expect(ctx.current().identityError).toBeNull();
  });

  it("refuses to charge when identification keeps failing", async () => {
    mockPurchases.logIn.mockRejectedValue(new Error("network down"));

    const ctx = await mountSubscription();

    await expect(
      act(async () => {
        await ctx.current().purchase(PACKAGE);
      }),
    ).rejects.toThrow(/couldn't link this purchase/i);

    // The whole point: no charge was attempted.
    expect(mockPurchases.purchasePackage).not.toHaveBeenCalled();
    // And the failure was recorded rather than swallowed.
    expect(consoleError).toHaveBeenCalled();
  });

  it("retries identification at purchase time and proceeds when it recovers", async () => {
    mockPurchases.logIn.mockRejectedValueOnce(new Error("network down"));

    const ctx = await mountSubscription();
    expect(mockPurchases.purchasePackage).not.toHaveBeenCalled();

    await act(async () => {
      await ctx.current().purchase(PACKAGE);
    });

    expect(mockPurchases.logIn).toHaveBeenCalledTimes(2);
    expect(mockPurchases.purchasePackage).toHaveBeenCalledWith(PACKAGE);
  });

  it("refuses to restore onto an anonymous customer", async () => {
    mockPurchases.logIn.mockRejectedValue(new Error("network down"));

    const ctx = await mountSubscription();

    await expect(
      act(async () => {
        await ctx.current().restore();
      }),
    ).rejects.toThrow(/couldn't link this purchase/i);
    expect(mockPurchases.restorePurchases).not.toHaveBeenCalled();
  });

  it("still ignores logOut throwing when already anonymous", async () => {
    mockUseAuth.mockReturnValue({ userId: null });
    mockPurchases.logOut.mockRejectedValue(new Error("already anonymous"));

    const ctx = await mountSubscription();

    expect(mockPurchases.logIn).not.toHaveBeenCalled();
    expect(ctx.current().identityError).toBeNull();
    expect(consoleError).not.toHaveBeenCalled();
  });
});
