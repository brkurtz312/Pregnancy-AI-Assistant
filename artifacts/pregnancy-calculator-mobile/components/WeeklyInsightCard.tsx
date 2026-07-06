import { Ionicons } from "@expo/vector-icons";
import { useGetWeeklyInsight } from "@workspace/api-client-react";
import * as Haptics from "expo-haptics";
import React, { useEffect } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { useColors } from "@/hooks/useColors";

interface WeeklyInsightCardProps {
  currentWeek: number;
}

export function WeeklyInsightCard({ currentWeek }: WeeklyInsightCardProps) {
  const colors = useColors();
  const week = currentWeek > 0 ? Math.min(42, currentWeek) : null;

  const weekly = useGetWeeklyInsight();

  useEffect(() => {
    if (week == null) return;
    weekly.mutate({ data: { week } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [week]);

  if (week == null) return null;

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <View style={styles.cardHeaderRow}>
        <View style={styles.cardTitleRow}>
          <Ionicons name="sparkles-outline" size={18} color={colors.primary} />
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>
            Your Week {week} Insight
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            weekly.mutate({ data: { week } });
          }}
          disabled={weekly.isPending}
          hitSlop={8}
        >
          <Ionicons
            name="refresh-outline"
            size={18}
            color={weekly.isPending ? colors.mutedForeground : colors.primary}
          />
        </TouchableOpacity>
      </View>

      {weekly.isPending ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>
            Gathering guidance for week {week}…
          </Text>
        </View>
      ) : weekly.isError ? (
        <TouchableOpacity onPress={() => weekly.mutate({ data: { week } })}>
          <Text style={[styles.errorText, { color: colors.mutedForeground }]}>
            Couldn't load this week's insight. Tap to try again.
          </Text>
        </TouchableOpacity>
      ) : weekly.data ? (
        <Text style={[styles.insightText, { color: colors.foreground }]}>
          {weekly.data.insight}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    gap: 12,
    marginTop: 12,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  cardTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  loadingRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  loadingText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  errorText: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  insightText: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 21 },
});
