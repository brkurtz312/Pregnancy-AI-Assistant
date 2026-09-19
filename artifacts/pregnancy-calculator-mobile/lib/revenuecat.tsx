import { useAuth } from "@clerk/expo";
import { useMutation, useQuery } from "@tanstack/react-query";
import Constants from "expo-constants";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { Platform } from "react-native";
import Purchases, {
  type CustomerInfo,
  type PurchasesOfferings,
  type PurchasesPackage,
} from "react-native-purchases";

const REVENUECAT_TEST_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_TEST_API_KEY;
const REVENUECAT_IOS_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY;
const REVENUECAT_ANDROID_API_KEY =
  process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY;

// Entitlement lookup_key created by the seed script. The same identifier is
// used server-side when reconciling the purchase to the backend pass.
export const REVENUECAT_ENTITLEMENT_IDENTIFIER = "pass";

function getRevenueCatApiKey(): string {
  if (
    !REVENUECAT_TEST_API_KEY ||
    !REVENUECAT_IOS_API_KEY ||
    !REVENUECAT_ANDROID_API_KEY
  ) {
    throw new Error("RevenueCat public API keys not found");
  }

  // The test store is used in development and inside Expo Go (storeClient),
  // where native StoreKit/Play Billing is unavailable.
  if (
    __DEV__ ||
    Platform.OS === "web" ||
    Constants.executionEnvironment === "storeClient"
  ) {
    return REVENUECAT_TEST_API_KEY;
  }

  if (Platform.OS === "ios") return REVENUECAT_IOS_API_KEY;
  if (Platform.OS === "android") return REVENUECAT_ANDROID_API_KEY;
  return REVENUECAT_TEST_API_KEY;
}

let configured = false;

/**
 * Configure the RevenueCat SDK. Idempotent and safe to call on every mount.
 * No-ops on web, where purchases go through the existing Stripe web checkout.
 */
export function initializeRevenueCat(): void {
  if (configured || Platform.OS === "web") return;
  const apiKey = getRevenueCatApiKey();
  Purchases.configure({ apiKey });
  configured = true;
}

/**
 * Returns true when the user purchased via the test store, so the confirm
 * sheet can label the flow as a sandbox purchase (no real charge).
 */
export function isTestStore(): boolean {
  return (
    __DEV__ ||
    Platform.OS === "web" ||
    Constants.executionEnvironment === "storeClient"
  );
}

/**
 * Shown when a purchase cannot be attached to the signed-in account.
 *
 * Stopping is the kind thing to do here. `purchasePackage` on an unidentified
 * customer charges through Apple perfectly happily, and the receipt lands on an
 * anonymous RevenueCat customer that `/billing/revenuecat/reconcile` — which
 * looks the customer up by Clerk user id — cannot find. The buyer is charged
 * and granted nothing.
 */
export const PURCHASE_IDENTITY_ERROR =
  "We couldn't link this purchase to your account. Check your connection and try again.";

/**
 * How long identification may take before it is treated as failed.
 *
 * `Purchases.logIn` is a network call, and an unbounded one sits in front of
 * both purchase and restore. A hang there is worse than a failure: the
 * mutation never settles, the button stays disabled showing "Restoring…", and
 * nothing is ever logged or shown. A rejection at least reaches the user.
 */
const IDENTIFY_TIMEOUT_MS = 10_000;

/** Rejects rather than hanging, so a stalled call becomes a reportable one. */
function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`timed out after ${ms}ms`)),
      ms,
    );
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      },
    );
  });
}

/** Records an identification failure; never throws, whatever the payload. */
function logIdentityFailure(err: unknown): void {
  let detail: string;
  try {
    detail = JSON.stringify(err) ?? String(err);
  } catch {
    detail = String(err);
  }
  console.error(
    "RevenueCat identification failed:",
    err instanceof Error ? err.message : detail,
    detail,
  );
}

