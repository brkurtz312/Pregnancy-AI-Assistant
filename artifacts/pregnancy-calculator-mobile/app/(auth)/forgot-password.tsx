import { useClerk, useSignIn } from "@clerk/expo";
import { Ionicons } from "@expo/vector-icons";
import { type Href, useRouter } from "expo-router";
import React, { useState } from "react";
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
import {
  clerkErrorMessage,
  globalClerkErrorText,
  logClerkFailure,
} from "@/lib/clerk-errors";

type ResetStep = "email" | "code" | "password";

function getErrorMessage(error: unknown, fallback: string) {
  const clerkError = error as {
    errors?: Array<{ longMessage?: string; message?: string }>;
  };
  return (
    clerkError?.errors?.[0]?.longMessage ??
    clerkError?.errors?.[0]?.message ??
    fallback
  );
}

export default function ForgotPasswordScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signIn, errors, fetchStatus } = useSignIn();
  const { setActive } = useClerk();

  const [step, setStep] = useState<ResetStep>("email");
  const [emailAddress, setEmailAddress] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const fetching = fetchStatus === "fetching";
  const errorText =
    errors.fields.identifier?.message ??
    errors.fields.code?.message ??
    errors.fields.password?.message ??
    notice ??
    globalClerkErrorText(errors);

  const sendCode = async () => {
    if (fetching) return;
    if (!emailAddress.trim()) {
      setNotice("Enter your email address first.");
      return;
    }
    if (!signIn) {
      setNotice(
        "Password recovery is not ready yet — please wait a moment and try again.",
      );
      return;
    }

    setNotice(null);
    try {
      const { error: createError } = await signIn.create({
        identifier: emailAddress.trim(),
      });
      if (createError) return;

      const { error: sendCodeError } =
        await signIn.resetPasswordEmailCode.sendCode();
      if (sendCodeError) return;

      setStep("code");
    } catch (error) {
      setNotice(
        getErrorMessage(
          error,
          "We could not send a password-reset code. Try again.",
        ),
      );
    }
  };

  const verifyCode = async () => {
    if (fetching || !signIn) return;
    if (!code.trim()) {
      setNotice("Enter the code from your email.");
      return;
    }

    setNotice(null);
    try {
      const { error } = await signIn.resetPasswordEmailCode.verifyCode({
        code: code.trim(),
      });
      if (error) {
        logClerkFailure("Reset code verification", error);
        setNotice(
          clerkErrorMessage(
            error,
            "That code could not be verified. Try again.",
          ),
        );
        return;
      }
      setStep("password");
    } catch (error) {
      setNotice(
        getErrorMessage(error, "That code could not be verified. Try again."),
      );
    }
  };

  const updatePassword = async () => {
    if (fetching || !signIn) return;
    if (!password) {
      setNotice("Create a new password.");
      return;
    }

    setNotice(null);
    try {
      const { error } = await signIn.resetPasswordEmailCode.submitPassword({
        password,
        signOutOfOtherSessions: true,
      });
      if (error) {
        logClerkFailure("Password reset", error);
        setNotice(
          clerkErrorMessage(
            error,
            "That password could not be set. Please try again.",
          ),
        );
        return;
      }

      if (signIn.status !== "complete") {
        setNotice("Password updated. Please sign in with your new password.");
        router.replace("/sign-in");
        return;
      }

      const { error: finalizeError } = await signIn.finalize({
        navigate: async ({ session }) => {
          if (session?.id && setActive) {
            await setActive({ session: session.id });
            router.replace("/" as Href);
            return;
          }
          router.replace("/sign-in");
        },
      });
      if (finalizeError) return;
    } catch (error) {
      setNotice(
        getErrorMessage(error, "We could not update your password. Try again."),
      );
    }
  };

  const title =
    step === "email"
      ? "Reset your password"
      : step === "code"
        ? "Check your email"
        : "Choose a new password";
  const subtitle =
    step === "email"
      ? "Enter the email address for your existing account."
      : step === "code"
        ? `Enter the code we sent to ${emailAddress.trim()}.`
        : "Create a new password for your account.";
  const buttonLabel =
    step === "email"
      ? "Send Reset Code"
      : step === "code"
        ? "Verify Code"
        : "Update Password";
  const canContinue =
    step === "email"
      ? !!emailAddress.trim()
      : step === "code"
        ? !!code.trim()
        : !!password;
  const onContinue =
    step === "email" ? sendCode : step === "code" ? verifyCode : updatePassword;

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
            accessibilityRole="button"
            accessibilityLabel="Back to sign in"
          >
            <Ionicons
              name="arrow-back"
              size={24}
              color={colors.mutedForeground}
            />
          </TouchableOpacity>

          <View style={[styles.logo, { backgroundColor: colors.primary }]}>
            <Ionicons name="key-outline" size={26} color="#fff" />
          </View>
          <Text style={[styles.title, { color: colors.foreground }]}>
            {title}
          </Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            {subtitle}
          </Text>

          {step === "email" && (
            <>
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
                testID="password-reset-email"
              />
            </>
          )}

          {step === "code" && (
            <>
              <Text style={[styles.label, { color: colors.foreground }]}>
                Reset code
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
                value={code}
                onChangeText={setCode}
                placeholder="Enter the code"
                placeholderTextColor={colors.mutedForeground}
                autoCapitalize="none"
                autoComplete="one-time-code"
                keyboardType="number-pad"
                inputMode="numeric"
                testID="password-reset-code"
              />
            </>
          )}

          {step === "password" && (
            <>
              <Text style={[styles.label, { color: colors.foreground }]}>
                New password
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
                placeholder="Create a new password"
                placeholderTextColor={colors.mutedForeground}
                secureTextEntry
                autoComplete="new-password"
                onSubmitEditing={updatePassword}
                returnKeyType="go"
                testID="password-reset-new-password"
              />
            </>
          )}

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
                opacity: fetching || !canContinue ? 0.7 : 1,
              },
            ]}
            onPress={onContinue}
            disabled={fetching || !canContinue}
          >
            {fetching ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>{buttonLabel}</Text>
            )}
          </TouchableOpacity>

          {step === "code" && (
            <TouchableOpacity
              style={styles.resendLink}
              onPress={sendCode}
              disabled={fetching}
            >
              <Text style={[styles.linkText, { color: colors.primary }]}>
                Send a new code
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.signInLink}
            onPress={() => router.replace("/sign-in")}
          >
            <Text style={[styles.linkText, { color: colors.primary }]}>
              Back to sign in
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
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
  resendLink: {
    alignSelf: "center",
    paddingVertical: 8,
    marginTop: 2,
  },
  signInLink: {
    alignSelf: "center",
    paddingVertical: 10,
    marginTop: 8,
  },
  linkText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
});
