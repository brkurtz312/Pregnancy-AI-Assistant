import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@clerk/expo";
import React, { useMemo } from "react";
import { Platform, ScrollView, StyleSheet, Text, View } from "react-native";
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
          {!profile?.dueDate && (
            <View
              style={[
                styles.hintCard,
                { backgroundColor: colors.card, borderColor: colors.border },
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
                Set your due date on the Home tab to get week-specific answers,
                or ask a general question below.
              </Text>
            </View>
          )}
          <AiAssistant currentWeek={currentWeek} />
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
});
