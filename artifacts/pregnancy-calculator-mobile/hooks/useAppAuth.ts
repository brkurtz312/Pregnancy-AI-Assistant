import { useAuth } from "@clerk/expo";
import { useCallback } from "react";

import { getDemoToken, useDemoSession } from "@/lib/demo-session";

/**
 * Stable identity for a demo session. Call sites use `userId` only to scope
 * caches and detect account switches, so a constant is sufficient — and it
 * avoids decoding the token (no base64 polyfill needed in React Native). The
 * `demo:` prefix matches the server's namespace so it can never be mistaken
 * for a Clerk id, which is always `user_...`.
 */
const DEMO_USER_ID = "demo:local";

/**
 * The app's single source of truth for the current session.
 *
 * There are two ways to be authenticated:
 *   1. A normal Clerk session.
 *   2. An App Review demo session (see `@/lib/demo-session`), which exists
 *      because instance-wide Clerk MFA makes password sign-in impossible for
 *      Apple's reviewer.
 *
 * Screens must use this instead of Clerk's `useAuth`/`useUser` when deciding
 * whether to show signed-in UI, fetch authenticated data, or mint a bearer
 * token. Reach for Clerk's own hooks only when you need Clerk *identity* — the
 * user's email or profile — which a demo session does not have.
 */
export function useAppAuth(): {
  isSignedIn: boolean;
  isLoaded: boolean;
  /** True when the session is a review demo rather than a real account. */
  isDemo: boolean;
  /**
   * The caller's identity: a Clerk user id, or a `demo:`-prefixed subject in a
   * demo session. Safe to use for scoping caches and detecting account
   * switches; not a Clerk id in every case.
   */
  userId: string | null;
  /** Bearer token for manual fetches. Returns the demo token in a demo session. */
  getToken: () => Promise<string | null>;
} {
  const { isSignedIn, isLoaded, userId, getToken: clerkGetToken } = useAuth();
  const { isDemo, hydrated } = useDemoSession();

  const getToken = useCallback(async (): Promise<string | null> => {
    // Read the demo token at call time, not render time, so a session that
    // starts or ends mid-screen is picked up without a re-render.
    const demoToken = getDemoToken();
    if (demoToken) return demoToken;
    try {
      return (await clerkGetToken()) ?? null;
    } catch {
      return null;
    }
  }, [clerkGetToken]);

  return {
    isSignedIn: isDemo || !!isSignedIn,
    // Not "loaded" until both Clerk and the persisted demo token have settled,
    // otherwise a relaunch mid-review flashes the signed-out state first.
    isLoaded: isLoaded && hydrated,
    isDemo,
    userId: isDemo ? DEMO_USER_ID : (userId ?? null),
    getToken,
  };
}
