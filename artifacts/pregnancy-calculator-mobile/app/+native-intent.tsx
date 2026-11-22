import { isSsoCallbackUrl } from "@/lib/sso-redirect";

/**
 * Rewrites incoming links before Expo Router navigates on them.
 *
 * The Google sign-in redirect (`…://sso-callback?rotating_token_nonce=…`) is
 * consumed by the sign-in flow, not the router. Left alone, the router would
 * navigate away from the sign-in screen that is waiting for the result, which
 * on Android dropped the user on Home, still signed out.
 *
 * - While the app is running, return null so the router ignores the link and
 *   the sign-in screen stays put.
 * - If the link launches the app (Android recreated it while Chrome was open),
 *   open the sign-in screen; the in-flight flow completes the sign-in.
 */
export function redirectSystemPath({
  path,
  initial,
}: {
  path: string;
  initial: boolean;
}): string | null {
  if (isSsoCallbackUrl(path)) return initial ? "/sign-in" : null;
  return path;
}
