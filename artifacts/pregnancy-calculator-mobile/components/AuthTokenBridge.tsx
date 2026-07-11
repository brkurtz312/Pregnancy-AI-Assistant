import { useSession } from "@clerk/expo";
import { useQueryClient } from "@tanstack/react-query";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import { useEffect, useRef } from "react";

/**
 * Bridges the Clerk session token into the generated API client and keeps the
 * React Query cache consistent across account switches.
 *
 * - Sign-in  (null → session): registers the auth token getter and invalidates
 *   all cached queries so they re-fetch with the new auth token immediately.
 * - Sign-out (session → null): clears the entire cache so stale authenticated
 *   data (profile, pass status, AI usage) does not linger for the next user on
 *   a shared device.
 *
 * Design notes:
 * - Uses `useSession` (the actual session object) instead of `useAuth`'s
 *   `getToken` wrapper so we hold a stable reference to the Clerk session.
 * - A ref (`sessionRef`) is updated synchronously on every render, while the
 *   getter closure (registered once on mount) always reads the *current* ref.
 *   This avoids a timing race where `isSignedIn` flips true in the same render
 *   cycle that enables React Query queries, but before a `useEffect` with
 *   `[session]` deps has had a chance to run and update the getter.
 * - Uses `useQueryClient()` rather than the module-level singleton so this
 *   component is testable in isolation.
 */
export function AuthTokenBridge() {
  const { session } = useSession();
  const queryClient = useQueryClient();
  const sessionRef = useRef(session);
  const prevSessionRef = useRef(session);

  // Keep ref current synchronously on every render so the getter closure
  // always sees the latest session without needing to re-register.
  sessionRef.current = session;

  useEffect(() => {
    // Register the getter once on mount. The closure reads sessionRef so it
    // is never stale regardless of how many times the session changes.
    setAuthTokenGetter(async () => {
      try {
        return (await sessionRef.current?.getToken()) ?? null;
      } catch {
        return null;
      }
    });
    return () => setAuthTokenGetter(null);
  }, []);

  useEffect(() => {
    const wasSignedIn = prevSessionRef.current != null;
    const wasSignedOut = prevSessionRef.current == null;
    const isNowSignedIn = session != null;
    const isNowSignedOut = session == null;
    prevSessionRef.current = session;

    // When the session transitions null → non-null (i.e. user just signed in),
    // invalidate all cached queries so they re-fetch with the new auth token.
    // This ensures queries that ran unauthenticated (or got a 401 before the
    // token was available) are refreshed immediately without waiting for
    // staleTime to expire.
    if (wasSignedOut && isNowSignedIn) {
      queryClient.invalidateQueries();
    }

    // When the session transitions non-null → null (i.e. user just signed out),
    // clear the entire cache so stale authenticated data (profile, pass status,
    // AI usage) does not linger for the next user on a shared device.
    if (wasSignedIn && isNowSignedOut) {
      queryClient.clear();
    }
  }, [session, queryClient]);

  return null;
}
