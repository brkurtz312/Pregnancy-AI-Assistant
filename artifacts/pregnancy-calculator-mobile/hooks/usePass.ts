import { useAppAuth as useAuth } from "@/hooks/useAppAuth";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetPassStatusQueryKey,
  useGetPassStatus,
  useReconcileRevenuecat,
  useRedeemCode,
} from "@workspace/api-client-react";

/**
 * Pass entitlement + free-usage state for the signed-in Clerk account.
 *
 * Pass status is keyed to the backend `users` row (by Clerk user id), so a
 * pass bought through the App Store shows up here once the server records it,
 * on every device the account signs in on. Anonymous (signed-out) users are
 * metered by IP server-side and have no pass status to read.
 */
export function usePass() {
  const { isSignedIn } = useAuth();
  const signedIn = !!isSignedIn;
  const queryClient = useQueryClient();

  const passQuery = useGetPassStatus({
    query: { enabled: signedIn, queryKey: getGetPassStatusQueryKey() },
  });
  const redeem = useRedeemCode();
  const reconcile = useReconcileRevenuecat();

  // Only trust entitlement data while signed in. When signed out, the query is
  // disabled but cached data from a previous session can linger — never surface
  // a stale "Unlimited" state for an anonymous (IP-metered) user.
  const hasPass = signedIn ? (passQuery.data?.hasPass ?? false) : false;
  const freeLimit = signedIn ? (passQuery.data?.freeLimit ?? 5) : 5;
  const freeUsed = signedIn ? (passQuery.data?.freeUsed ?? 0) : 0;

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: getGetPassStatusQueryKey() });

  /**
   * Redeem a developer access code to unlock the pass for the signed-in
   * account. Resolves on success and rejects (with the request error) when the
   * code is invalid. Entitlement is re-checked on success.
   */
  const redeemCode = async (code: string) => {
    await redeem.mutateAsync({ data: { code } });
    await refresh();
  };

  /**
   * Verify a completed RevenueCat in-app purchase server-side and refresh
   * entitlement. The server reads the active entitlement for this Clerk user
   * (RevenueCat app_user_id == Clerk id) and grants the pass — so an iOS
   * purchase unlocks the same account on web too.
   */
  const reconcileRevenueCat = async () => {
    await reconcile.mutateAsync();
    await refresh();
  };

  return {
    isSignedIn: signedIn,
    hasPass,
    freeUsed,
    freeLimit,
    freeRemaining: Math.max(0, freeLimit - freeUsed),
    isLoading: signedIn && passQuery.isLoading,
    redeemCode,
    isRedeeming: redeem.isPending,
    reconcileRevenueCat,
    isReconciling: reconcile.isPending,
    refresh,
  };
}
