import { useSSO, useSignUp } from "@clerk/expo";
import { useSignInWithApple } from "@clerk/expo/apple";
import { Ionicons } from "@expo/vector-icons";
import * as AuthSession from "expo-auth-session";
import Constants from "expo-constants";
import { type Href, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import React, { useCallback, useEffect, useState } from "react";
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
import { isCancelError, logAuthFailure } from "@/lib/auth-cancel";

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

export default function SignUpScreen() {
  useWarmUpBrowser();

  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signUp, errors, fetchStatus } = useSignUp();
  const { startSSOFlow } = useSSO();
  const { startAppleAuthenticationFlow } = useSignInWithApple();

  const [emailAddress, setEmailAddress] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);
  const [appleLoading, setAppleLoading] = useState(false);
  const [appleError, setAppleError] = useState<string | null>(null);

  const fetching = fetchStatus === "fetching";
  const showVerify =
    signUp?.status === "missing_requirements" &&
    signUp?.unverifiedFields.includes("email_address");

  const formError =
    errors.fields.emailAddress?.message ??
    errors.fields.password?.message ??
    notice;
  const codeError = errors.fields.code?.message ?? notice;

  const onCreate = async () => {
    if (fetching) return;
    if (!signUp) {
      setNotice(
        "Sign-up is not ready yet — please wait a moment and try again.",
      );
      return;
    }
    setNotice(null);
    const { error } = await signUp.password({
      emailAddress: emailAddress.trim(),
      password,
    });
    if (error) return;
    await signUp.verifications.sendEmailCode();
  };

  const onVerify = async () => {
    if (fetching) return;
    if (!signUp) {
      setNotice(
        "Sign-up is not ready yet — please wait a moment and try again.",
      );
      return;
    }
    setNotice(null);
    await signUp.verifications.verifyEmailCode({ code });
    if (signUp.status === "complete") {
      await signUp.finalize({
        navigate: () => {
          router.replace("/" as Href);
        },
      });
    }
  };

  const onGooglePress = useCallback(async () => {
    if (googleLoading) return;
    setGoogleLoading(true);
    setGoogleError(null);
    try {
      const appScheme = Constants.expoConfig?.scheme;
      if (!appScheme) {
        console.error(
          "Google sign-up: expo.scheme is not set in app.json — OAuth redirect URI will be incorrect.",
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
        router.replace("/" as Href);
      } else {
        setGoogleError("Sign-in could not be completed — please try again.");
      }
    } catch (err) {
      // Log first, always. A browser that closes without completing the
      // redirect is reported as a dismissal, so a real failure is shaped like
      // the user swiping the sheet away — suppressing the on-screen message is
      // a UX choice, suppressing the record of it is how a bug goes unseen.
      logAuthFailure("Google sign-up", err);
      if (!isCancelError(err)) {
        setGoogleError("Google sign-in failed. Please try again.");
      }
    } finally {
      setGoogleLoading(false);
    }
  }, [googleLoading, startSSOFlow, router]);

  const onApplePress = useCallback(async () => {
    if (appleLoading) return;
    setAppleLoading(true);
    setAppleError(null);
    try {
      // Use the native Apple auth sheet (expo-apple-authentication) via
      // useSignInWithApple. This avoids web OAuth which Apple blocks for
      // custom-scheme redirect URLs.
      const { createdSessionId, setActive } =
        await startAppleAuthenticationFlow();

      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
        router.replace("/" as Href);
      }
      // null createdSessionId means the user cancelled the native Apple sheet
      // (Clerk resolves rather than rejects on cancellation in the native flow).
      // Silently close — no error message needed.
    } catch (err) {
      logAuthFailure("Apple sign-up", err);
      // A dismissed Apple sheet needs no message.
      if (!isCancelError(err)) {
        setAppleError("Apple sign-in failed. Please try again.");
      }
    } finally {
      setAppleLoading(false);
    }
  }, [appleLoading, startAppleAuthenticationFlow, router]);

  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 },
          ]}
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

          {!showVerify ? (
            <>
              <Text style={[styles.title, { color: colors.foreground }]}>
                Create your account
              </Text>
              <Text
                style={[styles.subtitle, { color: colors.mutedForeground }]}
              >
                Save your free questions and unlock the Full Pregnancy Pass on
                every device.
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
                      style={[
                        styles.googleBtnText,
                        { color: colors.foreground },
                      ]}
                    >
                      Continue with Google
                    </Text>
                  </>
                )}
              </TouchableOpacity>

              {googleError && (
                <Text style={[styles.error, { color: colors.destructive }]}>
                  {googleError}
                </Text>
              )}

              {/* Apple SSO must remain visible as an equivalent iOS sign-in option.
                  The next archive includes the matching native module, while an
                  invalid archive fails visibly instead of silently hiding Apple. */}
              {Platform.OS === "ios" && (
                <TouchableOpacity
                  style={[styles.appleBtn, { opacity: appleLoading ? 0.7 : 1 }]}
                  onPress={onApplePress}
                  disabled={appleLoading}
                  testID="sign-up-with-apple"
                  accessibilityRole="button"
                  accessibilityLabel="Sign in with Apple"
                >
                  {appleLoading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="logo-apple" size={20} color="#fff" />
                      <Text style={styles.appleBtnText}>
                        Sign in with Apple
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              )}

              {appleError && (
                <Text style={[styles.error, { color: colors.destructive }]}>
                  {appleError}
                </Text>
              )}

              {/* Divider */}
              <View style={styles.dividerRow}>
                <View
                  style={[
                    styles.dividerLine,
                    { backgroundColor: colors.border },
                  ]}
                />
                <Text
                  style={[
                    styles.dividerText,
                    { color: colors.mutedForeground },
                  ]}
                >
                  or
                </Text>
                <View
                  style={[
                    styles.dividerLine,
                    { backgroundColor: colors.border },
                  ]}
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
                placeholder="Create a password"
                placeholderTextColor={colors.mutedForeground}
                secureTextEntry
                autoComplete="new-password"
                onSubmitEditing={onCreate}
                returnKeyType="go"
              />

              {formError && (
                <Text style={[styles.error, { color: colors.destructive }]}>
                  {formError}
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
                onPress={onCreate}
                disabled={fetching || !emailAddress || !password}
              >
                {fetching ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryBtnText}>Create Account</Text>
                )}
              </TouchableOpacity>

              <View style={styles.footerRow}>
                <Text
                  style={[styles.footerText, { color: colors.mutedForeground }]}
                >
                  Already have an account?
                </Text>
                <TouchableOpacity
                  onPress={() => router.replace("/sign-in" as Href)}
                >
                  <Text style={[styles.footerLink, { color: colors.primary }]}>
                    Sign in
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Required for Clerk's bot sign-up protection */}
              <View nativeID="clerk-captcha" />
            </>
          ) : (
            <>
              <Text style={[styles.title, { color: colors.foreground }]}>
                Verify your email
              </Text>
              <Text
                style={[styles.subtitle, { color: colors.mutedForeground }]}
              >
                We sent a 6-digit code to {emailAddress.trim()}. Enter it below
                to finish.
              </Text>

              <Text style={[styles.label, { color: colors.foreground }]}>
                Verification code
              </Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    borderColor: colors.border,
                    color: colors.foreground,
                    backgroundColor: colors.card,
                    letterSpacing: 6,
                  },
                ]}
                value={code}
                onChangeText={setCode}
                placeholder="123456"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="number-pad"
                inputMode="numeric"
                maxLength={6}
                onSubmitEditing={onVerify}
                returnKeyType="go"
              />

              {codeError && (
                <Text style={[styles.error, { color: colors.destructive }]}>
                  {codeError}
                </Text>
              )}

              <TouchableOpacity
                style={[
                  styles.primaryBtn,
                  {
                    backgroundColor: colors.primary,
                    opacity: fetching || code.length === 0 ? 0.7 : 1,
                  },
                ]}
                onPress={onVerify}
                disabled={fetching || code.length === 0}
              >
                {fetching ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryBtnText}>Verify & Continue</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.resendBtn}
                onPress={() => signUp?.verifications.sendEmailCode()}
              >
                <Text style={[styles.footerLink, { color: colors.primary }]}>
                  Resend code
                </Text>
              </TouchableOpacity>
              <Text
                style={[styles.spamNote, { color: colors.mutedForeground }]}
              >
                Can't find it? Check your spam or junk folder.
              </Text>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

/** Inline Google "G" logo rendered as a simple colored-block. */
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
  closeBtn: { alignSelf: "flex-end", padding: 4 },
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
  resendBtn: { alignItems: "center", marginTop: 16 },
  spamNote: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    marginTop: 10,
  },
});
