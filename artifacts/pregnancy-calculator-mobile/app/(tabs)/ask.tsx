import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@clerk/expo";
import { useRouter, useLocalSearchParams, type Href } from "expo-router";
import React, { useMemo } from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AccountButton } from "@/components/AccountButton";
import { AiAssistant } from "@/components/AiAssistant";
import {
  useGetProfile,
  getGetProfileQueryKey,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { calculateByDueDate } from "@/lib/pregnancy-math";

export default function AskScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { isSignedIn } = useAuth();
  const router = useRouter();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();

  const { data: profile } = useGetProfile({
    query: { enabled: !!isSignedIn, queryKey: getGetProfileQueryKey() },
  });

  const currentWeek = useMemo(() => {
    if (!profile?.dueDate) return 0;
    try {
      const r = calculateByDueDate(new Date(profile.dueDate));
      return r?.currentGestationalAgeWeeks ?? 0;
    } catch {
      return 0;
    }
  }, [profile]);

  const topPad = isWeb ? 67 : insets.top;
  const bottomPad = isWeb ? 34 : insets.bottom + 16;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: bottomPad + 24 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View
          style={[
            styles.header,
            { backgroundColor: colors.primary, paddingTop: topPad + 16 },
          ]}
        >
          <View style={[styles.headerAccount, { top: topPad + 12 }]}>
            <AccountButton />
          </View>
          <View style={styles.headerIcon}>
            <Ionicons
              name="chatbubble-ellipses"
              size={26}
              color={colors.primary}
            />
          </View>
          <Text style={styles.headerTitle}>Ask a Question</Text>
          <Text style={styles.headerSubtitle}>
            Get evidence-based answers about your pregnancy
          </Text>
        </View>

        <View style={styles.content}>
          {!isSignedIn ? (
            <View
              style={[
                styles.signInCard,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <View style={styles.signInIconWrap}>
                <Ionicons
                  name="chatbubble-ellipses-outline"
                  size={52}
                  color={colors.primary}
                />
              </View>
              <Text style={[styles.signInTitle, { color: colors.foreground }]}>
                Sign in to ask questions
              </Text>
              <Text
                style={[styles.signInBody, { color: colors.mutedForeground }]}
              >
                Get evidence-based answers about your pregnancy from our AI
                assistant — personalised to your week.
              </Text>
              <TouchableOpacity
                onPress={() => router.push("/(auth)/sign-in")}
                style={[styles.signInBtn, { backgroundColor: colors.primary }]}
              >
                <Ionicons name="log-in-outline" size={18} color="#fff" />
                <Text style={styles.signInBtnText}>Sign In</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {returnTo && (
                <TouchableOpacity
                  style={[
                    styles.returnCard,
                    {
                      backgroundColor: colors.card,
                      borderColor: colors.border,
                    },
                  ]}
                  onPress={() => router.push(returnTo as Href)}
                >
                  <Ionicons
                    name="arrow-back-circle-outline"
                    size={18}
                    color={colors.primary}
                  />
                  <Text style={[styles.returnText, { color: colors.primary }]}>
                    Back to prenatal testing info
                  </Text>
                </TouchableOpacity>
              )}
              {!profile?.dueDate && (
                <View
                  style={[
                    styles.hintCard,
                    {
                      backgroundColor: colors.card,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <Ionicons
                    name="information-circle-outline"
                    size={16}
                    color={colors.mutedForeground}
                  />
                  <Text
                    style={[styles.hintText, { color: colors.mutedForeground }]}
                  >
                    Set your due date on the Home tab to get week-specific
                    answers, or ask a general question below.
                  </Text>
                </View>
              )}
              <AiAssistant currentWeek={currentWeek} />
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    alignItems: "center",
    paddingBottom: 32,
    paddingHorizontal: 24,
  },
  headerAccount: {
    position: "absolute",
    right: 20,
    zIndex: 10,
  },
  headerIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(255,255,255,0.9)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
    color: "#fff",
    textAlign: "center",
  },
  headerSubtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.8)",
    marginTop: 4,
    textAlign: "center",
  },
  content: { padding: 16, gap: 12 },
  returnCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
  returnText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  hintCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
  hintText: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 17,
  },
  signInCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
    alignItems: "center",
    gap: 12,
    marginTop: 8,
  },
  signInIconWrap: {
    marginBottom: 4,
  },
  signInTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  signInBody: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
  },
  signInBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
    marginTop: 4,
  },
  signInBtnText: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
});
