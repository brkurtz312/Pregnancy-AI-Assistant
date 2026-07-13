import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@clerk/expo";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState, useEffect, useCallback } from "react";
import {
  Alert,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  getGetProfileQueryKey,
  useGetProfile,
  useListSymptoms,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import {
  loadQuestions,
  saveQuestions,
  type QuestionItem,
} from "@/lib/visit-questions";
import {
  loadOfficeChecklist,
  saveOfficeChecklist,
  type ChecklistItem,
} from "@/lib/location-mode";

function formatPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

function formatSymptomTime(iso: string | Date) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function InOfficeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { isSignedIn } = useAuth();

  const { data: profile } = useGetProfile({
    query: { enabled: !!isSignedIn, queryKey: getGetProfileQueryKey() },
  });

  const { data: symptomsData } = useListSymptoms({
    limit: 5,
    offset: 0,
  });
  const symptoms = symptomsData?.items ?? [];

  const [questions, setQuestions] = useState<QuestionItem[]>([]);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [newQuestion, setNewQuestion] = useState("");
  const [addingQuestion, setAddingQuestion] = useState(false);

  useEffect(() => {
    loadQuestions().then(setQuestions);
    loadOfficeChecklist().then(setChecklist);
  }, []);

  const toggleQuestion = useCallback(
    async (id: string) => {
      const updated = questions.map((q) =>
        q.id === id ? { ...q, selected: !q.selected } : q,
      );
      setQuestions(updated);
      await saveQuestions(updated);
    },
    [questions],
  );

  const addQuestion = useCallback(async () => {
    const text = newQuestion.trim();
    if (!text) return;
    const updated: QuestionItem[] = [
      ...questions,
      {
        id: `custom-${Date.now()}`,
        text,
        selected: true,
        custom: true,
      },
    ];
    setQuestions(updated);
    await saveQuestions(updated);
    setNewQuestion("");
    setAddingQuestion(false);
  }, [newQuestion, questions]);

  const removeQuestion = useCallback(
    async (id: string) => {
      const updated = questions.filter((q) => q.id !== id);
      setQuestions(updated);
      await saveQuestions(updated);
    },
    [questions],
  );

  const toggleChecklist = useCallback(
    async (id: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const updated = checklist.map((c) =>
        c.id === id ? { ...c, checked: !c.checked } : c,
      );
      setChecklist(updated);
      await saveOfficeChecklist(updated);
    },
    [checklist],
  );

  const resetChecklist = useCallback(async () => {
    Alert.alert("Reset Checklist", "Uncheck all items?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Reset",
        onPress: async () => {
          const updated = checklist.map((c) => ({ ...c, checked: false }));
          setChecklist(updated);
          await saveOfficeChecklist(updated);
        },
      },
    ]);
  }, [checklist]);

  const providerPhone = profile?.providerPhone ?? "";
  const providerName = profile?.providerName ?? "Your Provider";
  const providerAddress = profile?.providerAddress ?? "";
  const checkedCount = checklist.filter((c) => c.checked).length;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            backgroundColor: colors.primary,
            paddingTop: (Platform.OS === "web" ? 16 : insets.top) + 16,
          },
        ]}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.backBtn}
        >
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerBadge}>
          <Ionicons name="medical-outline" size={14} color={colors.primary} />
          <Text style={[styles.headerBadgeText, { color: colors.primary }]}>
            In-Office Mode
          </Text>
        </View>
        <Text style={styles.headerTitle}>{providerName}</Text>
        {providerAddress ? (
          <Text style={styles.headerSub} numberOfLines={1}>
            {providerAddress}
          </Text>
        ) : null}
        {providerPhone ? (
          <TouchableOpacity
            style={styles.callChip}
            onPress={() =>
              Linking.openURL(`tel:${providerPhone.replace(/\D/g, "")}`)
            }
          >
            <Ionicons name="call-outline" size={14} color="#fff" />
            <Text style={styles.callChipText}>
              {formatPhone(providerPhone)}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: insets.bottom + 40 },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Quick Actions */}
        <Animated.View
          entering={FadeInDown.delay(40).duration(350)}
          style={styles.quickRow}
        >
          <TouchableOpacity
            style={[
              styles.quickBtn,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
            onPress={() => router.push("/office-visit")}
          >
            <Ionicons name="mic-outline" size={20} color={colors.primary} />
            <Text style={[styles.quickLabel, { color: colors.foreground }]}>
              Visit Scribe
            </Text>
            <Text style={[styles.quickSub, { color: colors.mutedForeground }]}>
              Record notes
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.quickBtn,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
            onPress={() => router.push("/birth-plan")}
          >
            <Ionicons
              name="document-text-outline"
              size={20}
              color={colors.primary}
            />
            <Text style={[styles.quickLabel, { color: colors.foreground }]}>
              Birth Plan
            </Text>
            <Text style={[styles.quickSub, { color: colors.mutedForeground }]}>
              Review with doctor
            </Text>
          </TouchableOpacity>
        </Animated.View>

        {/* Schedule Next Appointment */}
        <Animated.View entering={FadeInDown.delay(60).duration(350)}>
          <TouchableOpacity
            style={[
              styles.scheduleCard,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
              },
            ]}
            onPress={() => router.push("/office-visit")}
          >
            <View
              style={[
                styles.scheduleIconWrap,
                { backgroundColor: colors.primary + "18" },
              ]}
            >
              <Ionicons
                name="calendar-outline"
                size={20}
                color={colors.primary}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={[styles.scheduleTitle, { color: colors.foreground }]}
              >
                Schedule Next Appointment
              </Text>
              <Text
                style={[styles.scheduleSub, { color: colors.mutedForeground }]}
              >
                Add a future visit and get a day-before reminder
              </Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={colors.mutedForeground}
            />
          </TouchableOpacity>
        </Animated.View>

        {/* Pre-Visit Checklist */}
        <Animated.View entering={FadeInDown.delay(80).duration(350)}>
          <View
            style={[
              styles.card,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <View style={styles.cardHeader}>
              <View style={styles.cardTitleRow}>
                <Ionicons
                  name="checkmark-circle-outline"
                  size={18}
                  color={colors.primary}
                />
                <Text style={[styles.cardTitle, { color: colors.foreground }]}>
                  Before You Go In
                </Text>
              </View>
              <View style={styles.progressPill}>
                <Text style={[styles.progressText, { color: colors.primary }]}>
                  {checkedCount}/{checklist.length}
                </Text>
              </View>
            </View>

            {checklist.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={styles.checkRow}
                onPress={() => toggleChecklist(item.id)}
              >
                <Ionicons
                  name={item.checked ? "checkbox" : "square-outline"}
                  size={22}
                  color={item.checked ? colors.primary : colors.mutedForeground}
                />
                <Text
                  style={[
                    styles.checkText,
                    {
                      color: item.checked
                        ? colors.mutedForeground
                        : colors.foreground,
                      textDecorationLine: item.checked
                        ? "line-through"
                        : "none",
                    },
                  ]}
                >
                  {item.text}
                </Text>
              </TouchableOpacity>
            ))}

            {checkedCount > 0 && (
              <TouchableOpacity
                style={[styles.resetBtn, { borderColor: colors.border }]}
                onPress={resetChecklist}
              >
                <Text
                  style={[styles.resetText, { color: colors.mutedForeground }]}
                >
                  Reset all
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </Animated.View>

        {/* Questions for Doctor */}
        <Animated.View entering={FadeInDown.delay(120).duration(350)}>
          <View
            style={[
              styles.card,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <View style={styles.cardHeader}>
              <View style={styles.cardTitleRow}>
                <Ionicons
                  name="help-circle-outline"
                  size={18}
                  color={colors.primary}
                />
                <Text style={[styles.cardTitle, { color: colors.foreground }]}>
                  Questions for Your Doctor
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setAddingQuestion(true)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="add-circle" size={22} color={colors.primary} />
              </TouchableOpacity>
            </View>

            {questions.map((q) => (
              <TouchableOpacity
                key={q.id}
                style={styles.checkRow}
                onPress={() => toggleQuestion(q.id)}
                onLongPress={() => {
                  if (q.custom) {
                    Alert.alert("Remove Question", `"${q.text}"`, [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Remove",
                        style: "destructive",
                        onPress: () => removeQuestion(q.id),
                      },
                    ]);
                  }
                }}
              >
                <Ionicons
                  name={q.selected ? "checkbox" : "square-outline"}
                  size={22}
                  color={q.selected ? colors.primary : colors.mutedForeground}
                />
                <Text
                  style={[
                    styles.checkText,
                    {
                      color: q.selected
                        ? colors.mutedForeground
                        : colors.foreground,
                      textDecorationLine: q.selected ? "line-through" : "none",
                      flex: 1,
                    },
                  ]}
                >
                  {q.text}
                  {q.custom ? (
                    <Text
                      style={{ color: colors.mutedForeground, fontSize: 11 }}
                    >
                      {" "}
                      · hold to remove
                    </Text>
                  ) : null}
                </Text>
              </TouchableOpacity>
            ))}

            {addingQuestion && (
              <View style={[styles.addRow, { borderTopColor: colors.border }]}>
                <TextInput
                  style={[
                    styles.addInput,
                    {
                      color: colors.foreground,
                      borderColor: colors.border,
                      backgroundColor: colors.background,
                    },
                  ]}
                  value={newQuestion}
                  onChangeText={setNewQuestion}
                  placeholder="Add your question…"
                  placeholderTextColor={colors.mutedForeground}
                  autoFocus
                  onSubmitEditing={addQuestion}
                  returnKeyType="done"
                />
                <TouchableOpacity
                  style={[
                    styles.addSaveBtn,
                    { backgroundColor: colors.primary },
                  ]}
                  onPress={addQuestion}
                >
                  <Text
                    style={{
                      color: "#fff",
                      fontFamily: "Inter_600SemiBold",
                      fontSize: 13,
                    }}
                  >
                    Add
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    setAddingQuestion(false);
                    setNewQuestion("");
                  }}
                >
                  <Ionicons
                    name="close-circle"
                    size={22}
                    color={colors.mutedForeground}
                  />
                </TouchableOpacity>
              </View>
            )}

            {!addingQuestion && (
              <Text
                style={[styles.questionHint, { color: colors.mutedForeground }]}
              >
                Tap to check off · Long-press custom questions to remove
              </Text>
            )}
          </View>
        </Animated.View>

        {/* Recent Symptoms */}
        {symptoms.length > 0 && (
          <Animated.View entering={FadeInDown.delay(160).duration(350)}>
            <View
              style={[
                styles.card,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <View style={styles.cardHeader}>
                <View style={styles.cardTitleRow}>
                  <Ionicons
                    name="thermometer-outline"
                    size={18}
                    color={colors.primary}
                  />
                  <Text
                    style={[styles.cardTitle, { color: colors.foreground }]}
                  >
                    Recent Symptoms to Mention
                  </Text>
                </View>
              </View>

              {symptoms.map((s) => (
                <View
                  key={s.id}
                  style={[
                    styles.symptomRow,
                    { borderBottomColor: colors.border },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[styles.symptomName, { color: colors.foreground }]}
                    >
                      {s.symptom}
                    </Text>
                    <Text
                      style={[
                        styles.symptomMeta,
                        { color: colors.mutedForeground },
                      ]}
                    >
                      {formatSymptomTime(s.loggedAt)}
                      {s.severity ? ` · Severity ${s.severity}/5` : ""}
                      {s.notes ? ` · ${s.notes}` : ""}
                    </Text>
                  </View>
                  {s.severity ? (
                    <View style={styles.severityDots}>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <View
                          key={n}
                          style={[
                            styles.dot,
                            {
                              backgroundColor:
                                n <= (s.severity ?? 0)
                                  ? colors.primary
                                  : colors.border,
                            },
                          ]}
                        />
                      ))}
                    </View>
                  ) : null}
                </View>
              ))}

              <TouchableOpacity
                style={[styles.viewMoreBtn, { borderColor: colors.border }]}
                onPress={() => router.push("/(tabs)/tools")}
              >
                <Text style={[styles.viewMoreText, { color: colors.primary }]}>
                  View full symptom log →
                </Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        )}

        {/* Scribe reminder */}
        <Animated.View entering={FadeInDown.delay(200).duration(350)}>
          <TouchableOpacity
            style={[
              styles.scribeBanner,
              {
                backgroundColor: colors.primary + "12",
                borderColor: colors.primary + "30",
              },
            ]}
            onPress={() => router.push("/office-visit")}
          >
            <Ionicons name="mic" size={20} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.scribeTitle, { color: colors.primary }]}>
                Record this visit with Visit Notes Scribe
              </Text>
              <Text
                style={[styles.scribeSub, { color: colors.mutedForeground }]}
              >
                Transcribe your appointment and get a patient summary.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.primary} />
          </TouchableOpacity>
        </Animated.View>

        {/* Exit mode */}
        <Animated.View entering={FadeInDown.delay(240).duration(350)}>
          <TouchableOpacity
            style={styles.exitBtn}
            onPress={() => router.replace("/(tabs)")}
          >
            <Ionicons
              name="exit-outline"
              size={18}
              color={colors.mutedForeground}
            />
            <Text
              style={[styles.exitBtnText, { color: colors.mutedForeground }]}
            >
              Exit In-Office Mode
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  headerBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#fff",
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    marginBottom: 8,
  },
  headerBadgeText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  headerTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: "#fff",
    marginBottom: 2,
  },
  headerSub: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.75)",
    marginBottom: 10,
  },
  callChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  callChipText: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  scroll: {
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 12,
  },
  quickRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 0,
  },
  quickBtn: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    alignItems: "center",
    gap: 4,
  },
  quickLabel: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    marginTop: 2,
  },
  quickSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  cardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  cardTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    flex: 1,
  },
  progressPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  progressText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  checkRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 7,
  },
  checkText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
    flex: 1,
  },
  resetBtn: {
    borderTopWidth: 1,
    marginTop: 8,
    paddingTop: 10,
    alignItems: "center",
  },
  resetText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  addRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderTopWidth: 1,
    paddingTop: 10,
    marginTop: 4,
  },
  addInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  addSaveBtn: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  questionHint: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 8,
    textAlign: "center",
  },
  symptomRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 9,
    borderBottomWidth: 1,
    gap: 8,
  },
  symptomName: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  symptomMeta: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
  },
  severityDots: {
    flexDirection: "row",
    gap: 3,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  viewMoreBtn: {
    borderTopWidth: 1,
    paddingTop: 10,
    marginTop: 4,
    alignItems: "center",
  },
  viewMoreText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  scribeBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
  },
  scribeTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 2,
  },
  scribeSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 17,
  },
  exitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 32,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#00000015",
    backgroundColor: "#00000008",
  },
  exitBtnText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  scheduleCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
  },
  scheduleIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  scheduleTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 2,
  },
  scheduleSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 17,
  },
});
