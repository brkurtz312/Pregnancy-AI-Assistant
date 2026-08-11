/**
 * splash-gate.ts
 *
 * Bounds how long the launch splash screen can stay up.
 *
 * OTA / launch behaviour overview:
 *  - expo-updates is configured (app.json → updates.fallbackToCacheTimeout: 0,
 *    checkAutomatically: "ON_LOAD") so the native layer NEVER blocks launch on
 *    an update download — it always boots the cached (embedded or previously
 *    downloaded) bundle immediately and fetches any new update in the
 *    background, applying it on the next launch.
 *  - The only remaining thing that keeps the splash up is JS-side readiness
 *    (font loading in app/_layout.tsx). If that ever stalls (slow network for
 *    remote assets, a hung native module, an OTA'd bundle misbehaving), the
 *    safety timeout below guarantees the splash is dismissed and the user
 *    reaches the sign-in screen within a bounded time, falling back to system
 *    fonts.
 */

import { useEffect, useState } from "react";

/**
 * Upper bound on splash screen visibility. After this long the app renders
 * regardless of whether fonts (or anything else gating first render) have
 * finished loading.
 */
export const SPLASH_SAFETY_TIMEOUT_MS = 8000;

/**
 * Returns `false` initially and flips to `true` once `timeoutMs` has elapsed.
 * Used as an escape hatch alongside font loading: `fontsLoaded || fontError ||
 * timedOut` decides when to hide the splash and render the app.
 *
 * The timer starts on mount and is cleaned up on unmount.
 */
export function useSplashSafetyTimeout(
  timeoutMs: number = SPLASH_SAFETY_TIMEOUT_MS,
): boolean {
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setTimedOut(true), timeoutMs);
    return () => clearTimeout(timer);
  }, [timeoutMs]);

  return timedOut;
}
