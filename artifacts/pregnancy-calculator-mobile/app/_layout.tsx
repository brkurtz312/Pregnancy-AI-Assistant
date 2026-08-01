import { ClerkProvider, useAuth } from "@clerk/expo";
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
  getGetProfileQueryKey,
  setBaseUrl,
  useGetProfile,
} from "@workspace/api-client-react";
import Constants from "expo-constants";
import { type Href, Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import * as Updates from "expo-updates";
import React, { useEffect, useRef, useState } from "react";
import { WhatsNewModal } from "@/components/WhatsNewModal";
import { useWhatsNew } from "@/hooks/useWhatsNew";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AuthTokenBridge } from "@/components/AuthTokenBridge";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ErrorFallback } from "@/components/ErrorFallback";
import { LocationModeGate } from "@/components/LocationModePrompt";
import { SubscriptionProvider } from "@/lib/revenuecat";
import { SettingsProvider } from "@/contexts/SettingsContext";
import { useGlobalBackgroundSync } from "@/hooks/useGlobalBackgroundSync";

SplashScreen.preventAutoHideAsync();

// Check for an OTA update as early as possible, before any rendering happens.
// This is critical because the embedded EAS bundle uses dev/test Clerk keys,
// while the deployed OTA bundles carry the production Clerk keys. Applying the
// update here (before the sign-in screen is ever shown) means production users
// always authenticate against the correct Clerk environment.
//
// In dev mode (Expo Go / metro) expo-updates is a no-op, so we skip the check.
// On error (offline, OTA server down) we fall through and let the app launch
// with the embedded bundle — sign-in will fail for new users, but that is the
// same situation we had before, and being offline blocks sign-in anyway.
const otaReadyPromise: Promise<void> = !__DEV__
  ? (async () => {
      try {
        const update = await Updates.checkForUpdateAsync();
        if (update.isAvailable) {
          await Updates.fetchUpdateAsync();
          // reloadAsync() never returns — the app restarts from scratch with
          // the new bundle, at which point no update is available and the
          // promise resolves immediately on the next launch.
          await Updates.reloadAsync();
        }
      } catch {
        // Network offline or OTA server unreachable — proceed with embedded bundle.
      }
    })()
  : Promise.resolve();

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
 * Redirects a signed-in user to the onboarding screen once, the first time
 * their profile is loaded and has no `firstName` set. Uses `useSegments` to
 * avoid an infinite redirect loop while already on `/onboarding`, and only
 * fires once per app session (`hasPromptedRef`) so navigating back out of
 * onboarding (e.g. via Skip) doesn't immediately re-trigger it.
 */
function OnboardingGate() {
  const { isSignedIn, isLoaded } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  const hasPromptedRef = useRef(false);

  const { data: profile } = useGetProfile({
    query: { enabled: !!isSignedIn, queryKey: getGetProfileQueryKey() },
  });

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    if (hasPromptedRef.current) return;
    if (profile === undefined) return;
    if (segments[0] === "onboarding") return;

    if (!profile?.firstName) {
      hasPromptedRef.current = true;
      router.push("/onboarding" as Href);
    } else {
      hasPromptedRef.current = true;
    }
  }, [isLoaded, isSignedIn, profile, segments, router]);

  return null;
}

