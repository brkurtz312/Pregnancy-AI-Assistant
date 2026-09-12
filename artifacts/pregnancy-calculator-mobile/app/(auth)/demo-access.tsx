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
import { setDemoToken } from "@/lib/demo-session";

const apiBase = process.env.EXPO_PUBLIC_DOMAIN
  ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
  : "";

/**
 * App Review demo entry.
 *
 * Exchanges the review access code for a demo session token, bypassing Clerk
 * entirely. Clerk's instance-wide MFA requirement means a reviewer can never
 * complete a password sign-in (they cannot read the demo mailbox to get the
 * emailed second-factor code), so this is the only reviewer path that works.
 */
export default function DemoAccessScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    const trimmed = code.trim();
    if (busy || !trimmed) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/api/demo/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: trimmed }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(body?.error ?? "Could not start the demo session.");
        return;
      }
      const { token } = (await res.json()) as { token: string };
      await setDemoToken(token);
      router.replace("/" as Href);
    } catch {
      setError("Network error. Please check the connection and try again.");
    } finally {
      setBusy(false);
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
            accessibilityLabel="Close"
          >
            <Ionicons name="close" size={26} color={colors.mutedForeground} />
          </TouchableOpacity>

          <View style={[styles.logo, { backgroundColor: "#0071e3" }]}>
            <Ionicons name="shield-checkmark" size={28} color="#fff" />
          </View>
          <Text style={[styles.title, { color: colors.foreground }]}>
            App Review Access
          </Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            Enter the access code from the App Review notes to open the full app
            with all features unlocked. No account or email is required.
          </Text>

          <Text style={[styles.label, { color: colors.foreground }]}>
            Access code
          </Text>
          <TextInput
            testID="input-demo-access-code"
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
            placeholder="Access code"
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
            onSubmitEditing={onSubmit}
            returnKeyType="go"
          />

          {error ? (
            <Text style={styles.error} testID="text-demo-access-error">
              {error}
            </Text>
          ) : null}

          <TouchableOpacity
            testID="button-demo-access-submit"
            style={[
              styles.submit,
              { backgroundColor: "#0071e3", opacity: busy || !code ? 0.7 : 1 },
            ]}
            onPress={onSubmit}
            disabled={busy || !code}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitText}>Open Demo</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: {
    paddingHorizontal: 24,
    maxWidth: 520,
    width: "100%",
    alignSelf: "center",
  },
  closeBtn: { alignSelf: "flex-start", padding: 4, marginBottom: 8 },
  logo: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  title: { fontSize: 28, fontWeight: "700", marginBottom: 8 },
  subtitle: { fontSize: 15, lineHeight: 21, marginBottom: 28 },
  label: { fontSize: 14, fontWeight: "600", marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 12,
  },
  error: { color: "#c0392b", fontSize: 14, marginBottom: 12 },
  submit: {
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 4,
  },
  submitText: { color: "#fff", fontSize: 17, fontWeight: "600" },
});
