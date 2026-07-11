import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import {
  BIRTH_PLAN_SECTIONS,
  buildBirthPlanHtml,
  loadBirthPlanAnswers,
  type BirthPlanAnswers,
  type BirthPlanField,
  type BirthPlanValue,
} from "@/lib/birth-plan";

function fieldAnswerText(field: BirthPlanField, value: BirthPlanValue) {
  if (value === undefined || value === null || value === "") return null;
  if (field.type === "boolean") return value ? "Yes" : "No";
  if (field.type === "multi" && Array.isArray(value)) {
    if (!value.length) return null;
    return value
      .map((v) => field.options?.find((o) => o.value === v)?.label ?? v)
      .join(", ");
  }
  if (field.type === "single" && typeof value === "string") {
    return field.options?.find((o) => o.value === value)?.label ?? value;
  }
  return String(value);
}

export default function BirthPlanSummaryScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ from?: string }>();
  const backLabel = params.from || "Birth Plan";

  const [answers, setAnswers] = useState<BirthPlanAnswers>({});
  const [loaded, setLoaded] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    loadBirthPlanAnswers().then((a) => {
      setAnswers(a);
      setLoaded(true);
    });
  }, []);

  const handleExport = async () => {
    try {
      setExporting(true);
      const html = buildBirthPlanHtml(answers);
      if (Platform.OS === "web") {
        Alert.alert(
          "Not available on web",
          "PDF export is available on the mobile app.",
        );
        return;
      }
      const { uri } = await Print.printToFileAsync({ html });
      router.push({
        pathname: "/pdf-viewer",
        params: { uri, title: "My Birth Plan", shareTitle: "My Birth Plan" },
      });
    } catch {
      Alert.alert("Couldn't export", "Please try again.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + 12, borderBottomColor: colors.border },
        ]}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.backBtn}
        >
          <Ionicons name="chevron-back" size={22} color={colors.foreground} />
          <Text style={[styles.backText, { color: colors.foreground }]}>
            {backLabel}
          </Text>
        </TouchableOpacity>
      </View>

      {!loaded ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingBottom: insets.bottom + 32 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <Animated.View entering={FadeInDown.duration(400)}>
            <Text style={[styles.pageTitle, { color: colors.foreground }]}>
              My Birth Plan
            </Text>
            <Text style={[styles.pageSub, { color: colors.mutedForeground }]}>
              Review this with your ob-gyn or bring it up for hospital staff
            </Text>
          </Animated.View>

          {BIRTH_PLAN_SECTIONS.map((section, sIndex) => {
            const rows = section.fields
              .map((field) => ({
                field,
                text: fieldAnswerText(field, answers[field.id]),
              }))
              .filter((r) => r.text !== null);

            return (
              <Animated.View
                key={section.id}
                entering={FadeInDown.delay(60 + sIndex * 40).duration(400)}
                style={[
                  styles.card,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <Text
                  style={[styles.sectionTitle, { color: colors.foreground }]}
                >
                  {section.title}
                </Text>
                {rows.length ? (
                  rows.map(({ field, text }) => (
                    <View key={field.id} style={styles.row}>
                      <Text
                        style={[
                          styles.rowLabel,
                          { color: colors.mutedForeground },
                        ]}
                      >
                        {field.label}
                      </Text>
                      <Text
                        style={[styles.rowValue, { color: colors.foreground }]}
                      >
                        {text}
                      </Text>
                    </View>
                  ))
                ) : (
                  <Text
                    style={[styles.empty, { color: colors.mutedForeground }]}
                  >
                    Not answered yet.
                  </Text>
                )}
              </Animated.View>
            );
          })}

          <TouchableOpacity
            style={[styles.exportBtn, { backgroundColor: colors.primary }]}
            onPress={handleExport}
            disabled={exporting}
          >
            {exporting ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : (
              <>
                <Ionicons
                  name="document-text-outline"
                  size={18}
                  color={colors.primaryForeground}
                />
                <Text
                  style={[
                    styles.exportBtnText,
                    { color: colors.primaryForeground },
                  ]}
                >
                  View PDF
                </Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.editBtn,
              { borderColor: colors.primary, backgroundColor: colors.card },
            ]}
            onPress={() => router.back()}
          >
            <Ionicons name="create-outline" size={18} color={colors.primary} />
            <Text style={[styles.editBtnText, { color: colors.primary }]}>
              Edit My Answers
            </Text>
          </TouchableOpacity>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
  },
  backText: {
    fontSize: 16,
    fontFamily: "Inter_500Medium",
    marginLeft: 2,
  },
  scroll: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  pageTitle: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
    marginBottom: 4,
  },
  pageSub: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    marginBottom: 20,
  },
  card: {
    borderRadius: 18,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
  },
  sectionTitle: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 10,
  },
  row: {
    marginBottom: 10,
  },
  rowLabel: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    marginBottom: 2,
  },
  rowValue: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    lineHeight: 20,
  },
  empty: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  exportBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 12,
    paddingVertical: 16,
    marginTop: 4,
    marginBottom: 12,
  },
  exportBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  editBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 12,
    paddingVertical: 14,
    borderWidth: 1.5,
    marginBottom: 8,
  },
  editBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
});