function RootLayoutNav() {
  const appVersion = Constants.expoConfig?.version ?? "";
  const { visible, dismiss } = useWhatsNew();

  useGlobalBackgroundSync();

  return (
    <>
      <OnboardingGate />
      <LocationModeGate />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="(auth)"
          options={{ headerShown: false, presentation: "fullScreenModal" }}
        />
        <Stack.Screen
          name="onboarding"
          options={{ headerShown: false, presentation: "fullScreenModal" }}
        />
        <Stack.Screen
          name="prenatal-testing"
          options={{ headerShown: false, presentation: "card" }}
        />
        <Stack.Screen
          name="visit-summary"
          options={{ headerShown: false, presentation: "card" }}
        />
        <Stack.Screen
          name="development"
          options={{ headerShown: false, presentation: "card" }}
        />
        <Stack.Screen
          name="office-visit"
          options={{ headerShown: false, presentation: "card" }}
        />
        <Stack.Screen
          name="prenatal-care"
          options={{ headerShown: false, presentation: "card" }}
        />
        <Stack.Screen
          name="choose-ob-provider"
          options={{ headerShown: false, presentation: "card" }}
        />
        <Stack.Screen
          name="pregnancy-complications"
          options={{ headerShown: false, presentation: "card" }}
        />
        <Stack.Screen
          name="support-person-vol1"
          options={{ headerShown: false, presentation: "card" }}
        />
        <Stack.Screen
          name="labor-delivery"
          options={{ headerShown: false, presentation: "card" }}
        />
        <Stack.Screen
          name="support-person-vol2"
          options={{ headerShown: false, presentation: "card" }}
        />
        <Stack.Screen
          name="birth-plan"
          options={{ headerShown: false, presentation: "card" }}
        />
        <Stack.Screen
          name="birth-plan-summary"
          options={{ headerShown: false, presentation: "card" }}
        />
        <Stack.Screen
          name="postpartum"
          options={{ headerShown: false, presentation: "card" }}
        />
        <Stack.Screen
          name="support-person-vol3"
          options={{ headerShown: false, presentation: "card" }}
        />
        <Stack.Screen
          name="postpartum-depression"
          options={{ headerShown: false, presentation: "card" }}
        />
        <Stack.Screen
          name="postpartum-depression-summary"
          options={{ headerShown: false, presentation: "card" }}
        />
        <Stack.Screen
          name="breastfeeding"
          options={{ headerShown: false, presentation: "card" }}
        />
        <Stack.Screen
          name="breastfeeding-summary"
          options={{ headerShown: false, presentation: "card" }}
        />
        <Stack.Screen
          name="postpartum-contraception"
          options={{ headerShown: false, presentation: "card" }}
        />
        <Stack.Screen
          name="intimacy-after-delivery"
          options={{ headerShown: false, presentation: "card" }}
        />
        <Stack.Screen
          name="labor-natural-induced"
          options={{ headerShown: false, presentation: "card" }}
        />
        <Stack.Screen
          name="labor-pain-management"
          options={{ headerShown: false, presentation: "card" }}
        />
        <Stack.Screen
          name="cesarean-birth"
          options={{ headerShown: false, presentation: "card" }}
        />
        <Stack.Screen
          name="hospital-bag"
          options={{ headerShown: false, presentation: "card" }}
        />
        <Stack.Screen
          name="pdf-viewer"
          options={{ headerShown: false, presentation: "modal" }}
        />
        <Stack.Screen
          name="journal"
          options={{ headerShown: false, presentation: "card" }}
        />
        <Stack.Screen
          name="journal-entry"
          options={{ headerShown: false, presentation: "card" }}
        />
        <Stack.Screen
          name="in-office"
          options={{ headerShown: false, presentation: "card" }}
        />
        <Stack.Screen
          name="at-facility"
          options={{ headerShown: false, presentation: "card" }}
        />
      </Stack>
      <WhatsNewModal
        version={appVersion}
        visible={visible}
        onDismiss={dismiss}
      />
    </>
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

function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  // Start as true in dev (no OTA check), false in production (wait for check).
  const [otaReady, setOtaReady] = useState(__DEV__);

  useEffect(() => {
    otaReadyPromise.then(() => setOtaReady(true));
  }, []);

  useEffect(() => {
    if ((fontsLoaded || fontError) && otaReady) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError, otaReady]);

  if (!fontsLoaded && !fontError) return null;
  if (!otaReady) return null;

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
                <SettingsProvider>
                  <GestureHandlerRootView style={{ flex: 1 }}>
                    <KeyboardProvider>
                      <RootLayoutNav />
                    </KeyboardProvider>
                  </GestureHandlerRootView>
                </SettingsProvider>
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

export default RootLayout;
