import DateTimePicker, {
  DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import { useUser } from "@clerk/expo";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
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
  useListPrenatalVisits,
  useCreatePrenatalVisit,
  useUpdatePrenatalVisit,
  useDeletePrenatalVisit,
  type PrenatalVisit,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import {
  loadQuestions,
  saveQuestions,
  type QuestionItem,
} from "@/lib/visit-questions";

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return (
    d.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    }) +
    " · " +
    d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
  );
}

function formatCountdown(target: Date) {
  const ms = target.getTime() - Date.now();
  if (ms <= 0) return "Happening now";
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
  if (days > 0) {
    return `In ${days} day${days === 1 ? "" : "s"}${hours > 0 ? ` ${hours}h` : ""}`;
  }
  if (hours > 0) return `In ${hours} hour${hours === 1 ? "" : "s"}`;
  const minutes = Math.max(1, Math.floor(ms / (1000 * 60)));
  return `In ${minutes} minute${minutes === 1 ? "" : "s"}`;
}

// ─── Date/Time Field ─────────────────────────────────────────────────────────

function DateTimeField({
  value,
  onChange,
  label,
}: {
  value: Date;
  onChange: (date: Date) => void;
  label: string;
}) {
  const colors = useColors();
  const [showPicker, setShowPicker] = useState(false);
  const isWeb = Platform.OS === "web";
  const isAndroid = Platform.OS === "android";

  const displayText =
    value.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    }) +
    " " +
    value.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

  if (isWeb) {
    return (
      <View style={{ marginBottom: 16 }}>
        <Text style={[fieldStyles.label, { color: colors.mutedForeground }]}>
          {label}
        </Text>
        <TextInput
          style={[
            fieldStyles.input,
            {
              borderColor: colors.border,
              color: colors.foreground,
              backgroundColor: colors.card,
            },
          ]}
          placeholder="MM/DD/YYYY HH:MM"
          placeholderTextColor={colors.mutedForeground}
          defaultValue={displayText}
          onChangeText={(text) => {
            const parsed = new Date(text);
            if (!isNaN(parsed.getTime())) onChange(parsed);
          }}
        />
      </View>
    );
  }

  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={[fieldStyles.label, { color: colors.mutedForeground }]}>
        {label}
      </Text>
      <TouchableOpacity
        style={[
          fieldStyles.dateButton,
          { borderColor: colors.border, backgroundColor: colors.card },
        ]}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setShowPicker(true);
        }}
      >
        <Ionicons name="calendar-outline" size={18} color={colors.primary} />
        <Text
          style={[fieldStyles.dateButtonText, { color: colors.foreground }]}
        >
          {displayText}
        </Text>
      </TouchableOpacity>

      {isAndroid && showPicker && (
        <DateTimePicker
          value={value}
          mode="datetime"
          display="default"
          onChange={(_event: DateTimePickerEvent, date?: Date) => {
            setShowPicker(false);
            if (date) onChange(date);
          }}
        />
      )}

      {!isAndroid && (
        <Modal visible={showPicker} transparent animationType="slide">
          <Pressable
            style={fieldStyles.modalOverlay}
            onPress={() => setShowPicker(false)}
          >
            <Pressable
              style={[
                fieldStyles.pickerSheet,
                { backgroundColor: colors.card },
              ]}
            >
              <View
                style={[
                  fieldStyles.pickerHeader,
                  { borderBottomColor: colors.border },
                ]}
              >
                <Text
                  style={[
                    fieldStyles.pickerTitle,
                    { color: colors.foreground },
                  ]}
                >
                  {label}
                </Text>
                <TouchableOpacity onPress={() => setShowPicker(false)}>
                  <Text
                    style={[fieldStyles.pickerDone, { color: colors.primary }]}
                  >
                    Done
                  </Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={value}
                mode="datetime"
                display="spinner"
                onChange={(_event: DateTimePickerEvent, date?: Date) => {
                  if (date) onChange(date);
                }}
                style={{ height: 200 }}
              />
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </View>
  );
}

const fieldStyles = StyleSheet.create({
  label: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  dateButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
  dateButtonText: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  pickerSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 24,
  },
  pickerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
  },
  pickerTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  pickerDone: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
});

// ─── Visit Modal (schedule or log) ───────────────────────────────────────────

