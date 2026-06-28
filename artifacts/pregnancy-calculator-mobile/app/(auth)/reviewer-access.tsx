import { useSignIn } from "@clerk/expo";
import { Ionicons } from "@expo/vector-icons";
import { type Href, useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
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

export default function ReviewerAccessScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signIn } = useSignIn();

  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSignIn = async () => {
    if (loading || !code.trim()) return;
    setError(null);
    setLoading(true);
    try {
      // 1. Validate the access code and get a Clerk sign-in token
      const res = await fetch(`${apiBase}/api/reviewer/sign-in-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });
      if (!res.ok) {
        if (res.status === 401) {
          setError("Invalid access code. Please try again.");
        } else {
          setError("Sign-in service unavailable. Please try again later.");
        }
        return;
      }
      const { token } = (await res.json()) as { token: string };

      // 2. Redeem the sign-in token (ticket strategy bypasses password auth
      //    and client-trust checks entirely)
      const { error: ticketError } = await signIn.create({
        strategy: "ticket",
        ticket: token,
      });
      if (ticketError) {
        const msg =
          ticketError &&
          typeof ticketError === "object" &&
          "message" in ticketError &&
          typeof (ticketError as { message: unknown }).message === "string"
            ? (ticketError as { message: string }).message
            : JSON.stringify(ticketError);
        console.error("[reviewer-access] ticket sign-in error:", ticketError);
        setError(`Sign in failed: ${msg}`);
        return;
      }

      // 3. Finalize (ticket strategy always completes in one step)
      if (signIn.status === "complete") {
        await signIn.finalize({
          navigate: ({ session, decorateUrl }) => {
            if (session?.currentTask) return;
            router.replace(decorateUrl("/") as Href);
          },
        });
      } else {
        console.error("[reviewer-access] unexpected sign-in status:", signIn.status);
        setError(`Unexpected sign-in state: ${signIn.status ?? "unknown"}`);
      }
    } catch (err) {
      console.error("[reviewer-access] sign-in threw:", err);
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === "object"
            ? JSON.stringify(err)
            : String(err);
      setError(`Error: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 300 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          hitSlop={12}
        >
          <Ionicons
            name="arrow-back"
            size={24}
            color={colors.mutedForeground}
          />
        </TouchableOpacity>

        <Text style={[styles.heading, { color: colors.foreground }]}>
          Developer / Reviewer Access
        </Text>
        <Text style={[styles.sub, { color: colors.mutedForeground }]}>
          Enter the access code provided in your review notes.
        </Text>

        <Text style={[styles.label, { color: colors.foreground }]}>
          Access code
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
          placeholder="Enter access code"
          placeholderTextColor={colors.mutedForeground}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="go"
          onSubmitEditing={onSignIn}
        />

        {error ? (
          <Text style={[styles.error, { color: colors.destructive }]}>
            {error}
          </Text>
        ) : null}

        <TouchableOpacity
          style={[
            styles.btn,
            {
              backgroundColor: colors.primary,
              opacity: loading || !code.trim() ? 0.7 : 1,
            },
          ]}
          onPress={onSignIn}
          disabled={loading || !code.trim()}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnText}>Sign In as Reviewer</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: 24,
    gap: 8,
  },
  backBtn: {
    alignSelf: "flex-start",
    padding: 4,
    marginBottom: 16,
  },
  heading: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    marginBottom: 4,
  },
  sub: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
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
    lineHeight: 18,
  },
  btn: {
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 12,
  },
  btnText: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
});