function useSubscriptionContext() {
  const { userId } = useAuth();
  const [ready, setReady] = useState(false);
  // Which Clerk user the RevenueCat SDK is currently logged in as, as far
  // as this app knows. null means anonymous — either signed out, or a
  // logIn that did not succeed.
  const [identifiedUserId, setIdentifiedUserId] = useState<string | null>(null);
  const [identityError, setIdentityError] = useState<string | null>(null);

  useEffect(() => {
    if (Platform.OS === "web") return;
    try {
      initializeRevenueCat();
      setReady(true);
    } catch {
      // Keep the app usable even if RevenueCat fails to configure; the purchase
      // UI stays hidden and free metering continues to work.
      setReady(false);
    }
  }, []);

  /**
   * Ties the RevenueCat customer to the Clerk account, so the server can verify
   * the entitlement by customer_id === Clerk user id.
   *
   * Returns true when the SDK is identified as `userId` afterwards. Signed out,
   * there is nothing to identify and it returns true as well — anonymous
   * browsing is a valid state, an anonymous *purchase* is what must not happen.
   */
  const identify = useCallback(async (): Promise<boolean> => {
    if (!userId) {
      try {
        await Purchases.logOut();
      } catch {
        // logOut throws when the customer is already anonymous, which is the
        // one failure here that means nothing. It is caught on its own so it
        // stops covering for a failed logIn, as it did when both shared a
        // catch: a purchase then attached to an anonymous customer and
        // reconcile found nothing, with no trace anywhere of why.
      }
      setIdentifiedUserId(null);
      setIdentityError(null);
      return true;
    }

    try {
      await withTimeout(Purchases.logIn(userId), IDENTIFY_TIMEOUT_MS);
      setIdentifiedUserId(userId);
      setIdentityError(null);
      return true;
    } catch (err) {
      logIdentityFailure(err);
      setIdentifiedUserId(null);
      setIdentityError(PURCHASE_IDENTITY_ERROR);
      return false;
    }
  }, [userId]);

  useEffect(() => {
    if (!ready) return;
    void identify();
  }, [ready, identify]);

  const customerInfoQuery = useQuery<CustomerInfo>({
    queryKey: ["revenuecat", "customer-info", userId ?? "anon"],
    queryFn: () => Purchases.getCustomerInfo(),
    enabled: ready,
    staleTime: 60 * 1000,
  });

  const offeringsQuery = useQuery<PurchasesOfferings>({
    queryKey: ["revenuecat", "offerings"],
    queryFn: () => Purchases.getOfferings(),
    enabled: ready,
    staleTime: 300 * 1000,
  });

  /**
   * Re-attempts identification immediately before money moves.
   *
   * The boot-time attempt can have failed on a flaky network minutes ago, and
   * the state it left behind is indistinguishable from signed-out. Retrying
   * here costs one call and turns most transient failures into a successful
   * purchase; a still-failing one stops before the charge.
   */
  const requireIdentity = useCallback(async () => {
    if (!userId || identifiedUserId === userId) return;
    if (!(await identify())) throw new Error(PURCHASE_IDENTITY_ERROR);
  }, [userId, identifiedUserId, identify]);

  const purchaseMutation = useMutation({
    mutationFn: async (pkg: PurchasesPackage) => {
      await requireIdentity();
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      return customerInfo;
    },
    onSuccess: () => customerInfoQuery.refetch(),
  });

  const restoreMutation = useMutation({
    mutationFn: async () => {
      // Restoring onto an anonymous customer re-grants nothing the server can
      // see, which looks to the user exactly like a lost purchase.
      await requireIdentity();
      return Purchases.restorePurchases();
    },
    onSuccess: () => customerInfoQuery.refetch(),
  });

  const isSubscribed =
    customerInfoQuery.data?.entitlements.active?.[
      REVENUECAT_ENTITLEMENT_IDENTIFIER
    ] !== undefined;

  // The lifetime pass is the single available package in the default offering.
  const passPackage =
    offeringsQuery.data?.current?.availablePackages?.[0] ?? null;

  return {
    available: ready,
    identityError,
    customerInfo: customerInfoQuery.data,
    offerings: offeringsQuery.data,
    passPackage,
    isSubscribed,
    isLoading: customerInfoQuery.isLoading || offeringsQuery.isLoading,
    purchase: purchaseMutation.mutateAsync,
    restore: restoreMutation.mutateAsync,
    isPurchasing: purchaseMutation.isPending,
    isRestoring: restoreMutation.isPending,
  };
}

type SubscriptionContextValue = ReturnType<typeof useSubscriptionContext>;
const Context = createContext<SubscriptionContextValue | null>(null);

export function SubscriptionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const value = useSubscriptionContext();
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useSubscription(): SubscriptionContextValue {
  const ctx = useContext(Context);
  if (!ctx) {
    throw new Error(
      "useSubscription must be used within a SubscriptionProvider",
    );
  }
  return ctx;
}

/**
 * Narrow an unknown purchase error to RevenueCat's user-cancelled signal so the
 * UI can stay silent when the shopper backs out of the native sheet.
 */
export function isUserCancelledError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "userCancelled" in err &&
    (err as { userCancelled?: boolean }).userCancelled === true
  );
}