function VisitModal({
  visible,
  onClose,
  onSave,
  initial,
  saving,
}: {
  visible: boolean;
  onClose: () => void;
  onSave: (data: {
    visitDate: Date;
    weight: string;
    bloodPressure: string;
    notes: string;
  }) => void;
  initial?: PrenatalVisit | null;
  saving: boolean;
}) {
  const colors = useColors();
  const [visitDate, setVisitDate] = useState(new Date());
  const [weight, setWeight] = useState("");
  const [bloodPressure, setBloodPressure] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (visible) {
      setVisitDate(initial ? new Date(initial.visitDate) : new Date());
      setWeight(initial?.weight ?? "");
      setBloodPressure(initial?.bloodPressure ?? "");
      setNotes(initial?.notes ?? "");
    }
  }, [visible, initial]);

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View
          style={[styles.modalSheet, { backgroundColor: colors.background }]}
        >
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>
                {initial ? "Edit Visit" : "Add Visit"}
              </Text>
              <TouchableOpacity onPress={onClose}>
                <Ionicons
                  name="close"
                  size={22}
                  color={colors.mutedForeground}
                />
              </TouchableOpacity>
            </View>

            <DateTimeField
              label="Date & Time"
              value={visitDate}
              onChange={setVisitDate}
            />

            <Text
              style={[fieldStyles.label, { color: colors.mutedForeground }]}
            >
              Weight (optional)
            </Text>
            <TextInput
              style={[
                fieldStyles.input,
                {
                  color: colors.foreground,
                  borderColor: colors.border,
                  backgroundColor: colors.card,
                  marginBottom: 16,
                },
              ]}
              value={weight}
              onChangeText={setWeight}
              placeholder="e.g. 148 lbs"
              placeholderTextColor={colors.mutedForeground}
            />

            <Text
              style={[fieldStyles.label, { color: colors.mutedForeground }]}
            >
              Blood Pressure (optional)
            </Text>
            <TextInput
              style={[
                fieldStyles.input,
                {
                  color: colors.foreground,
                  borderColor: colors.border,
                  backgroundColor: colors.card,
                  marginBottom: 16,
                },
              ]}
              value={bloodPressure}
              onChangeText={setBloodPressure}
              placeholder="e.g. 118/76"
              placeholderTextColor={colors.mutedForeground}
            />

            <Text
              style={[fieldStyles.label, { color: colors.mutedForeground }]}
            >
              Notes (optional)
            </Text>
            <TextInput
              style={[
                fieldStyles.input,
                styles.textArea,
                {
                  color: colors.foreground,
                  borderColor: colors.border,
                  backgroundColor: colors.card,
                  marginBottom: 16,
                },
              ]}
              value={notes}
              onChangeText={setNotes}
              placeholder="What did the doctor say? Anything to follow up on?"
              placeholderTextColor={colors.mutedForeground}
              multiline
              numberOfLines={3}
            />

            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
              onPress={() =>
                onSave({ visitDate, weight, bloodPressure, notes })
              }
              disabled={saving}
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
                  Save
                </Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ─── Next Appointment Section ────────────────────────────────────────────────

