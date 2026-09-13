import { ClerkProvider } from "@clerk/expo";
import { useAppAuth as useAuth } from "@/hooks/useAppAuth";
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

import React, { useEffect, useRef } from "react";
import { WhatsNewModal } from "@/components/WhatsNewModal";
import { useWhatsNew } from "@/hooks/useWhatsNew";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AuthTokenBridge } from "@/components/AuthTokenBridge";
import { hydrateDemoSession } from "@/lib/demo-session";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ErrorFallback } from "@/components/ErrorFallback";
import { LocationModeGate } from "@/components/LocationModePrompt";
import { WatchBackgroundListener } from "@/components/WatchBackgroundListener";
import { SubscriptionProvider } from "@/lib/revenuecat";
import { useSplashSafetyTimeout } from "@/lib/splash-gate";
import { SettingsProvider } from "@/contexts/SettingsContext";
import { useGlobalBackgroundSync } from "@/hooks/useGlobalBackgroundSync";
import { requestNotificationPermission } from "@/lib/appointment-reminders";
import {
  addNotificationTapListener,
  getInitialMilestoneNotificationUrl,
  scheduleMilestoneNotifications,
} from "@/lib/milestone-notifications";
import { parseApiDate } from "@/lib/dates";

SplashScreen.preventAutoHideAsync();

// Native builds need an absolute API base URL (they don't share the web proxy
// origin). EXPO_PUBLIC_DOMAIN is the deployment/dev domain without a protocol.
const apiDomain = process.env.EXPO_PUBLIC_DOMAIN;
if (apiDomain) {
  setBaseUrl(`https://${apiDomain}`);
}

// Restore any persisted App Review demo session before the first auth gate
// renders, so relaunching mid-review does not bounce the reviewer to sign-in.
void hydrateDemoSession();

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";

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

/**
 * Requests notification permission once after sign-in. Uses a ref to ensure
 * the request fires at most once per app session regardless of re-renders.
 */
function NotificationSetup() {
  const { isSignedIn } = useAuth();
  const hasRequestedRef = useRef(false);

  useEffect(() => {
    if (!isSignedIn || hasRequestedRef.current) return;
    hasRequestedRef.current = true;
    requestNotificationPermission().catch(() => {
      // best-effort — permission denial is a normal user choice
    });
  }, [isSignedIn]);

  return null;
}

/**
 * Schedules (or reschedules) milestone notifications whenever the user's due
 * date is set or changed.  Runs at most once per unique due date value so
 * repeated renders don't create duplicate notifications.
 *
 * The in-memory guard (`lastScheduledDueDateRef`) is reset on sign-out so
 * that the same user signing back in — or a new user with the same due date
 * signing in on a shared device — triggers a fresh scheduling pass after
 * `cancelAllMilestoneNotifications` has cleared the old notifications.
 */
function MilestoneNotificationScheduler() {
  const { isSignedIn } = useAuth();
  const { data: profile } = useGetProfile({
    query: { enabled: !!isSignedIn, queryKey: getGetProfileQueryKey() },
  });
  const lastScheduledDueDateRef = useRef<string | null>(null);

  // Clear the in-memory guard on sign-out so that a subsequent sign-in
  // (same or different account) always triggers a fresh scheduling pass.
  useEffect(() => {
    if (!isSignedIn) {
      lastScheduledDueDateRef.current = null;
    }
  }, [isSignedIn]);

  useEffect(() => {
    if (!isSignedIn || !profile?.dueDate) return;
    const dueDateISO = profile.dueDate.slice(0, 10);
    if (lastScheduledDueDateRef.current === dueDateISO) return;
    lastScheduledDueDateRef.current = dueDateISO;
    scheduleMilestoneNotifications(parseApiDate(profile.dueDate)).catch(() => {
      // best-effort — scheduling failure should not affect app behaviour
    });
  }, [isSignedIn, profile?.dueDate]);

  return null;
}

function RootLayoutNav() {
  const appVersion = Constants.expoConfig?.version ?? "";
  const { visible, dismiss } = useWhatsNew();
  const router = useRouter();

  useGlobalBackgroundSync();

  // Deep-link into the relevant screen when the user taps a milestone
  // notification while the app is running (foreground / background).
  useEffect(() => {
    const remove = addNotificationTapListener((url) => {
      router.push(url as Parameters<typeof router.push>[0]);
    });
    return remove;
  }, [router]);

  // Handle cold-start taps: when the app was terminated and a notification
  // tap launched it, Expo queues the response.  Read it once on mount and
  // navigate to the validated URL if one is present.
  useEffect(() => {
    getInitialMilestoneNotificationUrl()
      .then((url) => {
        if (url) router.push(url as Parameters<typeof router.push>[0]);
      })
      .catch(() => {
        // best-effort — navigation failure on startup should not crash the app
      });
    // Run only once on mount — no dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <OnboardingGate />
      <NotificationSetup />
      <MilestoneNotificationScheduler />
      <LocationModeGate />
      <WatchBackgroundListener />
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

  // Safety valve: guarantees the splash screen is dismissed within a bounded
  // time even if font loading stalls (e.g. an OTA-updated bundle misbehaving
  // or a hung native module). The native OTA layer itself never blocks launch
  // (app.json → updates.fallbackToCacheTimeout: 0). See lib/splash-gate.ts.
  const splashTimedOut = useSplashSafetyTimeout();
  const appReady = fontsLoaded || !!fontError || splashTimedOut;

  useEffect(() => {
    if (appReady) {
      SplashScreen.hideAsync();
    }
  }, [appReady]);

  if (!appReady) return null;

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
