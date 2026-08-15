import { Ionicons } from "@expo/vector-icons";
import { useUser } from "@clerk/expo";
import * as Haptics from "expo-haptics";
import * as haptics from "@/lib/haptics";
import { router, useRouter } from "expo-router";
import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
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
  useListSymptoms,
  useCreateSymptom,
  useDeleteSymptom,
  useListKickSessions,
  useCreateKickSession,
  useUpdateKickSession,
  useDeleteKickSession,
  useListContractions,
  useCreateContraction,
  useDeleteContraction,
  useGetProfile,
  getGetProfileQueryKey,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { ResponsiveContainer } from "@/components/ResponsiveContainer";
import { useIsTablet } from "@/hooks/useIsTablet";
import {
  useWatchConnectivity,
  type WatchTip,
} from "@/hooks/useWatchConnectivity";
import { calculateByDueDate } from "@/lib/pregnancy-math";
import { getWeeklyTips } from "@/lib/watch-tips";
import {
  loadReminders,
  createReminder,
  updateReminder,
  deleteReminder,
  type CustomReminder,
  type RepeatInterval,
} from "@/lib/custom-reminders";
import { requestNotificationPermission } from "@/lib/appointment-reminders";

// Safe-require DateTimePicker — static import crashes the screen if the native
// module is absent from the binary (see datetimepicker-safe-require.md).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const DateTimePicker: React.ComponentType<any> | null = (() => {
  try {
    return (
      require("@react-native-community/datetimepicker") as {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        default: React.ComponentType<any>;
      }
    ).default;
  } catch {
    return null;
  }
})();

const SYMPTOMS = [
  "Nausea",
  "Vomiting",
  "Headache",
  "Back pain",
  "Pelvic pressure",
  "Fatigue",
  "Swelling",
  "Heartburn",
  "Braxton Hicks",
  "Spotting",
  "Mood changes",
  "Other",
];

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return (
    d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
    " " +
    d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
  );
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

// ─── Symptom Log Section ─────────────────────────────────────────────────────