function NextAppointmentSection({
  next,
  onAdd,
  onEdit,
  onDelete,
}: {
  next: PrenatalVisit | null;
  onAdd: () => void;
  onEdit: (v: PrenatalVisit) => void;
  onDelete: (id: number) => void;
}) {
  const colors = useColors();
  const [, forceTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => forceTick((n) => n + 1), 60000);
    return () => clearInterval(interval);
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Text style={[styles.title, { color: colors.foreground }]}>
          Next Appointment
        </Text>
        {next && (
          <TouchableOpacity
            style={[styles.addBtn, { backgroundColor: colors.primary }]}
            onPress={onAdd}
          >
            <Ionicons name="add" size={14} color={colors.primaryForeground} />
            <Text
              style={[styles.addBtnText, { color: colors.primaryForeground }]}
            >
              New
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {next ? (
        <View
          style={[
            styles.nextCard,
            {
              backgroundColor: colors.primary + "18",
              borderColor: colors.primary,
            },
          ]}
        >
          <Text style={[styles.countdown, { color: colors.primary }]}>
            {formatCountdown(new Date(next.visitDate))}
          </Text>
          <Text style={[styles.nextDate, { color: colors.foreground }]}>
            {formatDateTime(next.visitDate)}
          </Text>
          <View style={styles.nextActions}>
            <TouchableOpacity
              style={[styles.smallBtn, { borderColor: colors.border }]}
              onPress={() => onEdit(next)}
            >
              <Text style={[styles.smallBtnText, { color: colors.foreground }]}>
                Reschedule
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.smallBtn, { borderColor: colors.border }]}
              onPress={() => onDelete(next.id)}
            >
              <Text style={[styles.smallBtnText, { color: colors.foreground }]}>
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity
          style={[styles.startBtn, { backgroundColor: colors.primary }]}
          onPress={onAdd}
        >
          <Text
            style={[styles.startBtnText, { color: colors.primaryForeground }]}
          >
            Schedule an Appointment
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Appointment Log Section ─────────────────────────────────────────────────

function AppointmentLogSection({
  past,
  onAdd,
  onEdit,
  onDelete,
}: {
  past: PrenatalVisit[];
  onAdd: () => void;
  onEdit: (v: PrenatalVisit) => void;
  onDelete: (id: number) => void;
}) {
  const colors = useColors();

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Text style={[styles.title, { color: colors.foreground }]}>
          Appointment Log
        </Text>
        <TouchableOpacity
          style={[styles.addBtn, { backgroundColor: colors.primary }]}
          onPress={onAdd}
        >
          <Ionicons name="add" size={14} color={colors.primaryForeground} />
          <Text
            style={[styles.addBtnText, { color: colors.primaryForeground }]}
          >
            Log Visit
          </Text>
        </TouchableOpacity>
      </View>

      {!past.length && (
        <Text style={[styles.empty, { color: colors.mutedForeground }]}>
          No past visits logged yet.
        </Text>
      )}

      {past.map((item) => (
        <TouchableOpacity
          key={item.id}
          style={[
            styles.item,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
          onPress={() => onEdit(item)}
        >
          <View style={styles.itemMain}>
            <Text style={[styles.itemDate, { color: colors.foreground }]}>
              {formatDateTime(item.visitDate)}
            </Text>
            {(item.weight || item.bloodPressure) && (
              <Text
                style={[styles.itemMeta, { color: colors.mutedForeground }]}
              >
                {[
                  item.weight ? `Weight: ${item.weight}` : null,
                  item.bloodPressure ? `BP: ${item.bloodPressure}` : null,
                ]
                  .filter(Boolean)
                  .join("  ·  ")}
              </Text>
            )}
            {item.notes ? (
              <Text
                style={[styles.itemMeta, { color: colors.mutedForeground }]}
              >
                {item.notes}
              </Text>
            ) : null}
          </View>
          <TouchableOpacity onPress={() => onDelete(item.id)}>
            <Ionicons
              name="trash-outline"
              size={18}
              color={colors.mutedForeground}
            />
          </TouchableOpacity>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ─── What Questions Do You Want to Ask Section ───────────────────────────────

function QuestionsToAskSection() {
  const colors = useColors();
  const [items, setItems] = useState<QuestionItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [newQuestion, setNewQuestion] = useState("");

  useEffect(() => {
    loadQuestions()
      .then(setItems)
      .finally(() => setLoaded(true));
  }, []);

  const persist = useCallback((next: QuestionItem[]) => {
    setItems(next);
    saveQuestions(next);
  }, []);

  const toggle = useCallback(
    (id: string) => {
      persist(
        items.map((q) => (q.id === id ? { ...q, selected: !q.selected } : q)),
      );
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    [items, persist],
  );

  const handleAdd = useCallback(() => {
    const text = newQuestion.trim();
    if (!text) return;
    persist([
      ...items,
      { id: `custom-${Date.now()}`, text, selected: true, custom: true },
    ]);
    setNewQuestion("");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [items, newQuestion, persist]);

  const handleRemove = useCallback(
    (id: string) => {
      persist(items.filter((q) => q.id !== id));
    },
    [items, persist],
  );

  const selectedCount = items.filter((q) => q.selected).length;

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Text style={[styles.title, { color: colors.foreground }]}>
          What Questions Do You Want to Ask?
        </Text>
        <Text style={[styles.progress, { color: colors.mutedForeground }]}>
          {selectedCount} selected
        </Text>
      </View>
      <Text
        style={[
          styles.questionsHint,
          { color: colors.mutedForeground, marginBottom: 12 },
        ]}
      >
        Pick from common questions or add your own. Selected questions are
        included in your visit summary.
      </Text>

      {!loaded && <ActivityIndicator color={colors.primary} />}
      {loaded &&
        items.map((q) => (
          <View key={q.id} style={styles.checklistRow}>
            <TouchableOpacity
              style={styles.checklistRowMain}
              onPress={() => toggle(q.id)}
            >
              <Ionicons
                name={q.selected ? "checkbox" : "square-outline"}
                size={22}
                color={q.selected ? colors.primary : colors.mutedForeground}
              />
              <Text
                style={[styles.checklistText, { color: colors.foreground }]}
              >
                {q.text}
              </Text>
            </TouchableOpacity>
            {q.custom && (
              <TouchableOpacity onPress={() => handleRemove(q.id)}>
                <Ionicons
                  name="trash-outline"
                  size={18}
                  color={colors.mutedForeground}
                />
              </TouchableOpacity>
            )}
          </View>
        ))}

      <View style={styles.addQuestionRow}>
        <TextInput
          style={[
            styles.addQuestionInput,
            {
              borderColor: colors.border,
              color: colors.foreground,
              backgroundColor: colors.muted,
            },
          ]}
          value={newQuestion}
          onChangeText={setNewQuestion}
          placeholder="Add your own question..."
          placeholderTextColor={colors.mutedForeground}
          onSubmitEditing={handleAdd}
          returnKeyType="done"
        />
        <TouchableOpacity
          style={[styles.addQuestionBtn, { backgroundColor: colors.primary }]}
          onPress={handleAdd}
          disabled={!newQuestion.trim()}
        >
          <Ionicons name="add" size={20} color={colors.primaryForeground} />
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={[styles.summaryBtn, { backgroundColor: colors.primary }]}
        onPress={() => router.push("/visit-summary")}
      >
        <Ionicons
          name="document-text-outline"
          size={18}
          color={colors.primaryForeground}
        />
        <Text
          style={[styles.summaryBtnText, { color: colors.primaryForeground }]}
        >
          View Visit Summary
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Learn Section ───────────────────────────────────────────────────────────

function LearnSection() {
  const colors = useColors();

  return (
    <>
      <TouchableOpacity
        style={[
          styles.learnCard,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
        onPress={() => router.push("/prenatal-testing")}
      >
        <View
          style={[styles.learnIcon, { backgroundColor: colors.primary + "18" }]}
        >
          <Ionicons
            name="document-text-outline"
            size={20}
            color={colors.primary}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.learnTitle, { color: colors.foreground }]}>
            Understanding Prenatal Testing
          </Text>
          <Text style={[styles.learnSub, { color: colors.mutedForeground }]}>
            What to expect and why these tests matter
          </Text>
        </View>
        <Ionicons
          name="chevron-forward"
          size={18}
          color={colors.mutedForeground}
        />
      </TouchableOpacity>

      <TouchableOpacity
        style={[
          styles.learnCard,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
        onPress={() =>
          router.push({
            pathname: "/birth-plan",
            params: { from: "Office Visit" },
          })
        }
      >
        <View
          style={[styles.learnIcon, { backgroundColor: colors.primary + "18" }]}
        >
          <Ionicons name="clipboard-outline" size={20} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.learnTitle, { color: colors.foreground }]}>
            Prepare Your Birth Plan
          </Text>
          <Text style={[styles.learnSub, { color: colors.mutedForeground }]}>
            Print a blank worksheet or answer questions to auto-fill one
          </Text>
        </View>
        <Ionicons
          name="chevron-forward"
          size={18}
          color={colors.mutedForeground}
        />
      </TouchableOpacity>
    </>
  );
}

// ─── Main Office Visit Screen ────────────────────────────────────────────────

export default function OfficeVisitScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { isSignedIn } = useUser();

  const { data, isLoading, refetch } = useListPrenatalVisits({
    limit: 50,
    offset: 0,
  });
  const createMutation = useCreatePrenatalVisit();
  const updateMutation = useUpdatePrenatalVisit();
  const deleteMutation = useDeletePrenatalVisit();

  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<PrenatalVisit | null>(null);

  const items = useMemo(() => data?.items ?? [], [data?.items]);
  const now = Date.now();
  const next = useMemo(() => {
    const upcoming = items
      .filter((v) => new Date(v.visitDate).getTime() > now)
      .sort(
        (a, b) =>
          new Date(a.visitDate).getTime() - new Date(b.visitDate).getTime(),
      );
    return upcoming[0] ?? null;
  }, [items, now]);
  const past = useMemo(
    () => items.filter((v) => new Date(v.visitDate).getTime() <= now),
    [items, now],
  );

  const openAdd = useCallback(() => {
    setEditing(null);
    setModalVisible(true);
  }, []);

  const openEdit = useCallback((v: PrenatalVisit) => {
    setEditing(v);
    setModalVisible(true);
  }, []);

  const handleSave = useCallback(
    async (data: {
      visitDate: Date;
      weight: string;
      bloodPressure: string;
      notes: string;
    }) => {
      const payload = {
        visitDate: data.visitDate.toISOString(),
        weight: data.weight.trim() || null,
        bloodPressure: data.bloodPressure.trim() || null,
        notes: data.notes.trim() || null,
      };
      if (editing) {
        await updateMutation.mutateAsync({ id: editing.id, data: payload });
      } else {
        await createMutation.mutateAsync({ data: payload });
      }
      setModalVisible(false);
      setEditing(null);
      refetch();
    },
    [editing, createMutation, updateMutation, refetch],
  );

  const handleDelete = useCallback(
    (id: number) => {
      Alert.alert("Delete", "Remove this visit?", [
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

  const header = (
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
          Get Ready
        </Text>
      </TouchableOpacity>
    </View>
  );

  if (!isSignedIn) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {header}
        <View style={styles.signInScreen}>
          <Ionicons
            name="lock-closed-outline"
            size={48}
            color={colors.mutedForeground}
          />
          <Text style={[styles.signInTitle, { color: colors.foreground }]}>
            Sign in to use Office Visit
          </Text>
          <Text style={[styles.signInSub, { color: colors.mutedForeground }]}>
            Your appointment log and reminders sync securely across devices.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {header}
      <ScrollView
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: 16, paddingBottom: insets.bottom + 24 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInDown.duration(400)}>
          <Text style={[styles.pageTitle, { color: colors.foreground }]}>
            Office Visit
          </Text>
          <Text style={[styles.pageSub, { color: colors.mutedForeground }]}>
            Get ready for your prenatal appointments.
          </Text>
        </Animated.View>

        {isLoading && !data ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
        ) : (
          <>
            <Animated.View
              entering={FadeInDown.delay(80).duration(400)}
              style={[
                styles.card,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <NextAppointmentSection
                next={next}
                onAdd={openAdd}
                onEdit={openEdit}
                onDelete={handleDelete}
              />
            </Animated.View>

            <Animated.View
              entering={FadeInDown.delay(160).duration(400)}
              style={[
                styles.card,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <AppointmentLogSection
                past={past}
                onAdd={openAdd}
                onEdit={openEdit}
                onDelete={handleDelete}
              />
            </Animated.View>
          </>
        )}

        <Animated.View
          entering={FadeInDown.delay(240).duration(400)}
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <QuestionsToAskSection />
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(300).duration(400)}>
          <LearnSection />
        </Animated.View>

        <VisitModal
          visible={modalVisible}
          onClose={() => {
            setModalVisible(false);
            setEditing(null);
          }}
          onSave={handleSave}
          initial={editing}
          saving={createMutation.isPending || updateMutation.isPending}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingBottom: 4,
    borderBottomWidth: 1,
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
  },
  backText: {
    fontSize: 16,
    fontFamily: "Inter_500Medium",
    marginLeft: 2,
  },
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
  },
  progress: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  addBtnText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  empty: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    paddingVertical: 16,
  },
  nextCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
  },
  learnCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 18,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
  },
  learnIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  learnTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 2,
  },
  learnSub: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  countdown: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    marginBottom: 4,
  },
  nextDate: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    marginBottom: 12,
  },
  nextActions: {
    flexDirection: "row",
    gap: 10,
  },
  smallBtn: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  smallBtnText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  startBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  startBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  item: {
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderWidth: 1,
  },
  itemMain: { flex: 1 },
  itemDate: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
  itemMeta: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  checklistRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 14,
  },
  checklistRowMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  checklistText: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
  },
  questionsHint: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
  addQuestionRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
    marginBottom: 16,
  },
  addQuestionInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  addQuestionBtn: {
    width: 42,
    height: 42,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  summaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 12,
    paddingVertical: 14,
  },
  summaryBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
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
    maxHeight: "85%",
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
  textArea: {
    height: 80,
    textAlignVertical: "top",
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
