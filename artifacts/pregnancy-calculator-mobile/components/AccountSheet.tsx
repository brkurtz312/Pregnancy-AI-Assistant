import { useAuth, useUser } from "@clerk/expo";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { usePass } from "@/hooks/usePass";

const PASS_PRICE = "$24.99";

export function AccountSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isSignedIn, signOut } = useAuth();
  const { user } = useUser();
  const pass = usePass();

  const goTo = (path: "/sign-in" | "/sign-up") => {
    onClose();
    router.push(path);
  };

  const email =
    user?.primaryEmailAddress?.emailAddress ??
    user?.emailAddresses?.[0]?.emailAddress ??
    "Signed in";

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View
        style={[
          styles.sheet,
          {
            backgroundColor: colors.background,
            borderColor: colors.border,
            paddingBottom: insets.bottom + 20,
          },
        ]}
      >
        <View style={styles.handle} />

        <View style={styles.headerRow}>
          <Text style={[styles.heading, { color: colors.foreground }]}>
            {isSignedIn ? "Your Account" : "Account"}
          </Text>
          <TouchableOpacity onPress={onClose} hitSlop={10}>
            <Ionicons name="close" size={24} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>

        {!isSignedIn ? (
          <View style={styles.section}>
            <Text style={[styles.body, { color: colors.mutedForeground }]}>
              Sign in to track your free AI questions and unlock the Full
              Pregnancy Pass — purchases follow your account across web and
              mobile.
            </Text>
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
              onPress={() => goTo("/sign-in")}
            >
              <Text style={styles.primaryBtnText}>Sign In</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.secondaryBtn,
                { borderColor: colors.border, backgroundColor: colors.card },
              ]}
              onPress={() => goTo("/sign-up")}
            >
              <Text
                style={[styles.secondaryBtnText, { color: colors.foreground }]}
              >
                Create Account
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.section}>
            <View style={styles.emailRow}>
              <Ionicons
                name="person-circle-outline"
                size={22}
                color={colors.mutedForeground}
              />
              <Text
                style={[styles.email, { color: colors.foreground }]}
                numberOfLines={1}
              >
                {email}
              </Text>
            </View>

            {pass.isLoading ? (
              <View
                style={[
                  styles.statusCard,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : pass.hasPass ? (
              <View
                style={[
                  styles.statusCard,
                  { backgroundColor: colors.card, borderColor: colors.primary },
                ]}
              >
                <View style={styles.statusTitleRow}>
                  <Ionicons name="sparkles" size={18} color={colors.primary} />
                  <Text
                    style={[styles.statusTitle, { color: colors.foreground }]}
                  >
                    Full Pregnancy Pass active
                  </Text>
                </View>
                <Text
                  style={[styles.statusBody, { color: colors.mutedForeground }]}
                >
                  You have unlimited AI questions on every device.
                </Text>
              </View>
            ) : (
              <View
                style={[
                  styles.statusCard,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <View style={styles.statusTitleRow}>
                  <Ionicons
                    name="chatbubble-ellipses-outline"
                    size={18}
                    color={colors.primary}
                  />
                  <Text
                    style={[styles.statusTitle, { color: colors.foreground }]}
                  >
                    Free plan
                  </Text>
                </View>
                <Text
                  style={[styles.statusBody, { color: colors.mutedForeground }]}
                >
                  {pass.freeRemaining} of {pass.freeLimit} free AI questions
                  left this week.
                </Text>
                <TouchableOpacity
                  style={[
                    styles.primaryBtn,
                    { backgroundColor: colors.primary },
                  ]}
                  onPress={pass.startCheckout}
                  disabled={pass.isStartingCheckout}
                >
                  {pass.isStartingCheckout ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.primaryBtnText}>
                      Get the Pass — {PASS_PRICE}
                    </Text>
                  )}
                </TouchableOpacity>
                <Text
                  style={[styles.fineprint, { color: colors.mutedForeground }]}
                >
                  Unlimited AI questions, forever. One-time purchase.
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={styles.signOutBtn}
              onPress={async () => {
                await signOut();
                pass.refresh();
                onClose();
              }}
            >
              <Ionicons
                name="log-out-outline"
                size={18}
                color={colors.destructive}
              />
              <Text style={[styles.signOutText, { color: colors.destructive }]}>
                Sign Out
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 24,
    paddingTop: 10,
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(128,128,128,0.4)",
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  heading: { fontSize: 20, fontFamily: "Inter_700Bold" },
  section: { gap: 12 },
  body: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },
  emailRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  email: { flex: 1, fontSize: 15, fontFamily: "Inter_500Medium" },
  statusCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    gap: 10,
  },
  statusTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  statusTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  statusBody: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  primaryBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryBtnText: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  secondaryBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1,
  },
  secondaryBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  fineprint: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  signOutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
  },
  signOutText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
