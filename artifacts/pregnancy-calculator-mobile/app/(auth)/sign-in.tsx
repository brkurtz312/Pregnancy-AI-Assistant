import { useClerk, useSSO, useSignIn } from "@clerk/expo";
import { useSignInWithApple } from "@clerk/expo/apple";
import { Ionicons } from "@expo/vector-icons";
import * as AuthSession from "expo-auth-session";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { isCancelError } from "@/lib/auth-cancel";

// Handles the OAuth callback redirect on Android. This must be called at
// module level so it runs before the component tree mounts.
WebBrowser.maybeCompleteAuthSession();

function useWarmUpBrowser() {
  useEffect(() => {
    if (Platform.OS !== "android") return;
    void WebBrowser.warmUpAsync();
    return () => {
      void WebBrowser.coolDownAsync();
    };
  }, []);
}

export default function SignInScreen() {
  useWarmUpBrowser();

  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signIn, errors, fetchStatus } = useSignIn();
  const { setActive } = useClerk();
  const { startSSOFlow } = useSSO();
  const { startAppleAuthenticationFlow } = useSignInWithApple();
  // Tracks whether setActive already succeeded so the catch block knows
  // not to show an error if Clerk's background cleanup fires a 400 afterwards.
  const sessionActivated = useRef(false);

  const [emailAddress, setEmailAddress] = useState("");
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  // Hidden until confirmed available — hides the button on old binaries that
  // don't have expo-apple-authentication linked as a native module.
  const [isAppleAvailable, setIsAppleAvailable] = useState(false);

  useEffect(() => {
    if (Platform.OS !== "ios") return;
    (async () => {
      try {
        // Safe-require: throws if the native module isn't in this binary.
        const AppleAuth = require("expo-apple-authentication");
        const available = await AppleAuth.isAvailableAsync();
        setIsAppleAvailable(available);
      } catch {
        setIsAppleAvailable(false);
      }
    })();
  }, []);

  const fetching = fetchStatus === "fetching";
  const errorText =
    errors.fields.identifier?.message ??
    errors.fields.password?.message ??
    notice;

  const onSubmit = async () => {
    if (fetching) return;
    if (!signIn) {
      setNotice(
        "Sign-in is not ready yet — please wait a moment and try again.",
      );
      return;
    }
    sessionActivated.current = false;
    setNotice(null);
    try {
      const { error } = await signIn.password({
        emailAddress: emailAddress.trim(),
        password,
      });
      if (error) return;

      // Activate the session only when Clerk has fully completed the sign-in
      // (status === "complete" and a session ID was issued). If neither
      // condition holds — e.g. the account requires email verification or a
      // second factor — show an actionable message instead of silently
      // dismissing the screen and leaving the user in a signed-out state.
      if (setActive && signIn.createdSessionId) {
        await setActive({ session: signIn.createdSessionId });
        sessionActivated.current = true;
        router.dismissAll();
      } else {
        setNotice(
          "Sign-in could not be completed. " +
            "If your account requires email verification, check your inbox and verify before signing in.",
        );
      }
      return;
    } catch (err: unknown) {
      // Clerk's background state management sometimes fires a second sign-in
      // request after setActive succeeds, returning 400. If we already
      // activated the session, navigate away and ignore the stale error.
      if (sessionActivated.current) {
        router.dismissAll();
        return;
      }
      console.error("Sign-in error:", JSON.stringify(err, null, 2));
      const clerkErr = err as {
        errors?: Array<{ longMessage?: string; message?: string }>;
      };
      const msg =
        clerkErr?.errors?.[0]?.longMessage ??
        clerkErr?.errors?.[0]?.message ??
        (err instanceof Error ? err.message : String(err));
      setNotice(
        msg || "Sign-in failed. Please check your credentials and try again.",
      );
    }
  };

  const onGooglePress = useCallback(async () => {
    if (googleLoading) return;
    setGoogleLoading(true);
    try {
      const appScheme = Constants.expoConfig?.scheme;
      if (!appScheme) {
        console.error(
          "Google sign-in: expo.scheme is not set in app.json — OAuth redirect URI will be incorrect.",
        );
      }
      const { createdSessionId, setActive } = await startSSOFlow({
        strategy: "oauth_google",
        // Read the scheme from app.json via Constants so a rename stays in sync.
        redirectUrl: AuthSession.makeRedirectUri({
          scheme: typeof appScheme === "string" ? appScheme : appScheme?.[0],
        }),
      });

      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
        router.dismissAll();
      } else {
        setNotice("Sign-in could not be completed — please try again.");
      }
    } catch (err) {
      // Suppress errors that indicate the user deliberately dismissed the
      // consent screen — no message needed in that case.
      if (!isCancelError(err)) {
        console.error("Google sign-in error:", JSON.stringify(err, null, 2));
        const clerkErr = err as {
          errors?: Array<{ longMessage?: string; message?: string }>;
        };
        const msg =
          clerkErr?.errors?.[0]?.longMessage ??
          clerkErr?.errors?.[0]?.message ??
          (err instanceof Error ? err.message : String(err));
        setNotice(msg || "Google sign-in failed. Please try again.");
      }
    } finally {
      setGoogleLoading(false);
    }
  }, [googleLoading, startSSOFlow, router]);

  const onApplePress = useCallback(async () => {
    if (appleLoading) return;
    setAppleLoading(true);
    try {
      // Use the native Apple auth sheet (expo-apple-authentication) via
      // useSignInWithApple. This avoids web OAuth which Apple blocks for
      // custom-scheme redirect URLs.
      const { createdSessionId, setActive } =
        await startAppleAuthenticationFlow();

      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
        router.dismissAll();
      }
      // null createdSessionId means the user cancelled the native Apple sheet
      // (Clerk resolves rather than rejects on cancellation in the native flow).
      // Silently close — no error message needed.
    } catch (err) {
      // Suppress errors that indicate the user deliberately dismissed the
      // Apple Sign-In sheet — no message needed in that case.
      if (!isCancelError(err)) {
        console.error("Apple sign-in error:", JSON.stringify(err, null, 2));
        const clerkErr = err as {
          errors?: Array<{ longMessage?: string; message?: string }>;
        };
        const msg =
          clerkErr?.errors?.[0]?.longMessage ??
          clerkErr?.errors?.[0]?.message ??
          (err instanceof Error ? err.message : String(err));
        setNotice(msg || "Apple sign-in failed. Please try again.");
      }
    } finally {
      setAppleLoading(false);
    }
  }, [appleLoading, startAppleAuthenticationFlow, router]);

  const containerPad = {
    paddingTop: insets.top + 12,
    paddingBottom: insets.bottom + 24,
  };

  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={[styles.content, containerPad]}
          keyboardShouldPersistTaps="handled"
        >
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={() => router.back()}
            hitSlop={10}
          >
            <Ionicons name="close" size={26} color={colors.mutedForeground} />
          </TouchableOpacity>

          <View style={[styles.logo, { backgroundColor: colors.primary }]}>
            <Ionicons name="heart" size={28} color="#fff" />
          </View>
          <Text style={[styles.title, { color: colors.foreground }]}>
            Welcome back
          </Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            Sign in to sync your Full Pregnancy Pass and free questions across
            your devices.
          </Text>

          {/* Google SSO */}
          <TouchableOpacity
            style={[
              styles.googleBtn,
              {
                borderColor: colors.border,
                backgroundColor: colors.card,
                opacity: googleLoading ? 0.7 : 1,
              },
            ]}
            onPress={onGooglePress}
            disabled={googleLoading}
          >
            {googleLoading ? (
              <ActivityIndicator color={colors.foreground} />
            ) : (
              <>
                <GoogleIcon />
                <Text
                  style={[styles.googleBtnText, { color: colors.foreground }]}
                >
                  Continue with Google
                </Text>
              </>
            )}
          </TouchableOpacity>

          {/* Apple SSO — shown on iOS only when native module is linked */}
          {isAppleAvailable && (
            <TouchableOpacity
              style={[styles.appleBtn, { opacity: appleLoading ? 0.7 : 1 }]}
              onPress={onApplePress}
              disabled={appleLoading}
            >
              {appleLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="logo-apple" size={20} color="#fff" />
                  <Text style={styles.appleBtnText}>Continue with Apple</Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {/* Divider */}
          <View style={styles.dividerRow}>
            <View
              style={[styles.dividerLine, { backgroundColor: colors.border }]}
            />
            <Text
              style={[styles.dividerText, { color: colors.mutedForeground }]}
            >
              or
            </Text>
            <View
              style={[styles.dividerLine, { backgroundColor: colors.border }]}
            />
          </View>

          <Text style={[styles.label, { color: colors.foreground }]}>
            Email
          </Text>
          <TextInput
            style={[
              styles.input,
              {
                borderColor: colors.border,
                color: colors.foreground,
                backgroundColor: colors.card,
              },
            ]}
            value={emailAddress}
            onChangeText={setEmailAddress}
            placeholder="you@example.com"
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            inputMode="email"
          />

          <Text style={[styles.label, { color: colors.foreground }]}>
            Password
          </Text>
          <TextInput
            style={[
              styles.input,
              {
                borderColor: colors.border,
                color: colors.foreground,
                backgroundColor: colors.card,
              },
            ]}
            value={password}
            onChangeText={setPassword}
            placeholder="Your password"
            placeholderTextColor={colors.mutedForeground}
            secureTextEntry
            autoComplete="current-password"
            onSubmitEditing={onSubmit}
            returnKeyType="go"
          />

          {errorText && (
            <Text style={[styles.error, { color: colors.destructive }]}>
              {errorText}
            </Text>
          )}

          <TouchableOpacity
            style={[
              styles.primaryBtn,
              {
                backgroundColor: colors.primary,
                opacity: fetching || !emailAddress || !password ? 0.7 : 1,
              },
            ]}
            onPress={onSubmit}
            disabled={fetching || !emailAddress || !password}
          >
            {fetching ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>Sign In</Text>
            )}
          </TouchableOpacity>

          <View style={styles.footerRow}>
            <Text
              style={[styles.footerText, { color: colors.mutedForeground }]}
            >
              New here?
            </Text>
            <TouchableOpacity onPress={() => router.replace("/sign-up")}>
              <Text style={[styles.footerLink, { color: colors.primary }]}>
                Create an account
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

/** Inline Google "G" logo SVG rendered as a simple colored-block fallback. */
function GoogleIcon() {
  return (
    <View style={styles.googleIconContainer}>
      <Text style={styles.googleIconText}>G</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { paddingHorizontal: 24, gap: 6 },
  closeBtn: { alignSelf: "flex-start", padding: 4, marginBottom: 8 },
  logo: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
    marginBottom: 12,
  },
  title: { fontSize: 26, fontFamily: "Inter_700Bold" },
  subtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
    marginBottom: 12,
  },
  googleBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 13,
    gap: 10,
    marginTop: 8,
    minHeight: 50,
  },
  googleIconContainer: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#4285F4",
    alignItems: "center",
    justifyContent: "center",
  },
  googleIconText: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    lineHeight: 16,
  },
  googleBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginVertical: 4,
  },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  label: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    marginTop: 10,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  error: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    marginTop: 10,
    lineHeight: 18,
  },
  primaryBtn: {
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 18,
  },
  primaryBtnText: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  footerRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
    marginTop: 18,
  },
  footerText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  footerLink: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  appleBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    paddingVertical: 13,
    gap: 10,
    marginTop: 8,
    minHeight: 50,
    backgroundColor: "#000",
  },
  appleBtnText: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
});
