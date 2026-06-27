import { ClerkProvider, useSession } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  ApiError,
  setAuthTokenGetter,
  setBaseUrl,
} from "@workspace/api-client-react";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useRef } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ErrorFallback } from "@/components/ErrorFallback";
import { SubscriptionProvider } from "@/lib/revenuecat";

SplashScreen.preventAutoHideAsync();

// Native builds need an absolute API base URL (they don't share the web proxy
// origin). EXPO_PUBLIC_DOMAIN is the deployment/dev domain without a protocol.
const apiDomain = process.env.EXPO_PUBLIC_DOMAIN;
if (apiDomain) {
  setBaseUrl(`https://${apiDomain}`);
}

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
// Production routes Clerk through a same-domain proxy; empty/undefined in dev,
// where the SDK talks to the Frontend API encoded in the publishable key.
const clerkProxyUrl = process.env.EXPO_PUBLIC_CLERK_PROXY_URL || undefined;

/**
 * Retry predicate for React Query:
 * - Retry 401 (Unauthorized) up to 2 times — the token may not have been ready
 *   for the very first fetch after sign-in.
 * - Never retry other 4xx errors; they represent client mistakes (403, 404,
 *   422, …) that a retry won't fix.
 * - Retry all other errors (network failures, 5xx) up to 2 times as usual.
 */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false;
  if (error instanceof ApiError) {
    return error.status === 401;
  }
  return true;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: shouldRetry,
      retryDelay: (attempt) => Math.min(500 * 2 ** attempt, 5000),
    },
  },
});

/**
 * Bridges the Clerk session token into the generated API client. When signed
 * in, requests carry `Authorization: Bearer <token>`; when signed out,
 * the getter returns null and the server meters the request by IP.
 *
 * Design notes:
 * - Uses `useSession` (the actual session object) instead of `useAuth`'s
 *   `getToken` wrapper so we hold a stable reference to the Clerk session.
 * - A ref (`sessionRef`) is updated synchronously on every render, while the
 *   getter closure (registered once on mount) always reads the *current* ref.
 *   This avoids a timing race where `isSignedIn` flips true in the same render
 *   cycle that enables React Query queries, but before a `useEffect` with
 *   `[session]` deps has had a chance to run and update the getter.
 */
function AuthTokenBridge() {
  const { session } = useSession();
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
    const wasSignedOut = prevSessionRef.current == null;
    const isNowSignedIn = session != null;
    prevSessionRef.current = session;

    // When the session transitions null → non-null (i.e. user just signed in),
    // invalidate all cached queries so they re-fetch with the new auth token.
    // This ensures queries that ran unauthenticated (or got a 401 before the
    // token was available) are refreshed immediately without waiting for
    // staleTime to expire.
    if (wasSignedOut && isNowSignedIn) {
      queryClient.invalidateQueries();
    }
  }, [session]);

  return null;
}

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="(auth)"
        options={{ headerShown: false, presentation: "modal" }}
      />
    </Stack>
  );
}

/**
 * Shown when the Clerk publishable key is missing from the build. Mounting
 * <ClerkProvider> with an empty key throws synchronously, so without this guard
 * the app would hard-crash on launch (e.g. a native build that didn't receive
 * EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY). Rendering a clear screen instead keeps the
 * app openable and makes the misconfiguration diagnosable.
 */
function ConfigErrorScreen() {
  return (
    <ErrorFallback
      error={
        new Error(
          "Missing configuration: EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY was not " +
            "included in this build, so authentication cannot start.",
        )
      }
      resetError={() => {}}
    />
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  // ErrorBoundary + SafeAreaProvider are the outermost wrappers so that any
  // throw from the provider tree below (including ClerkProvider) surfaces as a
  // recoverable in-app screen rather than a launch crash.
  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        {publishableKey ? (
          <ClerkProvider
            publishableKey={publishableKey}
            tokenCache={tokenCache}
            proxyUrl={clerkProxyUrl}
          >
            <QueryClientProvider client={queryClient}>
              <AuthTokenBridge />
              <SubscriptionProvider>
                <GestureHandlerRootView style={{ flex: 1 }}>
                  <KeyboardProvider>
                    <RootLayoutNav />
                  </KeyboardProvider>
                </GestureHandlerRootView>
              </SubscriptionProvider>
            </QueryClientProvider>
          </ClerkProvider>
        ) : (
          <ConfigErrorScreen />
        )}
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