function SymptomLogSection() {
  const colors = useColors();
  const { data, isLoading, refetch } = useListSymptoms({
    limit: 20,
    offset: 0,
  });
  const createMutation = useCreateSymptom();
  const deleteMutation = useDeleteSymptom();

  const [showAdd, setShowAdd] = useState(false);
  const [selectedSymptom, setSelectedSymptom] = useState("");
  const [customSymptom, setCustomSymptom] = useState("");
  const [severity, setSeverity] = useState<number | null>(null);
  const [notes, setNotes] = useState("");

  const handleAdd = useCallback(async () => {
    const symptom =
      selectedSymptom === "Other" ? customSymptom.trim() : selectedSymptom;
    if (!symptom) return;
    await createMutation.mutateAsync({
      data: { symptom, severity, notes: notes.trim() || null },
    });
    setShowAdd(false);
    setSelectedSymptom("");
    setCustomSymptom("");
    setSeverity(null);
    setNotes("");
    refetch();
  }, [
    selectedSymptom,
    customSymptom,
    severity,
    notes,
    createMutation,
    refetch,
  ]);

  const handleDelete = useCallback(
    (id: number) => {
      Alert.alert("Delete", "Remove this symptom log?", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await deleteMutation.mutateAsync({ id });
            refetch();
          },
        },
      ]);
    },
    [deleteMutation, refetch],
  );

  const s = StyleSheet.create({
    container: { marginBottom: 8 },
    row: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 12,
    },
    title: {
      fontSize: 17,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
    },
    addBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: colors.primary,
      borderRadius: 16,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    addBtnText: {
      color: colors.primaryForeground,
      fontSize: 13,
      fontFamily: "Inter_500Medium",
    },
    empty: {
      color: colors.mutedForeground,
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      textAlign: "center",
      paddingVertical: 16,
    },
    item: {
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 12,
      marginBottom: 8,
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
      borderWidth: 1,
      borderColor: colors.border,
    },
    itemMain: { flex: 1 },
    itemName: {
      fontSize: 15,
      fontFamily: "Inter_500Medium",
      color: colors.foreground,
    },
    itemMeta: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginTop: 2,
    },
    dots: { flexDirection: "row", gap: 3, marginTop: 4 },
    dot: { width: 8, height: 8, borderRadius: 4 },
  });

  return (
    <View style={s.container}>
      <View style={s.row}>
        <Text style={s.title}>Symptom Log</Text>
        <TouchableOpacity style={s.addBtn} onPress={() => setShowAdd(true)}>
          <Ionicons name="add" size={14} color={colors.primaryForeground} />
          <Text style={s.addBtnText}>Log Symptom</Text>
        </TouchableOpacity>
      </View>

      {isLoading && <ActivityIndicator color={colors.primary} />}
      {!isLoading && !data?.items.length && (
        <Text style={s.empty}>No symptoms logged yet.</Text>
      )}
      {data?.items.map((item) => (
        <View key={item.id} style={s.item}>
          <View style={s.itemMain}>
            <Text style={s.itemName}>{item.symptom}</Text>
            <Text style={s.itemMeta}>{formatDate(item.loggedAt)}</Text>
            {item.severity && (
              <View style={s.dots}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <View
                    key={n}
                    style={[
                      s.dot,
                      {
                        backgroundColor:
                          n <= (item.severity ?? 0)
                            ? colors.primary
                            : colors.border,
                      },
                    ]}
                  />
                ))}
              </View>
            )}
            {item.notes ? <Text style={s.itemMeta}>{item.notes}</Text> : null}
          </View>
          <TouchableOpacity onPress={() => handleDelete(item.id)}>
            <Ionicons
              name="trash-outline"
              size={18}
              color={colors.mutedForeground}
            />
          </TouchableOpacity>
        </View>
      ))}

      <Modal visible={showAdd} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View
            style={[styles.modalSheet, { backgroundColor: colors.background }]}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>
                Log Symptom
              </Text>
              <TouchableOpacity onPress={() => setShowAdd(false)}>
                <Ionicons
                  name="close"
                  size={22}
                  color={colors.mutedForeground}
                />
              </TouchableOpacity>
            </View>

            <Text style={[styles.label, { color: colors.mutedForeground }]}>
              Symptom
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginBottom: 16 }}
            >
              <View style={{ flexDirection: "row", gap: 8 }}>
                {SYMPTOMS.map((sym) => (
                  <TouchableOpacity
                    key={sym}
                    style={[
                      styles.chip,
                      {
                        backgroundColor:
                          selectedSymptom === sym
                            ? colors.primary
                            : colors.muted,
                        borderColor:
                          selectedSymptom === sym
                            ? colors.primary
                            : colors.border,
                      },
                    ]}
                    onPress={() => setSelectedSymptom(sym)}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        {
                          color:
                            selectedSymptom === sym
                              ? colors.primaryForeground
                              : colors.foreground,
                        },
                      ]}
                    >
                      {sym}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            {selectedSymptom === "Other" && (
              <>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>
                  Describe
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    {
                      color: colors.foreground,
                      borderColor: colors.border,
                      backgroundColor: colors.card,
                    },
                  ]}
                  value={customSymptom}
                  onChangeText={setCustomSymptom}
                  placeholder="e.g. Round ligament pain"
                  placeholderTextColor={colors.mutedForeground}
                />
              </>
            )}

            <Text style={[styles.label, { color: colors.mutedForeground }]}>
              Severity (optional)
            </Text>
            <View style={{ flexDirection: "row", gap: 10, marginBottom: 16 }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <TouchableOpacity
                  key={n}
                  onPress={() => setSeverity(severity === n ? null : n)}
                  style={[
                    styles.severityBtn,
                    {
                      backgroundColor:
                        severity !== null && severity >= n
                          ? colors.primary
                          : colors.muted,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color:
                        severity !== null && severity >= n
                          ? colors.primaryForeground
                          : colors.mutedForeground,
                      fontFamily: "Inter_600SemiBold",
                    }}
                  >
                    {n}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.label, { color: colors.mutedForeground }]}>
              Notes (optional)
            </Text>
            <TextInput
              style={[
                styles.input,
                styles.textArea,
                {
                  color: colors.foreground,
                  borderColor: colors.border,
                  backgroundColor: colors.card,
                },
              ]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Any additional details..."
              placeholderTextColor={colors.mutedForeground}
              multiline
              numberOfLines={3}
            />

            <TouchableOpacity
              style={[
                styles.primaryBtn,
                {
                  backgroundColor: colors.primary,
                  opacity: !selectedSymptom ? 0.5 : 1,
                },
              ]}
              onPress={handleAdd}
              disabled={!selectedSymptom || createMutation.isPending}
            >
              {createMutation.isPending ? (
                <ActivityIndicator color={colors.primaryForeground} />
              ) : (
                <Text
                  style={[
                    styles.primaryBtnText,
                    { color: colors.primaryForeground },
                  ]}
                >
                  Save
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Kick Counter Section ────────────────────────────────────────────────────

export function KickCounterSection() {
  const colors = useColors();
  const { data, isLoading, refetch } = useListKickSessions({
    limit: 10,
    offset: 0,
  });
  const createMutation = useCreateKickSession();
  const updateMutation = useUpdateKickSession();
  const deleteMutation = useDeleteKickSession();

  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [kickCount, setKickCount] = useState(0);
  const [sessionStart, setSessionStart] = useState<Date | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (sessionStart) {
      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - sessionStart.getTime()) / 1000));
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [sessionStart]);

  const handleStartSession = useCallback(async () => {
    const now = new Date();
    const row = await createMutation.mutateAsync({
      data: { startedAt: now.toISOString(), kickCount: 0 },
    });
    setActiveSessionId(row.id);
    setKickCount(0);
    setSessionStart(now);
    setElapsed(0);
    haptics.impact(Haptics.ImpactFeedbackStyle.Light);
  }, [createMutation]);

  const handleKick = useCallback(async () => {
    if (!activeSessionId) return;
    const next = kickCount + 1;
    setKickCount(next);
    haptics.impact(Haptics.ImpactFeedbackStyle.Medium);
    await updateMutation.mutateAsync({
      id: activeSessionId,
      data: { kickCount: next },
    });
  }, [activeSessionId, kickCount, updateMutation]);

  const handleEndSession = useCallback(async () => {
    if (!activeSessionId) return;
    const endedAt = new Date().toISOString();
    await updateMutation.mutateAsync({
      id: activeSessionId,
      data: { kickCount, endedAt },
    });
    setActiveSessionId(null);
    setSessionStart(null);
    setKickCount(0);
    setElapsed(0);
    refetch();
  }, [activeSessionId, kickCount, updateMutation, refetch]);

  const handleDelete = useCallback(
    (id: number) => {
      Alert.alert("Delete", "Remove this session?", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await deleteMutation.mutateAsync({ id });
            refetch();
          },
        },
      ]);
    },
    [deleteMutation, refetch],
  );

  const s = StyleSheet.create({
    container: { marginBottom: 8 },
    row: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 12,
    },
    title: {
      fontSize: 17,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
    },
    activeBox: {
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: 20,
      alignItems: "center",
      marginBottom: 16,
      borderWidth: 1,
      borderColor: colors.border,
    },
    kickBtn: {
      width: 100,
      height: 100,
      borderRadius: 50,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
      marginVertical: 16,
    },
    kickCount: {
      fontSize: 36,
      fontFamily: "Inter_700Bold",
      color: colors.primaryForeground,
    },
    kickLabel: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.primaryForeground,
    },
    elapsed: {
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginBottom: 12,
    },
    endBtn: {
      paddingHorizontal: 20,
      paddingVertical: 8,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
    },
    endBtnText: {
      fontSize: 14,
      fontFamily: "Inter_500Medium",
      color: colors.foreground,
    },
    startBtn: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: "center",
      marginBottom: 16,
    },
    startBtnText: {
      color: colors.primaryForeground,
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
    },
    item: {
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 12,
      marginBottom: 8,
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1,
      borderColor: colors.border,
    },
    itemMain: { flex: 1 },
    itemKick: {
      fontSize: 22,
      fontFamily: "Inter_700Bold",
      color: colors.primary,
    },
    itemMeta: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
    },
    empty: {
      color: colors.mutedForeground,
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      textAlign: "center",
      paddingVertical: 16,
    },
    historyBtn: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      gap: 5,
      paddingVertical: 10,
      marginTop: 4,
    },
    historyBtnText: {
      fontSize: 13,
      fontFamily: "Inter_500Medium",
      color: colors.primary,
    },
  });

  const showInstructions = useCallback(() => {
    Alert.alert(
      "How it works",
      "Tap Start Counting when you're ready to track movements.\n\n" +
        "Tap the big button once for every kick, roll, or movement you feel.\n\n" +
        "Tap End Session when you're done — many providers suggest 10 movements within about 2 hours as a healthy pace.",
    );
  }, []);

  return (
    <View style={s.container}>
      <View style={s.row}>
        <Text style={s.title}>Kick Counter</Text>
        <TouchableOpacity
          onPress={showInstructions}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons
            name="information-circle-outline"
            size={20}
            color={colors.mutedForeground}
          />
        </TouchableOpacity>
      </View>

      {activeSessionId ? (
        <View style={s.activeBox}>
          <Text style={s.elapsed}>Session time: {formatTime(elapsed)}</Text>
          <TouchableOpacity style={s.kickBtn} onPress={handleKick}>
            <Text style={s.kickCount}>{kickCount}</Text>
            <Text style={s.kickLabel}>kicks</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.endBtn} onPress={handleEndSession}>
            <Text style={s.endBtnText}>End Session</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          style={s.startBtn}
          onPress={handleStartSession}
          disabled={createMutation.isPending}
        >
          <Text style={s.startBtnText}>Start Counting</Text>
        </TouchableOpacity>
      )}

      {isLoading && <ActivityIndicator color={colors.primary} />}
      {!isLoading && !data?.items.length && !activeSessionId && (
        <Text style={s.empty}>No sessions yet. Tap Start to begin.</Text>
      )}
      {data?.items.map((item) => {
        const dur = item.endedAt
          ? Math.round(
              (new Date(item.endedAt).getTime() -
                new Date(item.startedAt).getTime()) /
                60000,
            )
          : null;
        return (
          <View key={item.id} style={s.item}>
            <View style={s.itemMain}>
              <Text style={s.itemKick}>{item.kickCount} kicks</Text>
              <Text style={s.itemMeta}>
                {formatDate(item.startedAt)}
                {dur !== null ? ` · ${dur} min` : ""}
              </Text>
            </View>
            <TouchableOpacity onPress={() => handleDelete(item.id)}>
              <Ionicons
                name="trash-outline"
                size={18}
                color={colors.mutedForeground}
              />
            </TouchableOpacity>
          </View>
        );
      })}
      <TouchableOpacity
        style={s.historyBtn}
        onPress={() => router.push("/session-history")}
      >
        <Ionicons name="time-outline" size={15} color={colors.primary} />
        <Text style={s.historyBtnText}>View Full History</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Contraction Timer Section ───────────────────────────────────────────────

