import { useAuth } from "@clerk/expo";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetPassStatusQueryKey,
  useCreateCheckout,
  useGetPassStatus,
} from "@workspace/api-client-react";
import * as WebBrowser from "expo-web-browser";

const webAppDomain = process.env.EXPO_PUBLIC_DOMAIN;

/**
 * Pass entitlement + free-usage state for the signed-in Clerk account.
 *
 * Pass status is keyed to the backend `users` row (by Clerk user id), so a
 * pass purchased anywhere — web Stripe checkout or a future mobile in-app
 * purchase — shows up here once the server records it. Anonymous (signed-out)
 * users are metered by IP server-side and have no pass status to read.
 */
export function usePass() {
  const { isSignedIn } = useAuth();
  const signedIn = !!isSignedIn;
  const queryClient = useQueryClient();

  const passQuery = useGetPassStatus({
    query: { enabled: signedIn, queryKey: getGetPassStatusQueryKey() },
  });
  const checkout = useCreateCheckout();

  // Only trust entitlement data while signed in. When signed out, the query is
  // disabled but cached data from a previous session can linger — never surface
  // a stale "Unlimited" state for an anonymous (IP-metered) user.
  const hasPass = signedIn ? (passQuery.data?.hasPass ?? false) : false;
  const freeLimit = signedIn ? (passQuery.data?.freeLimit ?? 5) : 5;
  const freeUsed = signedIn ? (passQuery.data?.freeUsed ?? 0) : 0;

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: getGetPassStatusQueryKey() });

  /**
   * Begin a Stripe checkout. The session is tied to this Clerk user
   * server-side, so completing payment in the browser grants the pass to the
   * same account the mobile app is signed in as. We re-check entitlement when
   * the browser is dismissed.
   */
  const startCheckout = () => {
    if (!webAppDomain || checkout.isPending) return;
    checkout.mutate(
      { data: { returnUrl: `https://${webAppDomain}/` } },
      {
        onSuccess: async (res) => {
          await WebBrowser.openBrowserAsync(res.url);
          refresh();
        },
      },
    );
  };

  return {
    isSignedIn: signedIn,
    hasPass,
    freeUsed,
    freeLimit,
    freeRemaining: Math.max(0, freeLimit - freeUsed),
    isLoading: signedIn && passQuery.isLoading,
    startCheckout,
    isStartingCheckout: checkout.isPending,
    refresh,
  };
}
