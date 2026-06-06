import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { useAuth } from "@clerk/react";
import {
  useGetPassStatus,
  useCreateCheckout,
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
  /** Begin Stripe checkout for the pass and redirect. */
  startCheckout: () => void;
  /** True while a checkout session is being created. */
  isStartingCheckout: boolean;
  /**
   * Redeem a developer access code to unlock the pass. Resolves on success and
   * rejects (with the request error) on an invalid code.
   */
  redeemCode: (code: string) => Promise<void>;
  /** True while a code redemption is in flight. */
  isRedeeming: boolean;
  /** Re-fetch pass status and usage from the server. */
  refresh: () => void;
}

const PassContext = createContext<PassContextValue | null>(null);

export function PassProvider({ children }: { children: ReactNode }) {
  const { isSignedIn } = useAuth();
  const signedIn = !!isSignedIn;

  const passQuery = useGetPassStatus({
    query: { enabled: signedIn, queryKey: getGetPassStatusQueryKey() },
  });
  const checkout = useCreateCheckout();
  const confirm = useConfirmCheckout();
  const redeem = useRedeemCode();

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
      { onSettled: () => passQuery.refetch() },
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

  const hasPass = passQuery.data?.hasPass ?? false;
  const freeLimit = passQuery.data?.freeLimit ?? 5;
  const freeUsed = passQuery.data?.freeUsed ?? 0;

  const value: PassContextValue = {
    isSignedIn: signedIn,
    hasPass,
    freeUsed,
    freeLimit,
    freeRemaining: Math.max(0, freeLimit - freeUsed),
    isLoading: signedIn && passQuery.isLoading,
    startCheckout: () => {
      checkout.mutate(
        { data: { returnUrl: window.location.href } },
        {
          onSuccess: (res) => {
            window.location.href = res.url;
          },
        },
      );
    },
    isStartingCheckout: checkout.isPending,
    redeemCode: async (code: string) => {
      await redeem.mutateAsync({ data: { code } });
      await passQuery.refetch();
    },
    isRedeeming: redeem.isPending,
    refresh: () => {
      passQuery.refetch();
    },
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
