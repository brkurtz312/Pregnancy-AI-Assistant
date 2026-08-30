import { useAuth } from "@clerk/expo";
import { useDemoSession } from "@/lib/demo-session";

/**
 * The app's single source of truth for "is this session authenticated".
 *
 * There are two ways to be authenticated:
 *   1. A normal Clerk session.
 *   2. An App Review demo session (see `@/lib/demo-session`), which exists
 *      because instance-wide Clerk MFA makes password sign-in impossible for
 *      Apple's reviewer.
 *
 * Screens should call this instead of Clerk's `useAuth` when they are deciding
 * whether to show signed-in UI or fetch authenticated data. Call Clerk's
 * `useAuth` directly only when you specifically need Clerk identity (e.g. the
 * real `userId` for Clerk-scoped operations).
 */
export function useAppAuth(): {
  isSignedIn: boolean;
  isLoaded: boolean;
  /** True when the session is a review demo rather than a real account. */
  isDemo: boolean;
  /** Clerk user id, or null in a demo session. */
  userId: string | null;
} {
  const { isSignedIn, isLoaded, userId } = useAuth();
  const { isDemo, hydrated } = useDemoSession();

  return {
    isSignedIn: isDemo || !!isSignedIn,
    // Not "loaded" until both Clerk and the persisted demo token have settled,
    // otherwise a relaunch mid-review flashes the signed-out state first.
    isLoaded: isLoaded && hydrated,
    isDemo,
    userId: isDemo ? null : (userId ?? null),
  };
}