export function ContractionTimerSection() {
  const colors = useColors();
  const today = todayDate();
  const { data, isLoading, refetch } = useListContractions({
    sessionDate: today,
    limit: 50,
  });
  const createMutation = useCreateContraction();
  const deleteMutation = useDeleteContraction();

  const [contracting, setContracting] = useState(false);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (contracting && startTime) {
      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startTime.getTime()) / 1000));
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [contracting, startTime]);

  const handleToggle = useCallback(async () => {
    if (!contracting) {
      const now = new Date();
      setStartTime(now);
      setContracting(true);
      setElapsed(0);
      haptics.impact(Haptics.ImpactFeedbackStyle.Heavy);
    } else {
      const endTime = new Date();
      const duration = Math.round(
        (endTime.getTime() - startTime!.getTime()) / 1000,
      );

      const items = data?.items ?? [];
      const lastEnd = items[0]?.endedAt;
      const interval = lastEnd
        ? Math.round(
            (startTime!.getTime() - new Date(lastEnd).getTime()) / 1000,
          )
        : null;

      setContracting(false);
      setStartTime(null);
      setElapsed(0);
      haptics.notification(Haptics.NotificationFeedbackType.Success);

      await createMutation.mutateAsync({
        data: {
          startedAt: startTime!.toISOString(),
          endedAt: endTime.toISOString(),
          durationSeconds: duration,
          intervalSeconds: interval ?? undefined,
          sessionDate: today,
        },
      });
      refetch();
    }
  }, [contracting, startTime, data?.items, today, createMutation, refetch]);

  const handleDelete = useCallback(
    (id: number) => {
      Alert.alert("Delete", "Remove this contraction?", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await deleteMutation.mutateAsync({ id });
            refetch();
          },
        },
      ]);
    },
    [deleteMutation, refetch],
  );

  const items = data?.items ?? [];
  const avgDuration =
    items.length > 0
      ? Math.round(
          items
            .filter((c) => c.durationSeconds)
            .reduce((s, c) => s + (c.durationSeconds ?? 0), 0) /
            items.filter((c) => c.durationSeconds).length,
        )
      : null;
  const avgInterval =
    items.filter((c) => c.intervalSeconds).length > 0
      ? Math.round(
          items
            .filter((c) => c.intervalSeconds)
            .reduce((s, c) => s + (c.intervalSeconds ?? 0), 0) /
            items.filter((c) => c.intervalSeconds).length,
        )
      : null;
  const rule511 =
    avgDuration !== null &&
    avgInterval !== null &&
    avgDuration >= 60 &&
    avgInterval <= 300 &&
    items.length >= 3;

  const s = StyleSheet.create({
    container: { marginBottom: 8 },
    row: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 12,
    },
    title: {
      fontSize: 17,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
    },
    timerBox: {
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: 20,
      alignItems: "center",
      marginBottom: 16,
      borderWidth: 1,
      borderColor: contracting ? colors.primary : colors.border,
    },
    timerBtn: {
      width: 120,
      height: 120,
      borderRadius: 60,
      alignItems: "center",
      justifyContent: "center",
      marginVertical: 12,
      backgroundColor: contracting ? colors.destructive : colors.primary,
    },
    timerBtnLabel: {
      color: "#fff",
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
      textAlign: "center",
    },
    elapsedText: {
      fontSize: 28,
      fontFamily: "Inter_700Bold",
      color: contracting ? colors.destructive : colors.foreground,
    },
    statusText: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginBottom: 4,
    },
    summaryRow: {
      flexDirection: "row",
      gap: 12,
      marginBottom: 16,
    },
    summaryCard: {
      flex: 1,
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 12,
      alignItems: "center",
      borderWidth: 1,
      borderColor: colors.border,
    },
    summaryValue: {
      fontSize: 20,
      fontFamily: "Inter_700Bold",
      color: colors.primary,
    },
    summaryLabel: {
      fontSize: 11,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginTop: 2,
    },
    rule511: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: "#f59e0b",
      borderRadius: 10,
      padding: 12,
      marginBottom: 16,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    rule511Text: {
      fontSize: 13,
      fontFamily: "Inter_500Medium",
      color: colors.foreground,
      flex: 1,
    },
    item: {
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 12,
      marginBottom: 8,
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1,
      borderColor: colors.border,
    },
    itemMain: { flex: 1 },
    itemDuration: {
      fontSize: 16,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
    },
    itemMeta: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
    },
    empty: {
      color: colors.mutedForeground,
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      textAlign: "center",
      paddingVertical: 16,
    },
    historyBtn: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      gap: 5,
      paddingVertical: 10,
      marginTop: 4,
    },
    historyBtnText: {
      fontSize: 13,
      fontFamily: "Inter_500Medium",
      color: colors.primary,
    },
  });

  const showInstructions = useCallback(() => {
    Alert.alert(
      "How it works",
      "Tap Start the moment a contraction begins.\n\n" +
        "Tap Stop as soon as it ends — this logs its duration and the interval since your last one.\n\n" +
        "Repeat for each contraction so we can spot patterns, like 5-1-1 (contractions lasting at least 1 minute, every 5 minutes or less, for at least 1 hour).",
    );
  }, []);

  return (
    <View style={s.container}>
      <View style={s.row}>
        <Text style={s.title}>Contraction Timer</Text>
        <TouchableOpacity
          onPress={showInstructions}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons
            name="information-circle-outline"
            size={20}
            color={colors.mutedForeground}
          />
        </TouchableOpacity>
      </View>

      <View style={s.timerBox}>
        <Text style={s.statusText}>
          {contracting ? "Contraction in progress" : "Tap to start contraction"}
        </Text>
        {contracting && (
          <Text style={s.elapsedText}>{formatTime(elapsed)}</Text>
        )}
        <TouchableOpacity style={s.timerBtn} onPress={handleToggle}>
          <Text style={s.timerBtnLabel}>
            {contracting ? "Stop" : "Start\nContraction"}
          </Text>
        </TouchableOpacity>
        {!contracting && items.length > 0 && items[0].intervalSeconds && (
          <Text style={s.statusText}>
            Last interval: {formatTime(items[0].intervalSeconds)}
          </Text>
        )}
      </View>

      {items.length >= 2 && (
        <View style={s.summaryRow}>
          <View style={s.summaryCard}>
            <Text style={s.summaryValue}>
              {avgDuration !== null ? formatTime(avgDuration) : "—"}
            </Text>
            <Text style={s.summaryLabel}>Avg duration</Text>
          </View>
          <View style={s.summaryCard}>
            <Text style={s.summaryValue}>
              {avgInterval !== null ? formatTime(avgInterval) : "—"}
            </Text>
            <Text style={s.summaryLabel}>Avg interval</Text>
          </View>
          <View style={s.summaryCard}>
            <Text style={s.summaryValue}>{items.length}</Text>
            <Text style={s.summaryLabel}>Today</Text>
          </View>
        </View>
      )}

      {rule511 && (
        <View style={s.rule511}>
          <Ionicons name="warning-outline" size={18} color="#f59e0b" />
          <Text style={s.rule511Text}>
            5-1-1 pattern detected. Contact your provider.
          </Text>
        </View>
      )}

      {isLoading && <ActivityIndicator color={colors.primary} />}
      {!isLoading && items.length === 0 && (
        <Text style={s.empty}>No contractions recorded today.</Text>
      )}
      {items.map((item) => (
        <View key={item.id} style={s.item}>
          <View style={s.itemMain}>
            <Text style={s.itemDuration}>
              {item.durationSeconds ? formatTime(item.durationSeconds) : "—"}
            </Text>
            <Text style={s.itemMeta}>
              {formatDate(item.startedAt)}
              {item.intervalSeconds
                ? ` · interval: ${formatTime(item.intervalSeconds)}`
                : ""}
            </Text>
          </View>
          <TouchableOpacity onPress={() => handleDelete(item.id)}>
            <Ionicons
              name="trash-outline"
              size={18}
              color={colors.mutedForeground}
            />
          </TouchableOpacity>
        </View>
      ))}
      <TouchableOpacity
        style={s.historyBtn}
        onPress={() => router.push("/session-history")}
      >
        <Ionicons name="time-outline" size={15} color={colors.primary} />
        <Text style={s.historyBtnText}>View Full History</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Reminders Section ───────────────────────────────────────────────────────

const REPEAT_OPTIONS: { value: RepeatInterval; label: string }[] = [
  { value: "none", label: "Once" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
];

function formatReminderDate(iso: string) {
  const d = new Date(iso);
  return (
    d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    }) +
    " at " +
    d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
  );
}

