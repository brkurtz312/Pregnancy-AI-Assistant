import { useClerk, useSession } from "@clerk/expo";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError, setAuthTokenGetter } from "@workspace/api-client-react";
import { useEffect, useRef } from "react";
import { clearJournalCache } from "@/lib/journal";
import { clearHospitalBagCache } from "@/lib/hospital-bag";
import { clearBirthPlanCache } from "@/lib/birth-plan";
import { clearVisitQuestionsCache } from "@/lib/visit-questions";
import { clearFhrCache } from "@/lib/fetal-heart-rate";
import { clearScribeNoteCache } from "@/lib/scribe-note";
import { clearBfCheckinCache } from "@/lib/breastfeeding";
import { clearPpdCache } from "@/lib/postpartum-depression";
import { clearLocationModeUserData } from "@/lib/location-mode";
import { cancelAllAppointmentReminders } from "@/lib/appointment-reminders";
import { cancelAllMilestoneNotifications } from "@/lib/milestone-notifications";
import { clearAllCustomReminders } from "@/lib/custom-reminders";
import { invalidateWatchQueueSession } from "@/lib/sync-queue";
import WatchConnectivity from "@/modules/WatchConnectivity";

/**
 * Bridges the Clerk session token into the generated API client and keeps the
 * React Query cache consistent across account switches.
 *
 * - Sign-in  (null → session): registers the auth token getter and invalidates
 *   all cached queries so they re-fetch with the new auth token immediately.
 * - Sign-out (session → null): clears the React Query cache AND the AsyncStorage
 *   tool caches (journal, hospital bag, birth plan) so stale data does not
 *   appear to a signed-out session or to a different user who signs in next.
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
  const { signOut } = useClerk();
  const queryClient = useQueryClient();
  const sessionRef = useRef(session);
  const prevSessionRef = useRef(session);
  // Prevent redundant signOut() calls when multiple queries all fail with 401
  // at the same time (e.g. on initial load with a stale tenant token).
  const signingOutRef = useRef(false);

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
    // Watch the query cache for persistent 401 errors while Clerk still holds a
    // session. This covers the "stale tenant" scenario: the device has a cached
    // token from the old Clerk tenant that will never validate against the new
    // API. React Query exhausts its retries, lands the query in error state, and
    // we detect it here — then call signOut() so Clerk clears the token cache
    // and the app routes the user to the sign-in screen.
    const cache = queryClient.getQueryCache();
    const unsubscribe = cache.subscribe((event) => {
      if (event.type !== "updated") return;
      if (event.query.state.status !== "error") return;
      const err = event.query.state.error;
      if (!(err instanceof ApiError) || err.status !== 401) return;
      // Only act when Clerk thinks we're signed in — a 401 while already signed
      // out is expected (unauthenticated request) and should not trigger another
      // sign-out cycle.
      if (sessionRef.current == null) return;
      if (signingOutRef.current) return;
      signingOutRef.current = true;
      // Do NOT reset signingOutRef in .finally(). Clerk's own sign-out flow
      // can trigger new queries that return 401 before `session` becomes null,
      // which would re-enter this branch and call signOut() a second time.
      // Instead, signingOutRef is cleared only when a new sign-in is detected
      // (see the session-transition effect below), ensuring the guard holds for
      // the entire duration of the sign-out sequence.
      //
      // If signOut() itself rejects (e.g. network offline, Clerk error), we
      // reset the guard after 5 s so the next 401 can trigger a fresh attempt
      // rather than silently ignoring all 401s until the app is force-quit.
      signOut().catch(() => {
        setTimeout(() => {
          signingOutRef.current = false;
        }, 5000);
      });
    });
    return unsubscribe;
  }, [queryClient, signOut]);

  useEffect(() => {
    const wasSignedIn = prevSessionRef.current != null;
    const wasSignedOut = prevSessionRef.current == null;
    const isNowSignedIn = session != null;
    const isNowSignedOut = session == null;
    // Capture the outgoing userId before overwriting the ref so we can clear
    // per-user Watch queues during the sign-out branch below.
    const outgoingUserId = prevSessionRef.current?.user?.id ?? null;
    prevSessionRef.current = session;

    // When the session transitions null → non-null (i.e. user just signed in),
    // invalidate all cached queries so they re-fetch with the new auth token.
    // This ensures queries that ran unauthenticated (or got a 401 before the
    // token was available) are refreshed immediately without waiting for
    // staleTime to expire.
    if (wasSignedOut && isNowSignedIn) {
      // A fresh sign-in means any previous sign-out sequence has fully
      // completed. Reset the guard so a future stale-tenant 401 can trigger
      // sign-out again if needed.
      signingOutRef.current = false;
      queryClient.invalidateQueries();
    }

    // When the session transitions non-null → null (i.e. user just signed out),
    // clear the entire React Query cache so stale authenticated data (profile,
    // pass status, AI usage) does not linger for the next user on a shared
    // device. Also wipe the AsyncStorage tool caches (journal, hospital bag,
    // birth plan) so a signed-out session never shows the previous user's data.
    if (wasSignedIn && isNowSignedOut) {
      // Cancel in-flight queries first so they cannot repopulate the cache
      // after clear() (race condition: query resolves between clear and the
      // component that issued it being unmounted).
      queryClient.cancelQueries().catch(() => {});
      queryClient.clear();
      clearJournalCache().catch(() => {});
      clearHospitalBagCache().catch(() => {});
      clearBirthPlanCache().catch(() => {});
      clearVisitQuestionsCache().catch(() => {});
      clearFhrCache().catch(() => {});
      clearScribeNoteCache().catch(() => {});
      clearBfCheckinCache().catch(() => {});
      clearPpdCache().catch(() => {});
      clearLocationModeUserData().catch(() => {});
      cancelAllAppointmentReminders().catch(() => {});
      cancelAllMilestoneNotifications().catch(() => {});
      clearAllCustomReminders().catch(() => {});
      // Notify the Watch to clear its persisted session data (kick counter,
      // contraction timer). Fire-and-forget: the native module is a no-op when
      // the Watch app is not installed or WCSession is not activated.
      WatchConnectivity.signOut().catch(() => {});
      // Invalidate the per-user Watch event queues: bumps the session generation
      // so post-sign-out enqueue calls are rejected, then clears the stored data.
      // Both steps are serialized through the queue chains so no stale Write can
      // slip in after the clear.
      if (outgoingUserId) {
        invalidateWatchQueueSession(outgoingUserId).catch(() => {});
      }
    }
  }, [session, queryClient]);

  return null;
}
