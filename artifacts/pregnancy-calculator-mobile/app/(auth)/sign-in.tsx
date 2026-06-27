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

const apiBase = process.env.EXPO_PUBLIC_DOMAIN
  ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
  : "";

export default function SignInScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signIn, errors, fetchStatus } = useSignIn();
  const clerk = useClerk();

  const [emailAddress, setEmailAddress] = useState("");
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const [reviewerOpen, setReviewerOpen] = useState(false);
  const [reviewerCode, setReviewerCode] = useState("");
  const [reviewerLoading, setReviewerLoading] = useState(false);
  const [reviewerError, setReviewerError] = useState<string | null>(null);

  const fetching = fetchStatus === "fetching";
  const errorText =
    errors.fields.identifier?.message ??
    errors.fields.password?.message ??
    notice;

  const onSubmit = async () => {
    if (fetching) return;
    setNotice(null);
    const { error } = await signIn.password({
      identifier: emailAddress.trim(),
      password,
    });
    if (error) return;

    await signIn.finalize({
      navigate: ({ session, decorateUrl }) => {
        if (session?.currentTask) return;
        router.replace(decorateUrl("/") as Href);
      },
    });
  };

  const onReviewerSignIn = async () => {
    if (reviewerLoading || !reviewerCode.trim()) return;
    setReviewerError(null);
    setReviewerLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/reviewer/sign-in-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: reviewerCode.trim() }),
      });
      if (!res.ok) {
        setReviewerError("Invalid access code. Please try again.");
        return;
      }
      const { token } = (await res.json()) as { token: string };

      const si = await clerk.client!.signIn.create({
        strategy: "ticket",
        ticket: token,
      });
      await clerk.setActive({ session: si.createdSessionId! });
      router.replace("/" as Href);
    } catch {
      setReviewerError("Sign in failed. Please try again.");
    } finally {
      setReviewerLoading(false);
    }
  };

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
          <Text style={[styles.title, { color: colors.foreground }]}>
            Welcome back
          </Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            Sign in to sync your Full Pregnancy Pass and free questions across
            your devices.
          </Text>

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
            <TouchableOpacity
              onPress={() => router.replace("/sign-up" as Href)}
            >
              <Text style={[styles.footerLink, { color: colors.primary }]}>
                Create an account
              </Text>
            </TouchableOpacity>
          </View>

          {!reviewerOpen && (
            <TouchableOpacity
              style={styles.reviewerToggle}
              onPress={() => setReviewerOpen(true)}
            >
              <Text
                style={[
                  styles.reviewerToggleText,
                  { color: colors.mutedForeground },
                ]}
              >
                Developer / Reviewer Access
              </Text>
            </TouchableOpacity>
          )}

          {reviewerOpen && (
            <View
              style={[
                styles.reviewerBox,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                },
              ]}
            >
              <Text
                style={[styles.reviewerTitle, { color: colors.foreground }]}
              >
                Reviewer Access
              </Text>
              <Text
                style={[styles.reviewerSub, { color: colors.mutedForeground }]}
              >
                Enter the developer access code to sign in as the demo account.
              </Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    borderColor: colors.border,
                    color: colors.foreground,
                    backgroundColor: colors.background,
                    marginTop: 8,
                  },
                ]}
                value={reviewerCode}
                onChangeText={setReviewerCode}
                placeholder="Access code"
                placeholderTextColor={colors.mutedForeground}
                autoCapitalize="none"
                autoCorrect={false}
                onSubmitEditing={onReviewerSignIn}
                returnKeyType="go"
              />
              {reviewerError && (
                <Text style={[styles.error, { color: colors.destructive }]}>
                  {reviewerError}
                </Text>
              )}
              <TouchableOpacity
                style={[
                  styles.primaryBtn,
                  {
                    backgroundColor: colors.primary,
                    opacity: reviewerLoading || !reviewerCode.trim() ? 0.7 : 1,
                    marginTop: 12,
                  },
                ]}
                onPress={onReviewerSignIn}
                disabled={reviewerLoading || !reviewerCode.trim()}
              >
                {reviewerLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryBtnText}>Sign In as Reviewer</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
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
  reviewerToggle: {
    alignItems: "center",
    marginTop: 24,
    paddingVertical: 6,
  },
  reviewerToggleText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  reviewerBox: {
    marginTop: 24,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
  },
  reviewerTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 4,
  },
  reviewerSub: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
});
