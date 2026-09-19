/**
 * Session History — all kick count and contraction timer sessions across
 * every device (phone, iPad, Apple Watch), browsable and shareable with
 * a provider via the system share sheet.
 *
 * Supports delete and edit-notes directly from each row.
 */
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  FlatList,
  Modal,
  Platform,
  RefreshControl,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  useListKickSessions,
  useListContractions,
  useDeleteKickSession,
  useDeleteContractionSession,
  useUpdateKickSession,
} from "@workspace/api-client-react";
import type { KickSession, Contraction } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { parseApiDate } from "@/lib/dates";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatSeconds(seconds: number | null | undefined): string {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatLongDate(iso: string): string {
  // parseApiDate, not new Date: `sessionDate` is a bare calendar date, and
  // new Date("2026-08-13") is UTC midnight — the 12th, 8pm, in New York.
  return parseApiDate(iso).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatShortTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function sessionDurMin(
  startedAt: string,
  endedAt?: string | null,
): number | null {
  if (!endedAt) return null;
  return Math.round(
    (new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 60000,
  );
}

// ─── Cross-platform note edit modal ──────────────────────────────────────────

interface EditNoteModalProps {
  visible: boolean;
  initialNote: string;
  onSave: (note: string) => void;
  onCancel: () => void;
}

function EditNoteModal({
  visible,
  initialNote,
  onSave,
  onCancel,
}: EditNoteModalProps) {
  const colors = useColors();
  const [text, setText] = useState(initialNote);

  // Sync when a new item is opened
  React.useEffect(() => {
    if (visible) setText(initialNote);
  }, [visible, initialNote]);

  const ms = StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.45)",
      justifyContent: "center",
      padding: 24,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: 20,
      gap: 16,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    title: {
      fontSize: 17,
      fontWeight: "600",
      color: colors.foreground,
    },
    input: {
      backgroundColor: colors.background,
      borderRadius: 10,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      padding: 12,
      fontSize: 15,
      color: colors.foreground,
      minHeight: 80,
      textAlignVertical: "top",
    },
    actions: {
      flexDirection: "row",
      gap: 10,
    },
    cancelBtn: {
      flex: 1,
      paddingVertical: 11,
      borderRadius: 10,
      alignItems: "center",
      backgroundColor: colors.muted,
    },
    cancelLabel: {
      fontSize: 15,
      fontWeight: "500",
      color: colors.mutedForeground,
    },
    saveBtn: {
      flex: 1,
      paddingVertical: 11,
      borderRadius: 10,
      alignItems: "center",
      backgroundColor: colors.primary,
    },
    saveLabel: {
      fontSize: 15,
      fontWeight: "600",
      color: "#ffffff",
    },
  });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={ms.overlay}>
        <View style={ms.card}>
          <Text style={ms.title}>Edit Note</Text>
          <TextInput
            style={ms.input}
            value={text}
            onChangeText={setText}
            placeholder="Add a note…"
            placeholderTextColor={colors.mutedForeground}
            multiline
            autoFocus
          />
          <View style={ms.actions}>
            <TouchableOpacity style={ms.cancelBtn} onPress={onCancel}>
              <Text style={ms.cancelLabel}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={ms.saveBtn} onPress={() => onSave(text)}>
              <Text style={ms.saveLabel}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Contraction grouping ─────────────────────────────────────────────────────

interface ContractionGroup {
  sessionDate: string;
  items: Contraction[];
  count: number;
  avgDurationSec: number | null;
  avgIntervalSec: number | null;
  rule511: boolean;
}

function groupByDate(contractions: Contraction[]): ContractionGroup[] {
  const map = new Map<string, Contraction[]>();
  for (const c of contractions) {
    if (!map.has(c.sessionDate)) map.set(c.sessionDate, []);
    map.get(c.sessionDate)!.push(c);
  }

  const groups: ContractionGroup[] = [];
  for (const [sessionDate, items] of map) {
    const withDur = items.filter((c) => c.durationSeconds != null);
    const withInt = items.filter((c) => c.intervalSeconds != null);

    const avgDurationSec =
      withDur.length > 0
        ? Math.round(
            withDur.reduce((s, c) => s + c.durationSeconds!, 0) /
              withDur.length,
          )
        : null;

    const avgIntervalSec =
      withInt.length > 0
        ? Math.round(
            withInt.reduce((s, c) => s + c.intervalSeconds!, 0) /
              withInt.length,
          )
        : null;

    const rule511 =
      items.length >= 6 &&
      avgDurationSec != null &&
      avgDurationSec >= 60 &&
      avgIntervalSec != null &&
      avgIntervalSec <= 300;

    groups.push({
      sessionDate,
      items,
      count: items.length,
      avgDurationSec,
      avgIntervalSec,
      rule511,
    });
  }
  // API returns sessionDate DESC so map iteration preserves insertion order (newest first)
  return groups;
}

// ─── Share text builders ──────────────────────────────────────────────────────

function buildKickShareText(sessions: KickSession[]): string {
  if (!sessions.length) return "No kick count sessions recorded.";
  const lines = ["KICK COUNT HISTORY", ""];
  for (const s of sessions) {
    const dur = sessionDurMin(s.startedAt, s.endedAt);
    lines.push(
      `${formatLongDate(s.startedAt)} at ${formatShortTime(s.startedAt)}`,
    );
    lines.push(
      `  ${s.kickCount} kick${s.kickCount !== 1 ? "s" : ""}${dur !== null ? ` · ${dur} min` : ""}`,
    );
    if (s.notes) lines.push(`  Note: ${s.notes}`);
    lines.push("");
  }
  return lines.join("\n");
}

function buildContractionShareText(groups: ContractionGroup[]): string {
  if (!groups.length) return "No contraction sessions recorded.";
  const lines = ["CONTRACTION TIMER HISTORY", ""];
  for (const g of groups) {
    lines.push(formatLongDate(g.sessionDate));
    lines.push(
      `  ${g.count} contraction${g.count !== 1 ? "s" : ""}` +
        (g.avgDurationSec ? ` · avg ${formatSeconds(g.avgDurationSec)}` : "") +
        (g.avgIntervalSec ? ` · every ${formatSeconds(g.avgIntervalSec)}` : ""),
    );
    if (g.rule511) lines.push("  ⚠ 5-1-1 pattern detected");
    for (const c of g.items) {
      lines.push(
        `    ${formatShortTime(c.startedAt)} — ${formatSeconds(c.durationSeconds)}` +
          (c.intervalSeconds
            ? ` (interval ${formatSeconds(c.intervalSeconds)})`
            : ""),
      );
    }
    lines.push("");
  }
  return lines.join("\n");
}

// ─── Kick Count History Tab ───────────────────────────────────────────────────

interface KickHistoryTabProps {
  onShareReady: (fn: () => string) => void;
}

function KickHistoryTab({ onShareReady }: KickHistoryTabProps) {
  const colors = useColors();
  const ts = useTabStyles(colors);

  // Fetch up to 50 most-recent sessions (per-user history)
  const { data, isFetching, refetch } = useListKickSessions({
    limit: 50,
    offset: 0,
  });
  const sessions = data?.items ?? [];

  const deleteMutation = useDeleteKickSession();
  const updateMutation = useUpdateKickSession();

  // Edit-note modal state (cross-platform)
  const [editingSession, setEditingSession] = useState<KickSession | null>(
    null,
  );

  // Refresh whenever the screen comes back into focus so kicks logged in
  // the counter (tools.tsx) appear immediately without a manual pull-to-refresh.
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  // Also refetch when the app returns from background while this tab is active
  // (useFocusEffect does not fire for AppState transitions).
  React.useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") refetch();
    });
    return () => sub.remove();
  }, [refetch]);

  // Register share builder whenever sessions change
  const shareRef = useRef<() => string>(() => buildKickShareText(sessions));
  shareRef.current = () => buildKickShareText(sessions);
  React.useEffect(() => {
    onShareReady(() => shareRef.current());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDelete = useCallback(
    (id: number) => {
      Alert.alert("Delete Session", "Remove this kick count session?", [
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

  const handleOpenEditNote = useCallback((item: KickSession) => {
    setEditingSession(item);
  }, []);

  const handleSaveNote = useCallback(
    async (note: string) => {
      if (!editingSession) return;
      await updateMutation.mutateAsync({
        id: editingSession.id,
        data: { notes: note },
      });
      setEditingSession(null);
      refetch();
    },
    [editingSession, updateMutation, refetch],
  );

  const renderItem = useCallback(
    ({ item }: { item: KickSession }) => {
      const dur = sessionDurMin(item.startedAt, item.endedAt);
      return (
        <View style={ts.row}>
          <View style={ts.rowIcon}>
            <Ionicons name="heart-outline" size={18} color={colors.primary} />
          </View>
          <View style={ts.rowBody}>
            <Text style={ts.rowTitle}>{item.kickCount} kicks</Text>
            <Text style={ts.rowMeta}>
              {formatLongDate(item.startedAt)} ·{" "}
              {formatShortTime(item.startedAt)}
              {dur !== null ? ` · ${dur} min` : ""}
            </Text>
            {item.notes ? <Text style={ts.rowNote}>{item.notes}</Text> : null}
          </View>
          <View style={ts.rowActions}>
            <TouchableOpacity
              onPress={() => handleOpenEditNote(item)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={ts.actionBtn}
              accessibilityLabel="Edit note"
            >
              <Ionicons
                name="create-outline"
                size={18}
                color={colors.mutedForeground}
              />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleDelete(item.id)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={ts.actionBtn}
              accessibilityLabel="Delete session"
            >
              <Ionicons
                name="trash-outline"
                size={18}
                color={colors.destructive}
              />
            </TouchableOpacity>
          </View>
        </View>
      );
    },
    [colors, ts, handleDelete, handleOpenEditNote],
  );

  return (
    <>
      <FlatList
        data={sessions}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        contentContainerStyle={ts.list}
        ListEmptyComponent={
          isFetching ? (
            <View style={ts.center}>
              <ActivityIndicator
                testID="kick-history-spinner"
                color={colors.primary}
              />
            </View>
          ) : (
            <View style={ts.center} testID="kick-history-empty">
              <Ionicons
                name="heart-outline"
                size={40}
                color={colors.mutedForeground}
              />
              <Text style={ts.emptyTitle}>No sessions yet</Text>
              <Text style={ts.emptySub}>
                Sessions from this phone, your iPad, and your Apple Watch all
                appear here.
              </Text>
            </View>
          )
        }
        refreshControl={
          <RefreshControl
            refreshing={isFetching}
            onRefresh={refetch}
            testID="kick-history-refresh-control"
          />
        }
      />
      <EditNoteModal
        visible={editingSession !== null}
        initialNote={editingSession?.notes ?? ""}
        onSave={handleSaveNote}
        onCancel={() => setEditingSession(null)}
      />
    </>
  );
}

// ─── Contraction History Tab ──────────────────────────────────────────────────

interface ContractionHistoryTabProps {
  onShareReady: (fn: () => string) => void;
}

function ContractionHistoryTab({ onShareReady }: ContractionHistoryTabProps) {
  const colors = useColors();
  const ts = useTabStyles(colors);

  // Omit sessionDate → API returns all dates
  const { data, isFetching, refetch } = useListContractions({ limit: 200 });
  const groups = useMemo(() => groupByDate(data?.items ?? []), [data]);

  // Refresh whenever the screen comes back into focus so contractions logged in
  // the timer (tools.tsx) appear immediately without a manual pull-to-refresh.
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  // Also refetch when the app returns from background while this tab is active
  // (useFocusEffect does not fire for AppState transitions).
  React.useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") refetch();
    });
    return () => sub.remove();
  }, [refetch]);

  const deleteMutation = useDeleteContractionSession();

  const shareRef = useRef<() => string>(() =>
    buildContractionShareText(groups),
  );
  shareRef.current = () => buildContractionShareText(groups);
  React.useEffect(() => {
    onShareReady(() => shareRef.current());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDeleteSession = useCallback(
    (date: string) => {
      Alert.alert(
        "Delete Session",
        "Remove all contractions from this session?",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              try {
                await deleteMutation.mutateAsync({ date });
                refetch();
              } catch {
                Alert.alert(
                  "Delete failed",
                  "Could not remove this session. Please check your connection and try again.",
                );
              }
            },
          },
        ],
      );
    },
    [deleteMutation, refetch],
  );

  const renderGroup = useCallback(
    ({ item: g }: { item: ContractionGroup }) => (
      <View style={ts.groupCard}>
        <View style={ts.groupHeader}>
          <Text style={ts.groupDate}>{formatLongDate(g.sessionDate)}</Text>
          <View style={ts.groupHeaderRight}>
            {g.rule511 && (
              <View style={ts.badge511}>
                <Ionicons name="warning-outline" size={12} color="#92400e" />
                <Text style={ts.badge511Text}>5-1-1</Text>
              </View>
            )}
            <TouchableOpacity
              onPress={() => handleDeleteSession(g.sessionDate)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel="Delete session"
            >
              <Ionicons
                name="trash-outline"
                size={16}
                color={colors.destructive}
              />
            </TouchableOpacity>
          </View>
        </View>
        <Text style={ts.groupSummary}>
          {g.count} contraction{g.count !== 1 ? "s" : ""}
          {g.avgDurationSec ? ` · avg ${formatSeconds(g.avgDurationSec)}` : ""}
          {g.avgIntervalSec
            ? ` · every ${formatSeconds(g.avgIntervalSec)}`
            : ""}
        </Text>
        {g.items.map((c) => (
          <View key={c.id} style={ts.contractionRow}>
            <Text style={ts.contractionTime}>
              {formatShortTime(c.startedAt)}
            </Text>
            <Text style={ts.contractionDur}>
              {formatSeconds(c.durationSeconds)}
            </Text>
            {c.intervalSeconds ? (
              <Text style={ts.contractionInterval}>
                interval {formatSeconds(c.intervalSeconds)}
              </Text>
            ) : null}
          </View>
        ))}
      </View>
    ),
    [ts, colors, handleDeleteSession],
  );

  return (
    <FlatList
      data={groups}
      keyExtractor={(g) => g.sessionDate}
      renderItem={renderGroup}
      contentContainerStyle={ts.list}
      ListEmptyComponent={
        isFetching ? (
          <View style={ts.center}>
            <ActivityIndicator
              testID="contraction-history-spinner"
              color={colors.primary}
            />
          </View>
        ) : (
          <View style={ts.center} testID="contraction-history-empty">
            <Ionicons
              name="timer-outline"
              size={40}
              color={colors.mutedForeground}
            />
            <Text style={ts.emptyTitle}>No sessions yet</Text>
            <Text style={ts.emptySub}>
              Sessions from this phone, your iPad, and your Apple Watch all
              appear here.
            </Text>
          </View>
        )
      }
      refreshControl={
        <RefreshControl
          refreshing={isFetching}
          onRefresh={refetch}
          testID="contraction-history-refresh-control"
        />
      }
    />
  );
}

// ─── Root Screen ──────────────────────────────────────────────────────────────

type ActiveTab = "kicks" | "contractions";

export default function SessionHistoryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const [activeTab, setActiveTab] = useState<ActiveTab>("kicks");

  // Each tab registers a share-text builder when it mounts
  const kickShareFn = useRef<() => string>(
    () => "No kick count sessions recorded.",
  );
  const contractionShareFn = useRef<() => string>(
    () => "No contraction sessions recorded.",
  );

  const handleKickShareReady = useCallback((fn: () => string) => {
    kickShareFn.current = fn;
  }, []);
  const handleContractionShareReady = useCallback((fn: () => string) => {
    contractionShareFn.current = fn;
  }, []);

  const handleShare = useCallback(async () => {
    const text =
      activeTab === "kicks"
        ? kickShareFn.current()
        : contractionShareFn.current();
    const title =
      activeTab === "kicks" ? "Kick Count History" : "Contraction History";
    try {
      await Share.share({ message: text, title });
    } catch {
      // User dismissed the share sheet — ignore
    }
  }, [activeTab]);

  const ss = useScreenStyles(colors, insets);

  return (
    <View style={ss.screen}>
      {/* ── Header ── */}
      <View style={ss.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={ss.headerSide}
        >
          <Ionicons name="chevron-back" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={ss.headerTitle}>Session History</Text>
        <TouchableOpacity
          onPress={handleShare}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={ss.headerSide}
        >
          <Ionicons
            name={
              Platform.OS === "ios" ? "share-outline" : "share-social-outline"
            }
            size={22}
            color={colors.primary}
          />
        </TouchableOpacity>
      </View>

      {/* ── Tab Selector ── */}
      <View style={ss.tabBar}>
        {(["kicks", "contractions"] as ActiveTab[]).map((tab) => (
          <TouchableOpacity
            key={tab}
            testID={`tab-btn-${tab}`}
            style={[ss.tabBtn, activeTab === tab && ss.tabBtnActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[ss.tabLabel, activeTab === tab && ss.tabLabelActive]}>
              {tab === "kicks" ? "Kick Count" : "Contractions"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Content ── */}
      <View style={ss.content}>
        {activeTab === "kicks" ? (
          <KickHistoryTab onShareReady={handleKickShareReady} />
        ) : (
          <ContractionHistoryTab onShareReady={handleContractionShareReady} />
        )}
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function useScreenStyles(
  colors: ReturnType<typeof useColors>,
  insets: ReturnType<typeof useSafeAreaInsets>,
) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.background,
      paddingTop: insets.top,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    headerSide: {
      width: 36,
      alignItems: "center",
    },
    headerTitle: {
      flex: 1,
      textAlign: "center",
      fontSize: 17,
      fontWeight: "600",
      color: colors.foreground,
    },
    tabBar: {
      flexDirection: "row",
      padding: 12,
      gap: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    tabBtn: {
      flex: 1,
      paddingVertical: 9,
      borderRadius: 8,
      alignItems: "center",
      backgroundColor: colors.muted,
    },
    tabBtnActive: {
      backgroundColor: colors.primary,
    },
    tabLabel: {
      fontSize: 14,
      fontWeight: "500",
      color: colors.mutedForeground,
    },
    tabLabelActive: {
      color: "#ffffff",
    },
    content: {
      flex: 1,
    },
  });
}

function useTabStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    list: {
      padding: 16,
      gap: 12,
    },
    center: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      padding: 32,
    },
    emptyTitle: {
      fontSize: 16,
      fontWeight: "600",
      color: colors.foreground,
      textAlign: "center",
    },
    emptySub: {
      fontSize: 14,
      color: colors.mutedForeground,
      textAlign: "center",
      lineHeight: 20,
    },
    // Kick session rows
    row: {
      flexDirection: "row",
      alignItems: "flex-start",
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 14,
      gap: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    rowIcon: {
      marginTop: 1,
    },
    rowBody: {
      flex: 1,
      gap: 3,
    },
    rowTitle: {
      fontSize: 15,
      fontWeight: "600",
      color: colors.foreground,
    },
    rowMeta: {
      fontSize: 13,
      color: colors.mutedForeground,
    },
    rowNote: {
      fontSize: 13,
      color: colors.mutedForeground,
      fontStyle: "italic",
      marginTop: 2,
    },
    rowActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      marginTop: 1,
    },
    actionBtn: {
      padding: 4,
    },
    // Contraction group cards
    groupCard: {
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 14,
      gap: 8,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    groupHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    groupHeaderRight: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    groupDate: {
      flex: 1,
      fontSize: 15,
      fontWeight: "600",
      color: colors.foreground,
    },
    badge511: {
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
      backgroundColor: "#fef3c7",
      borderRadius: 6,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    badge511Text: {
      fontSize: 11,
      fontWeight: "600",
      color: "#92400e",
    },
    groupSummary: {
      fontSize: 13,
      color: colors.mutedForeground,
    },
    contractionRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingVertical: 4,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    contractionTime: {
      fontSize: 13,
      color: colors.mutedForeground,
      width: 60,
    },
    contractionDur: {
      fontSize: 13,
      fontWeight: "500",
      color: colors.foreground,
      width: 48,
    },
    contractionInterval: {
      fontSize: 12,
      color: colors.mutedForeground,
      flex: 1,
    },
  });
}
