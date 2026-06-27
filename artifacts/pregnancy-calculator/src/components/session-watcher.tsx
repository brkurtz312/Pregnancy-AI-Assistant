import { useEffect, useRef } from "react";
import { useSession } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Watches the Clerk session and keeps the React Query cache consistent:
 * - Sign-in  (null → session): invalidate all queries so they re-fetch with
 *   the new auth cookies and return authenticated data right away.
 * - Sign-out (session → null): clear the entire cache so stale authenticated
 *   data (profile, pass status, AI usage) does not linger for the next user.
 *
 * Must be rendered inside both <ClerkProvider> and <QueryClientProvider>.
 */
export function SessionWatcher() {
  const { session } = useSession();
  const queryClient = useQueryClient();
  const prevSessionRef = useRef(session);

  useEffect(() => {
    const wasSignedIn = prevSessionRef.current != null;
    const wasSignedOut = prevSessionRef.current == null;
    const isNowSignedIn = session != null;
    const isNowSignedOut = session == null;
    prevSessionRef.current = session;

    if (wasSignedOut && isNowSignedIn) {
      queryClient.invalidateQueries();
    }

    if (wasSignedIn && isNowSignedOut) {
      queryClient.clear();
    }
  }, [session, queryClient]);

  return null;
}
