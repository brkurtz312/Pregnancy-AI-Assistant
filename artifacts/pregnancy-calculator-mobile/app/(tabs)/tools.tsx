import { Ionicons } from "@expo/vector-icons";
import { useUser } from "@clerk/expo";
import * as Haptics from "expo-haptics";
import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  ActivityIndicator,
  Alert,
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
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";

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

function KickCounterSection() {
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
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [createMutation]);

  const handleKick = useCallback(async () => {
    if (!activeSessionId) return;
    const next = kickCount + 1;
    setKickCount(next);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
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
  });

  return (
    <View style={s.container}>
      <View style={s.row}>
        <Text style={s.title}>Kick Counter</Text>
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
    </View>
  );
}

// ─── Contraction Timer Section ───────────────────────────────────────────────

function ContractionTimerSection() {
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
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
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
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

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
      backgroundColor: "#FEF3C7",
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
      color: "#92400E",
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
  });

  return (
    <View style={s.container}>
      <View style={s.row}>
        <Text style={s.title}>Contraction Timer</Text>
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
          <Ionicons name="warning-outline" size={18} color="#92400E" />
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
    </View>
  );
}

// ─── Main Tools Screen ───────────────────────────────────────────────────────

export default function ToolsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { isSignedIn } = useUser();

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
      </View>
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
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
          Track your symptoms, baby kicks, and contractions.
        </Text>
      </Animated.View>

      <Animated.View
        entering={FadeInDown.delay(80).duration(400)}
        style={[
          styles.card,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <SymptomLogSection />
      </Animated.View>

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
    </ScrollView>
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
});
