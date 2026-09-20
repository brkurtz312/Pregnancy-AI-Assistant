import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@clerk/react";
import {
  useGetPassStatus,
  useConfirmCheckout,
  useRedeemCode,
  getGetPassStatusQueryKey,
} from "@workspace/api-client-react";

interface PassContextValue {
  /** Whether a Clerk session is active. */
  isSignedIn: boolean;
  /** Whether the user owns the Full Pregnancy Pass. */
  hasPass: boolean;
  /** Free AI questions used in the current week (signed-in users only). */
  freeUsed: number;
  /** Free AI questions allowed per week. */
  freeLimit: number;
  /** Free AI questions remaining this week. */
  freeRemaining: number;
  /** True while the initial pass status is loading. */
  isLoading: boolean;
  /**
   * Redeem a developer access code to unlock the pass. Resolves on success and
   * rejects (with the request error) on an invalid code.
   */
  redeemCode: (code: string) => Promise<void>;
  /** True while a code redemption is in flight. */
  isRedeeming: boolean;
  /** Re-fetch pass status and usage from the server. */
  refresh: () => void;
  /** True immediately after a successful Stripe checkout return. Only an
   * in-flight purchase from before web selling was switched off can set it. */
  justPurchased: boolean;
  /** Clear the post-purchase celebration state. */
  dismissJustPurchased: () => void;
}

const PassContext = createContext<PassContextValue | null>(null);

export function PassProvider({ children }: { children: ReactNode }) {
  const { isSignedIn } = useAuth();
  const signedIn = !!isSignedIn;

  const passQuery = useGetPassStatus({
    query: { enabled: signedIn, queryKey: getGetPassStatusQueryKey() },
  });
  const confirm = useConfirmCheckout();
  const redeem = useRedeemCode();

  const [justPurchased, setJustPurchased] = useState(false);

  // Kept only for a checkout that was already in flight when web selling was
  // switched off. Nothing in this app sends anyone to Stripe any more, so once
  // the server routes are deleted this whole block goes with them
  // (docs/stripe-removal-plan.md, step 6).
  //
  // After returning from Stripe checkout (?checkout=success), confirm the
  // session for instant entitlement, then strip the params from the URL.
  const handledReturn = useRef(false);
  useEffect(() => {
    if (!signedIn || handledReturn.current) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") !== "success") return;

    handledReturn.current = true;
    const sessionId = params.get("session_id") ?? undefined;
    confirm.mutate(
      { data: { sessionId } },
      {
        onSuccess: () => setJustPurchased(true),
        onSettled: () => passQuery.refetch(),
      },
    );

    params.delete("checkout");
    params.delete("session_id");
    const query = params.toString();
    const newUrl =
      window.location.pathname +
      (query ? `?${query}` : "") +
      window.location.hash;
    window.history.replaceState({}, "", newUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn]);

  // Gate data extraction on signedIn.
  //
  // React Query keeps the previously fetched data in `passQuery.data` even
  // when the query is disabled (enabled: false). This means that during the
  // brief render window BEFORE SessionWatcher's useEffect fires
  // queryClient.clear(), a signed-out render could see User A's stale
  // entitlement (e.g. hasPass: true, freeUsed: 4). By returning safe defaults
  // whenever signedIn is false, we guarantee that consumers never paint stale
  // pass-status or AI quota values for a different user, regardless of what
  // the cache contains at that moment.
  const hasPass = signedIn ? (passQuery.data?.hasPass ?? false) : false;
  const freeLimit = signedIn ? (passQuery.data?.freeLimit ?? 5) : 5;
  const freeUsed = signedIn ? (passQuery.data?.freeUsed ?? 0) : 0;

  const value: PassContextValue = {
    isSignedIn: signedIn,
    hasPass,
    freeUsed,
    freeLimit,
    freeRemaining: Math.max(0, freeLimit - freeUsed),
    isLoading: signedIn && passQuery.isLoading,
    redeemCode: async (code: string) => {
      await redeem.mutateAsync({ data: { code } });
      await passQuery.refetch();
    },
    isRedeeming: redeem.isPending,
    refresh: () => {
      passQuery.refetch();
    },
    justPurchased,
    dismissJustPurchased: () => setJustPurchased(false),
  };

  return <PassContext.Provider value={value}>{children}</PassContext.Provider>;
}

export function usePass(): PassContextValue {
  const ctx = useContext(PassContext);
  if (!ctx) {
    throw new Error("usePass must be used within a PassProvider");
  }
  return ctx;
}