function ReminderFormModal({
  visible,
  initialReminder,
  onClose,
  onSave,
}: {
  visible: boolean;
  initialReminder: CustomReminder | null;
  onClose: () => void;
  onSave: (
    data: Omit<CustomReminder, "id" | "notifId"> & { id?: string },
  ) => Promise<void>;
}) {
  const colors = useColors();

  const [title, setTitle] = useState(initialReminder?.title ?? "");
  const [scheduledAt, setScheduledAt] = useState<Date>(
    initialReminder
      ? new Date(initialReminder.scheduledAt)
      : (() => {
          const d = new Date();
          d.setMinutes(d.getMinutes() + 60, 0, 0);
          return d;
        })(),
  );
  const [repeat, setRepeat] = useState<RepeatInterval>(
    initialReminder?.repeat ?? "none",
  );
  const [saving, setSaving] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  // Reset form whenever the modal opens with a new reminder.
  useEffect(() => {
    if (visible) {
      setTitle(initialReminder?.title ?? "");
      setScheduledAt(
        initialReminder
          ? new Date(initialReminder.scheduledAt)
          : (() => {
              const d = new Date();
              d.setMinutes(d.getMinutes() + 60, 0, 0);
              return d;
            })(),
      );
      setRepeat(initialReminder?.repeat ?? "none");
      setSaving(false);
      setShowDatePicker(false);
      setShowTimePicker(false);
    }
  }, [visible, initialReminder]);

  const handleSave = useCallback(async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const payload: Omit<CustomReminder, "id" | "notifId"> & { id?: string } =
        {
          title: title.trim(),
          scheduledAt: scheduledAt.toISOString(),
          repeat,
        };
      if (initialReminder) payload.id = initialReminder.id;
      await onSave(payload);
    } finally {
      setSaving(false);
    }
  }, [title, scheduledAt, repeat, initialReminder, onSave]);

  const s = StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 16,
    },
    dateBtn: {
      flex: 1,
      borderWidth: 1,
      borderRadius: 10,
      padding: 12,
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    dateBtnText: {
      fontSize: 15,
      fontFamily: "Inter_400Regular",
      color: colors.foreground,
    },
  });

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View
          style={[styles.modalSheet, { backgroundColor: colors.background }]}
        >
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              {initialReminder ? "Edit Reminder" : "New Reminder"}
            </Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          <Text style={[styles.label, { color: colors.mutedForeground }]}>
            Title
          </Text>
          <TextInput
            style={[
              styles.input,
              {
                color: colors.foreground,
                borderColor: colors.border,
                backgroundColor: colors.card,
              },
            ]}
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Take iron supplement"
            placeholderTextColor={colors.mutedForeground}
            autoFocus
            returnKeyType="done"
          />

          <Text style={[styles.label, { color: colors.mutedForeground }]}>
            Date &amp; Time
          </Text>

          {DateTimePicker ? (
            <>
              <View style={s.row}>
                <TouchableOpacity
                  style={s.dateBtn}
                  onPress={() => {
                    setShowTimePicker(false);
                    setShowDatePicker((v) => !v);
                  }}
                >
                  <Text style={s.dateBtnText}>
                    📅{" "}
                    {scheduledAt.toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={s.dateBtn}
                  onPress={() => {
                    setShowDatePicker(false);
                    setShowTimePicker((v) => !v);
                  }}
                >
                  <Text style={s.dateBtnText}>
                    🕐{" "}
                    {scheduledAt.toLocaleTimeString(undefined, {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Text>
                </TouchableOpacity>
              </View>
              {showDatePicker && (
                <DateTimePicker
                  value={scheduledAt}
                  mode="date"
                  display={Platform.OS === "ios" ? "inline" : "default"}
                  minimumDate={new Date()}
                  onChange={(_: unknown, date?: Date) => {
                    if (date) {
                      const next = new Date(scheduledAt);
                      next.setFullYear(
                        date.getFullYear(),
                        date.getMonth(),
                        date.getDate(),
                      );
                      setScheduledAt(next);
                    }
                    if (Platform.OS !== "ios") setShowDatePicker(false);
                  }}
                />
              )}
              {showTimePicker && (
                <DateTimePicker
                  value={scheduledAt}
                  mode="time"
                  display={Platform.OS === "ios" ? "spinner" : "default"}
                  onChange={(_: unknown, date?: Date) => {
                    if (date) {
                      const next = new Date(scheduledAt);
                      next.setHours(date.getHours(), date.getMinutes(), 0, 0);
                      setScheduledAt(next);
                    }
                    if (Platform.OS !== "ios") setShowTimePicker(false);
                  }}
                />
              )}
            </>
          ) : (
            // Fallback when the native module is absent: plain text inputs.
            <TextInput
              style={[
                styles.input,
                {
                  color: colors.foreground,
                  borderColor: colors.border,
                  backgroundColor: colors.card,
                },
              ]}
              value={scheduledAt.toISOString().slice(0, 16).replace("T", " ")}
              onChangeText={(v) => {
                const d = new Date(v);
                if (!isNaN(d.getTime())) setScheduledAt(d);
              }}
              placeholder="YYYY-MM-DD HH:MM"
              placeholderTextColor={colors.mutedForeground}
            />
          )}

          <Text style={[styles.label, { color: colors.mutedForeground }]}>
            Repeat
          </Text>
          <View
            style={{
              flexDirection: "row",
              gap: 8,
              marginBottom: 20,
              flexWrap: "wrap",
            }}
          >
            {REPEAT_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.chip,
                  {
                    backgroundColor:
                      repeat === opt.value ? colors.primary : colors.muted,
                    borderColor:
                      repeat === opt.value ? colors.primary : colors.border,
                  },
                ]}
                onPress={() => setRepeat(opt.value)}
              >
                <Text
                  style={[
                    styles.chipText,
                    {
                      color:
                        repeat === opt.value
                          ? colors.primaryForeground
                          : colors.foreground,
                    },
                  ]}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={[
              styles.primaryBtn,
              {
                backgroundColor: colors.primary,
                opacity: !title.trim() ? 0.5 : 1,
              },
            ]}
            onPress={handleSave}
            disabled={!title.trim() || saving}
          >
            {saving ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : (
              <Text
                style={[
                  styles.primaryBtnText,
                  { color: colors.primaryForeground },
                ]}
              >
                {initialReminder ? "Save Changes" : "Add Reminder"}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function RemindersSection() {
  const colors = useColors();
  const [reminders, setReminders] = useState<CustomReminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingReminder, setEditingReminder] = useState<CustomReminder | null>(
    null,
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setReminders(await loadReminders());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleOpenAdd = useCallback(async () => {
    // Request permission lazily on first interaction.
    await requestNotificationPermission().catch(() => {});
    setEditingReminder(null);
    setShowModal(true);
  }, []);

  const handleOpenEdit = useCallback((r: CustomReminder) => {
    setEditingReminder(r);
    setShowModal(true);
  }, []);

  const handleSave = useCallback(
    async (data: Omit<CustomReminder, "id" | "notifId"> & { id?: string }) => {
      if (data.id) {
        const existing = reminders.find((r) => r.id === data.id);
        if (existing) {
          await updateReminder({ ...existing, ...data } as CustomReminder);
        }
      } else {
        await createReminder(data);
      }
      setShowModal(false);
      await refresh();
    },
    [reminders, refresh],
  );

  const handleDelete = useCallback(
    (id: string) => {
      Alert.alert("Delete Reminder", "Remove this reminder?", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await deleteReminder(id);
            await refresh();
          },
        },
      ]);
    },
    [refresh],
  );

  const now = Date.now();
  const upcoming = reminders.filter(
    (r) => r.repeat !== "none" || new Date(r.scheduledAt).getTime() > now,
  );
  const past = reminders.filter(
    (r) => r.repeat === "none" && new Date(r.scheduledAt).getTime() <= now,
  );

  const s = StyleSheet.create({
    container: { marginBottom: 8 },
    headerRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 12,
    },
    title: {
      fontSize: 17,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
    },
    addBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: colors.primary,
      borderRadius: 16,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    addBtnText: {
      color: colors.primaryForeground,
      fontSize: 13,
      fontFamily: "Inter_500Medium",
    },
    empty: {
      color: colors.mutedForeground,
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      textAlign: "center",
      paddingVertical: 16,
    },
    sectionLabel: {
      fontSize: 12,
      fontFamily: "Inter_600SemiBold",
      color: colors.mutedForeground,
      textTransform: "uppercase",
      letterSpacing: 0.6,
      marginBottom: 6,
      marginTop: 4,
    },
    item: {
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 12,
      marginBottom: 8,
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
      borderWidth: 1,
      borderColor: colors.border,
    },
    itemPast: {
      opacity: 0.55,
    },
    itemMain: { flex: 1 },
    itemTitle: {
      fontSize: 15,
      fontFamily: "Inter_500Medium",
      color: colors.foreground,
    },
    itemMeta: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginTop: 2,
    },
    itemActions: {
      flexDirection: "row",
      gap: 12,
      alignItems: "center",
    },
    repeatBadge: {
      fontSize: 11,
      fontFamily: "Inter_500Medium",
      color: colors.primary,
      backgroundColor: colors.primary + "18",
      borderRadius: 8,
      paddingHorizontal: 7,
      paddingVertical: 2,
      alignSelf: "flex-start",
      marginTop: 4,
    },
  });

  return (
    <View style={s.container}>
      <View style={s.headerRow}>
        <Text style={s.title}>My Reminders</Text>
        <TouchableOpacity style={s.addBtn} onPress={handleOpenAdd}>
          <Ionicons name="add" size={14} color={colors.primaryForeground} />
          <Text style={s.addBtnText}>Add</Text>
        </TouchableOpacity>
      </View>

      {loading && <ActivityIndicator color={colors.primary} />}

      {!loading && reminders.length === 0 && (
        <Text style={s.empty}>No reminders yet. Tap Add to create one.</Text>
      )}

      {!loading && upcoming.length > 0 && (
        <>
          {past.length > 0 && <Text style={s.sectionLabel}>Upcoming</Text>}
          {upcoming.map((r) => (
            <TouchableOpacity
              key={r.id}
              style={s.item}
              onPress={() => handleOpenEdit(r)}
              activeOpacity={0.8}
            >
              <Ionicons
                name="notifications-outline"
                size={18}
                color={colors.primary}
                style={{ marginTop: 2 }}
              />
              <View style={s.itemMain}>
                <Text style={s.itemTitle}>{r.title}</Text>
                <Text style={s.itemMeta}>
                  {formatReminderDate(r.scheduledAt)}
                </Text>
                {r.repeat !== "none" && (
                  <Text style={s.repeatBadge}>
                    {r.repeat === "daily" ? "Repeats daily" : "Repeats weekly"}
                  </Text>
                )}
              </View>
              <View style={s.itemActions}>
                <TouchableOpacity
                  onPress={() => handleDelete(r.id)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons
                    name="trash-outline"
                    size={18}
                    color={colors.mutedForeground}
                  />
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          ))}
        </>
      )}

      {!loading && past.length > 0 && (
        <>
          <Text style={s.sectionLabel}>Past</Text>
          {past.map((r) => (
            <View key={r.id} style={[s.item, s.itemPast]}>
              <Ionicons
                name="notifications-off-outline"
                size={18}
                color={colors.mutedForeground}
                style={{ marginTop: 2 }}
              />
              <View style={s.itemMain}>
                <Text style={s.itemTitle}>{r.title}</Text>
                <Text style={s.itemMeta}>
                  {formatReminderDate(r.scheduledAt)}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => handleDelete(r.id)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons
                  name="trash-outline"
                  size={18}
                  color={colors.mutedForeground}
                />
              </TouchableOpacity>
            </View>
          ))}
        </>
      )}

      <ReminderFormModal
        visible={showModal}
        initialReminder={editingReminder}
        onClose={() => setShowModal(false)}
        onSave={handleSave}
      />
    </View>
  );
}

// ─── Watch Status Badge ──────────────────────────────────────────────────────

function WatchStatusBadge({
  isReachable,
  isWatchAppInstalled,
  activationState,
}: {
  isReachable: boolean;
  isWatchAppInstalled: boolean;
  activationState: string;
}) {
  const colors = useColors();
  const [sheetVisible, setSheetVisible] = useState(false);

  if (Platform.OS !== "ios") return null;

  const connected = isReachable;
  const dotColor = connected ? "#22c55e" : colors.mutedForeground;
  const sessionActivated = activationState === "activated";
  // "notActivated" means the session handshake is still in progress —
  // "Watch app not installed" is misleading here. Use a neutral label until
  // the activation completes (or times out after the polling window).
  const label = connected
    ? "Apple Watch connected"
    : sessionActivated
      ? "Watch not reachable"
      : activationState === "notActivated"
        ? "Connecting to Watch\u2026"
        : "Watch not reachable";

  // Show the Watch app deep-link when the companion app is installed but the
  // session is not active (out of range, Bluetooth off, etc.)
  const showWatchAppLink =
    isWatchAppInstalled && activationState !== "activated";

  const badge = (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        marginBottom: 8,
        alignSelf: "flex-start",
      }}
    >
      <View
        style={{
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: dotColor,
        }}
      />
      <Text
        style={{
          fontSize: 12,
          fontFamily: "Inter_400Regular",
          color: connected ? "#22c55e" : colors.mutedForeground,
        }}
      >
        {label}
      </Text>
      {!connected && (
        <Ionicons
          name="chevron-forward"
          size={12}
          color={colors.mutedForeground}
        />
      )}
    </View>
  );

  if (connected) {
    return badge;
  }

  return (
    <>
      <TouchableOpacity
        onPress={() => setSheetVisible(true)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Apple Watch connection help"
      >
        {badge}
      </TouchableOpacity>

      <Modal
        visible={sheetVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setSheetVisible(false)}
      >
        <TouchableOpacity
          style={watchSheetStyles.overlay}
          activeOpacity={1}
          onPress={() => setSheetVisible(false)}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={[
              watchSheetStyles.sheet,
              { backgroundColor: colors.background },
            ]}
            onPress={() => {}}
          >
            {/* Drag handle */}
            <View
              style={[
                watchSheetStyles.handle,
                { backgroundColor: colors.border },
              ]}
            />

            <View style={watchSheetStyles.header}>
              <Text
                style={[watchSheetStyles.title, { color: colors.foreground }]}
              >
                Apple Watch Not Connected
              </Text>
              <TouchableOpacity onPress={() => setSheetVisible(false)}>
                <Ionicons
                  name="close"
                  size={22}
                  color={colors.mutedForeground}
                />
              </TouchableOpacity>
            </View>

            <Text
              style={[
                watchSheetStyles.subtitle,
                { color: colors.mutedForeground },
              ]}
            >
              Here are the most common reasons your Watch isn't connecting:
            </Text>

            {[
              {
                icon: "bluetooth" as const,
                heading: "Bluetooth is off",
                detail:
                  "Make sure Bluetooth is enabled on your iPhone. The Watch communicates over Bluetooth when you're nearby.",
              },
              {
                icon: "radio-outline" as const,
                heading: "Watch is out of range",
                detail:
                  "Keep your iPhone and Apple Watch within about 30 feet of each other.",
              },
              {
                icon: "watch-outline" as const,
                heading: "Companion app not open",
                detail:
                  "The Pregnancy Assistant app must be installed on your Watch. Open the Watch app on your iPhone to check.",
              },
              {
                icon: "refresh-outline" as const,
                heading: "Session not activated",
                detail:
                  "Try locking and unlocking your Apple Watch, or restart the app on the Watch.",
              },
            ].map(({ icon, heading, detail }) => (
              <View key={heading} style={watchSheetStyles.row}>
                <View
                  style={[
                    watchSheetStyles.iconWrap,
                    { backgroundColor: colors.muted },
                  ]}
                >
                  <Ionicons name={icon} size={18} color={colors.primary} />
                </View>
                <View style={watchSheetStyles.rowText}>
                  <Text
                    style={[
                      watchSheetStyles.rowHeading,
                      { color: colors.foreground },
                    ]}
                  >
                    {heading}
                  </Text>
                  <Text
                    style={[
                      watchSheetStyles.rowDetail,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    {detail}
                  </Text>
                </View>
              </View>
            ))}

            {showWatchAppLink && (
              <TouchableOpacity
                style={[
                  watchSheetStyles.openBtn,
                  { backgroundColor: colors.primary },
                ]}
                onPress={() => {
                  setSheetVisible(false);
                  Linking.openURL("itms-watchs://").catch(() => {});
                }}
              >
                <Ionicons
                  name="watch-outline"
                  size={16}
                  color={colors.primaryForeground}
                  style={{ marginRight: 6 }}
                />
                <Text
                  style={[
                    watchSheetStyles.openBtnText,
                    { color: colors.primaryForeground },
                  ]}
                >
                  Open Apple Watch App
                </Text>
              </TouchableOpacity>
            )}

            {!isWatchAppInstalled && !sessionActivated && (
              <View
                style={[
                  watchSheetStyles.infoBox,
                  { backgroundColor: colors.muted, borderColor: colors.border },
                ]}
              >
                <Ionicons
                  name="information-circle-outline"
                  size={16}
                  color={colors.mutedForeground}
                  style={{ marginRight: 6, flexShrink: 0 }}
                />
                <Text
                  style={[
                    watchSheetStyles.infoText,
                    { color: colors.mutedForeground },
                  ]}
                >
                  Install the Pregnancy Assistant app on your Apple Watch from
                  the Watch app on your iPhone.
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const watchSheetStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 20,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  title: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
  },
  subtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginBottom: 20,
    lineHeight: 18,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 16,
    gap: 12,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  rowText: {
    flex: 1,
  },
  rowHeading: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 2,
  },
  rowDetail: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
  openBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 4,
    marginBottom: 12,
  },
  openBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  infoBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    marginTop: 4,
  },
  infoText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
    flex: 1,
  },
});

