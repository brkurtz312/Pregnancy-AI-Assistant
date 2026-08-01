import { useEffect, useRef } from "react";
import { useClerk, useSession } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@workspace/api-client-react";

/**
 * Watches the Clerk session and keeps the React Query cache consistent:
 * - Sign-in  (null → session): invalidate all queries so they re-fetch with
 *   the new auth cookies and return authenticated data right away.
 * - Sign-out (session → null): clear the entire cache so stale authenticated
 *   data (profile, pass status, AI usage) does not linger for the next user.
 *
 * Stale-tenant guard: if any query exhausts its retries and lands in error
 * state with a 401 while Clerk still holds a session, it means the cached
 * session token is from the old Clerk tenant and will never validate. We call
 * signOut() immediately so Clerk clears the token cache and the sign-in page
 * is shown rather than a broken/spinner state.
 *
 * Must be rendered inside both <ClerkProvider> and <QueryClientProvider>.
 */
export function SessionWatcher() {
  const { session } = useSession();
  const { signOut } = useClerk();
  const queryClient = useQueryClient();
  const prevSessionRef = useRef(session);
  const sessionRef = useRef(session);
  // Prevent redundant signOut() calls when multiple queries fail with 401
  // simultaneously (e.g. on initial load with a stale tenant token).
  const signingOutRef = useRef(false);

  // Keep sessionRef current synchronously so the cache-subscription closure
  // below always reads the latest session without needing to re-subscribe.
  sessionRef.current = session;

  useEffect(() => {
    const wasSignedIn = prevSessionRef.current != null;
    const wasSignedOut = prevSessionRef.current == null;
    const isNowSignedIn = session != null;
    const isNowSignedOut = session == null;
    prevSessionRef.current = session;

    if (wasSignedOut && isNowSignedIn) {
      // A fresh sign-in means any previous sign-out sequence has fully
      // completed. Reset the guard so a future stale-tenant 401 can trigger
      // sign-out again if needed.
      signingOutRef.current = false;
      queryClient.invalidateQueries();
    }

    if (wasSignedIn && isNowSignedOut) {
      queryClient.clear();
    }
  }, [session, queryClient]);

  useEffect(() => {
    // Watch the query cache for persistent 401 errors while Clerk still holds a
    // session. This covers the "stale tenant" scenario: the browser has a cached
    // token from the old Clerk tenant that will never validate against the new
    // API. React Query exhausts its retries, lands the query in error state, and
    // we detect it here — then call signOut() so Clerk clears the token cache
    // and the sign-in page is rendered.
    const cache = queryClient.getQueryCache();
    const unsubscribe = cache.subscribe((event) => {
      if (event.type !== "updated") return;
      if (event.query.state.status !== "error") return;
      const err = event.query.state.error;
      if (!(err instanceof ApiError) || err.status !== 401) return;
      // Only act when Clerk thinks we're signed in — a 401 while already signed
      // out is expected (unauthenticated request) and must not trigger a
      // redundant sign-out cycle.
      if (sessionRef.current == null) return;
      if (signingOutRef.current) return;
      signingOutRef.current = true;
      // Do NOT reset signingOutRef in .finally(). Clerk's own sign-out flow
      // can trigger new queries that return 401 before `session` becomes null,
      // which would re-enter this branch and call signOut() a second time.
      // Instead, signingOutRef is cleared only when a new sign-in is detected
      // (see the session-transition effect above), ensuring the guard holds for
      // the entire duration of the sign-out sequence.
      //
      // Exception: if signOut() itself rejects (network error, Clerk SDK bug)
      // the session never transitions to null and the sign-in effect never
      // fires, so the guard would stay true forever and silently swallow every
      // subsequent 401. We reset it after a short delay on rejection so the
      // component self-heals — the next genuine 401 will re-trigger signOut().
      signOut().catch(() => {
        setTimeout(() => {
          signingOutRef.current = false;
        }, 5_000);
      });
    });
    return unsubscribe;
  }, [queryClient, signOut]);

  return null;
}
