import * as SecureStore from "expo-secure-store";
import { useSyncExternalStore } from "react";

/**
 * App Review demo session.
 *
 * Clerk's instance-wide "Require multi-factor authentication" policy forces an
 * email_code second factor on every password sign-in, including demo accounts
 * with no MFA enrolled. Apple's reviewer cannot read the mailbox that code goes
 * to, so a password-based demo account can never complete sign-in. See
 * `.agents/memory/clerk-mfa-blocks-app-review.md`.
 *
 * A demo session sidesteps Clerk entirely: the server exchanges a review access
 * code for a short-lived signed token, which the API client sends in place of a
 * Clerk token. Nothing here touches the Clerk SDK.
 */

const STORAGE_KEY = "demo_session_token";

let _token: string | null = null;
let _hydrated = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Current demo token, or null. Synchronous — safe to call during render. */
export function getDemoToken(): string | null {
  return _token;
}

/** True once hydrateDemoSession() has finished, successfully or not. */
export function isDemoSessionHydrated(): boolean {
  return _hydrated;
}

/**
 * Loads any persisted demo token into memory. Call once at startup, before
 * deciding whether the user is authenticated, so a relaunch mid-review does
 * not bounce the reviewer back to the sign-in screen.
 */
export async function hydrateDemoSession(): Promise<void> {
  try {
    _token = await SecureStore.getItemAsync(STORAGE_KEY);
  } catch {
    _token = null;
  } finally {
    _hydrated = true;
    emit();
  }
}

export async function setDemoToken(token: string): Promise<void> {
  _token = token;
  try {
    await SecureStore.setItemAsync(STORAGE_KEY, token);
  } catch {
    // Non-fatal: the session still works for this launch, it just won't
    // survive a relaunch.
  }
  emit();
}

export async function clearDemoToken(): Promise<void> {
  _token = null;
  try {
    await SecureStore.deleteItemAsync(STORAGE_KEY);
  } catch {
    // Ignore — the in-memory token is already gone, which is what gates the UI.
  }
  emit();
}

/** Re-renders when the demo session starts or ends. */
export function useDemoSession(): { isDemo: boolean; hydrated: boolean } {
  const token = useSyncExternalStore(
    subscribe,
    getDemoToken,
    () => null, // server snapshot (web SSR); no demo session there
  );
  const hydrated = useSyncExternalStore(
    subscribe,
    isDemoSessionHydrated,
    () => true,
  );
  return { isDemo: token != null, hydrated };
}

/** TEST ONLY — resets module state between tests. */
export function __resetDemoSessionForTests(): void {
  _token = null;
  _hydrated = false;
  listeners.clear();
}