// ─── Main Tools Screen ───────────────────────────────────────────────────────

export default function ToolsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { isSignedIn } = useUser();
  const nav = useRouter();

  // ── Watch connectivity ───────────────────────────────────────────────────
  const { data: profile } = useGetProfile({
    query: { enabled: !!isSignedIn, queryKey: getGetProfileQueryKey() },
  });

  const gestationalWeek = useMemo(() => {
    if (!profile?.dueDate) return undefined;
    try {
      return calculateByDueDate(new Date(profile.dueDate))
        .currentGestationalAgeWeeks;
    } catch {
      return undefined;
    }
  }, [profile?.dueDate]);

  const watchTips = useMemo((): WatchTip[] => {
    if (gestationalWeek == null) return [];
    return getWeeklyTips(gestationalWeek);
  }, [gestationalWeek]);

  // Push gestational-week tips to the Watch; actual event handling (kick session
  // end, contraction update) is done by WatchBackgroundListener in the root
  // layout so data is saved regardless of which tab is active.
  const { watchStatus } = useWatchConnectivity({
    gestationalWeek,
    tips: watchTips,
  });
  const isTablet = useIsTablet();
  // ── End watch connectivity ───────────────────────────────────────────────

  if (!isSignedIn) {
    return (
      <View
        style={[
          styles.signInScreen,
          { backgroundColor: colors.background, paddingTop: insets.top + 20 },
        ]}
      >
        <Ionicons
          name="lock-closed-outline"
          size={48}
          color={colors.mutedForeground}
        />
        <Text style={[styles.signInTitle, { color: colors.foreground }]}>
          Sign in to use Tools
        </Text>
        <Text style={[styles.signInSub, { color: colors.mutedForeground }]}>
          Your symptom logs, kick counts, and contraction history sync securely
          across devices.
        </Text>
        <TouchableOpacity
          onPress={() => nav.push("/(auth)/sign-in")}
          style={[styles.signInBtn, { backgroundColor: colors.primary }]}
        >
          <Ionicons name="log-in-outline" size={18} color="#fff" />
          <Text style={styles.signInBtnText}>Sign In</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ResponsiveContainer>
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <Animated.View entering={FadeInDown.duration(400)}>
            <Text style={[styles.pageTitle, { color: colors.foreground }]}>
              Pregnancy Tools
            </Text>
            <Text style={[styles.pageSub, { color: colors.mutedForeground }]}>
              Journal your journey, track symptoms, kicks, and contractions.
            </Text>
          </Animated.View>

          {/* Journal + Fetal HR — side by side on iPad, stacked on phone */}
          <View style={isTablet ? styles.navCardRow : undefined}>
            <Animated.View
              entering={FadeInDown.delay(40).duration(400)}
              style={[
                styles.card,
                { backgroundColor: colors.card, borderColor: colors.border },
                isTablet && styles.navCardRowItem,
              ]}
            >
              <TouchableOpacity
                style={styles.navCard}
                onPress={() => router.push("/journal")}
                activeOpacity={0.8}
              >
                <View
                  style={[
                    styles.navCardIcon,
                    { backgroundColor: (colors.primary ?? "#e86cad") + "18" },
                  ]}
                >
                  <Ionicons
                    name="book"
                    size={22}
                    color={colors.primary ?? "#e86cad"}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={[styles.navCardTitle, { color: colors.foreground }]}
                  >
                    My Pregnancy Journal
                  </Text>
                  <Text
                    style={[
                      styles.navCardSub,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    Write entries, attach bump photos, and save ultrasound
                    images — all stored privately on your phone.
                  </Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={colors.mutedForeground}
                />
              </TouchableOpacity>
            </Animated.View>

            <Animated.View
              entering={FadeInDown.delay(60).duration(400)}
              style={[
                styles.card,
                { backgroundColor: colors.card, borderColor: colors.border },
                isTablet && styles.navCardRowItem,
              ]}
            >
              <TouchableOpacity
                style={styles.navCard}
                onPress={() => router.push("/fetal-heart-rate")}
                activeOpacity={0.8}
              >
                <View
                  style={[
                    styles.navCardIcon,
                    { backgroundColor: (colors.primary ?? "#e86cad") + "18" },
                  ]}
                >
                  <Ionicons
                    name="pulse"
                    size={22}
                    color={colors.primary ?? "#e86cad"}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={[styles.navCardTitle, { color: colors.foreground }]}
                  >
                    Fetal Heart Rate
                  </Text>
                  <Text
                    style={[
                      styles.navCardSub,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    Record the heartbeat heard on Doppler during an office visit
                    — saved privately on your phone.
                  </Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={colors.mutedForeground}
                />
              </TouchableOpacity>
            </Animated.View>
          </View>

          <Animated.View
            entering={FadeInDown.delay(80).duration(400)}
            style={[
              styles.card,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <SymptomLogSection />
          </Animated.View>

          {Platform.OS === "ios" && (
            <Animated.View entering={FadeInDown.delay(140).duration(400)}>
              <WatchStatusBadge
                isReachable={watchStatus.isReachable}
                isWatchAppInstalled={watchStatus.isWatchAppInstalled}
                activationState={watchStatus.activationState}
              />
            </Animated.View>
          )}

          <Animated.View
            entering={FadeInDown.delay(160).duration(400)}
            style={[
              styles.card,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <KickCounterSection />
          </Animated.View>

          <Animated.View
            entering={FadeInDown.delay(240).duration(400)}
            style={[
              styles.card,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <ContractionTimerSection />
          </Animated.View>

          <Animated.View
            entering={FadeInDown.delay(320).duration(400)}
            style={[
              styles.card,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <RemindersSection />
          </Animated.View>
        </ScrollView>
      </ResponsiveContainer>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: 16,
  },
  pageTitle: {
    fontSize: 28,
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
  signInScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 12,
  },
  signInTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  signInSub: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 22,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: Platform.OS === "ios" ? 40 : 24,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
  },
  label: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    marginBottom: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    marginBottom: 16,
  },
  textArea: {
    height: 80,
    textAlignVertical: "top",
  },
  severityBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  primaryBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  navCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  navCardRow: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 0,
  },
  navCardRowItem: {
    flex: 1,
    marginBottom: 16,
  },
  navCardIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  navCardTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 2,
  },
  navCardSub: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
  signInBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 24,
    paddingHorizontal: 22,
    paddingVertical: 12,
    marginTop: 8,
  },
  signInBtnText: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  historyBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 10,
    marginTop: 4,
  },
  historyBtnText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
});
