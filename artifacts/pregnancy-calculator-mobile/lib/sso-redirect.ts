/**
 * Google sign-in's return trip on Android.
 *
 * Google sign-in runs through Clerk's `startSSOFlow`, which opens Chrome and
 * waits for Clerk to send the browser back to the app's redirect URL. Two
 * things went wrong with that on Android (seen on the emulator, Nov 2026):
 *
 * 1. The redirect URL was the bare scheme (`pregnancy-calculator-mobile://`),
 *    which Expo Router reads as a link to `/`. It navigated to Home, throwing
 *    away the sign-in screen that was waiting for the result. The redirect now
 *    carries its own path, `sso-callback` (Clerk's own default), and
 *    `app/+native-intent.tsx` tells the router to ignore it.
 *
 * 2. On Android, expo-web-browser has no native auth session. It races "the
 *    redirect link arrived" against "the app came back to the foreground",
 *    and both happen at the same moment when Chrome hands control back. When
 *    the foreground event wins, the flow reports a dismissal even though Clerk
 *    finished signing the user in (they even get Clerk's new-sign-in email),
 *    and the app stays signed out. `startGoogleSSO` catches the redirect link
 *    itself and, if the flow reported a dismissal, finishes the sign-in from
 *    it the same way Clerk's `useSSO` would have.
 */

import { Linking, Platform } from "react-native";

/** Path of the Google sign-in redirect URL. Must be in Clerk's allowlist. */
export const SSO_CALLBACK_PATH = "sso-callback";

/** True for the redirect link Clerk sends back after Google sign-in. */
export function isSsoCallbackUrl(url: string): boolean {
  return new RegExp(`(^|[/:])${SSO_CALLBACK_PATH}([/?#]|$)`).test(url);
}

/** How long to wait for the redirect link after a reported dismissal. */
const REDIRECT_GRACE_MS = 1500;
const POLL_MS = 50;

/** Reads `rotating_token_nonce` without relying on URL.searchParams. */
function nonceFrom(url: string): string | null {
  const match = /[?&#]rotating_token_nonce=([^&#]*)/.exec(url);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * The parts of `startSSOFlow`'s result this module touches. Typed loosely so
 * it works with the resources Clerk returns without importing its internals.
 */
type SSOResult = {
  createdSessionId: string | null;
  authSessionResult?: { type: string } | null;
  signIn?: {
    reload: (params: { rotatingTokenNonce: string }) => Promise<unknown>;
    firstFactorVerification: { status: string | null };
    createdSessionId: string | null;
  } | null;
  signUp?: {
    create: (params: { transfer: boolean }) => Promise<unknown>;
    createdSessionId: string | null;
  } | null;
};

/**
 * Runs `startSSOFlow` and, on Android, recovers a sign-in that finished in
 * the browser but was reported to the app as a dismissal.
 *
 * Returns `startSSOFlow`'s result, with `createdSessionId` filled in when the
 * recovery succeeded. Errors from the recovery are thrown, so the caller's
 * usual logging and error message apply.
 */
export async function startGoogleSSO<
  P extends { redirectUrl?: string },
  R extends SSOResult,
>(startSSOFlow: (params: P) => Promise<R>, params: P): Promise<R> {
  const redirectUrl = params.redirectUrl;
  const watch = Platform.OS === "android" && !!redirectUrl;

  let redirectedTo: string | null = null;
  const subscription = watch
    ? Linking.addEventListener?.("url", ({ url }: { url: string }) => {
        if (url.startsWith(redirectUrl!)) redirectedTo = url;
      })
    : undefined;

  try {
    const result = await startSSOFlow(params);
    if (
      !watch ||
      result.createdSessionId ||
      result.authSessionResult?.type !== "dismiss" ||
      !result.signIn
    ) {
      return result;
    }

    // The flow says the browser was dismissed. Give the redirect link a
    // moment to arrive, then check the launch link too, in case Android
    // recreated the app's screen to deliver it.
    for (let waited = 0; !redirectedTo && waited < REDIRECT_GRACE_MS; ) {
      await new Promise((r) => setTimeout(r, POLL_MS));
      waited += POLL_MS;
    }
    let url: string | null = redirectedTo;
    if (!url) {
      const initial = await Linking.getInitialURL?.();
      if (initial && initial.startsWith(redirectUrl!)) url = initial;
    }
    const nonce = url ? nonceFrom(url) : null;
    if (!nonce) return result;

    // Finish the sign-in exactly as Clerk's useSSO does after a redirect.
    const { signIn, signUp } = result;
    await signIn.reload({ rotatingTokenNonce: nonce });
    if (signIn.firstFactorVerification.status === "transferable" && signUp) {
      await signUp.create({ transfer: true });
    }
    return {
      ...result,
      createdSessionId: signUp?.createdSessionId ?? signIn.createdSessionId,
    };
  } finally {
    subscription?.remove?.();
  }
}
