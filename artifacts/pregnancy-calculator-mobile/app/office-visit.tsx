import { Ionicons } from "@expo/vector-icons";
import { useAppAuth as useUser } from "@/hooks/useAppAuth";
import * as Haptics from "expo-haptics";
import * as Print from "expo-print";
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
  getListPrenatalVisitsQueryKey,
  useCreatePrenatalVisit,
  useUpdatePrenatalVisit,
  useDeletePrenatalVisit,
  useListSymptoms,
  getListSymptomsQueryKey,
  useListKickSessions,
  getListKickSessionsQueryKey,
  useListContractions,
  getListContractionsQueryKey,
  useGetProfile,
  getGetProfileQueryKey,
  type PrenatalVisit,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import {
  loadQuestions,
  saveQuestions,
  type QuestionItem,
} from "@/lib/visit-questions";
import {
  scheduleAppointmentReminder,
  cancelAppointmentReminder,
} from "@/lib/appointment-reminders";
import { getGestationalAgeAtDate } from "@/lib/pregnancy-math";
import { getVisitExpectation } from "@/constants/prenatal-visit-expectations";
import { ResponsiveContainer } from "@/components/ResponsiveContainer";
import { parseApiDate } from "@/lib/dates";

// DateTimePicker is disabled until a new native build confirms its TurboModule
// is stable on iOS 26. All date entry falls back to TextInput.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DTPComponent = React.ComponentType<any>;
const DateTimePicker: DTPComponent | null = null;

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

  if (isWeb || !DateTimePicker) {
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
          onChange={(_event: unknown, date?: Date) => {
            setShowPicker(false);
            if (date) onChange(date);
          }}
        />
      )}

      {!isAndroid && showPicker && (
        <Modal visible={true} transparent animationType="slide">
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
                onChange={(_event: unknown, date?: Date) => {
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
  weightRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  unitBtn: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  unitBtnText: {
    fontSize: 14,
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
  defaultDate,
  mode,
}: {
  visible: boolean;
  onClose: () => void;
  onSave: (data: {
    visitDate: Date;
    weight: string;
    bloodPressure: string;
    fetalHeartRate: string;
    notes: string;
  }) => void;
  initial?: PrenatalVisit | null;
  saving: boolean;
  defaultDate?: Date;
  mode?: "schedule" | "log";
}) {
  const colors = useColors();
  const isSchedule = mode === "schedule";
  const [visitDate, setVisitDate] = useState(defaultDate ?? new Date());
  const [weight, setWeight] = useState("");
  const [weightUnit, setWeightUnit] = useState<"lbs" | "kg">("lbs");
  const [bloodPressure, setBloodPressure] = useState("");
  const [fetalHeartRate, setFetalHeartRate] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (visible) {
      setVisitDate(
        initial ? new Date(initial.visitDate) : (defaultDate ?? new Date()),
      );
      const raw = initial?.weight ?? "";
      const unitMatch = raw.match(/\b(lbs|kg)\s*$/i);
      if (unitMatch) {
        setWeightUnit(unitMatch[1]!.toLowerCase() as "lbs" | "kg");
        setWeight(raw.replace(/\s*(lbs|kg)\s*$/i, "").trim());
      } else {
        setWeight(raw);
      }
      setBloodPressure(initial?.bloodPressure ?? "");
      setFetalHeartRate(initial?.fetalHeartRate ?? "");
      setNotes(initial?.notes ?? "");
    }
  }, [visible, initial, defaultDate]);

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View
          style={[styles.modalSheet, { backgroundColor: colors.background }]}
        >
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>
                {initial
                  ? "Edit Appointment"
                  : isSchedule
                    ? "Schedule Appointment"
                    : "Log Visit"}
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

            {!isSchedule && (
              <>
                <Text
                  style={[fieldStyles.label, { color: colors.mutedForeground }]}
                >
                  Weight (optional)
                </Text>
                <View style={[fieldStyles.weightRow, { marginBottom: 16 }]}>
                  <TextInput
                    style={[
                      fieldStyles.input,
                      {
                        color: colors.foreground,
                        borderColor: colors.border,
                        backgroundColor: colors.card,
                        flex: 1,
                      },
                    ]}
                    value={weight}
                    onChangeText={setWeight}
                    placeholder="e.g. 148"
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="decimal-pad"
                  />
                  {(["lbs", "kg"] as const).map((unit) => (
                    <TouchableOpacity
                      key={unit}
                      onPress={() => setWeightUnit(unit)}
                      style={[
                        fieldStyles.unitBtn,
                        {
                          backgroundColor:
                            weightUnit === unit ? colors.primary : colors.card,
                          borderColor:
                            weightUnit === unit
                              ? colors.primary
                              : colors.border,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          fieldStyles.unitBtnText,
                          {
                            color:
                              weightUnit === unit
                                ? colors.primaryForeground
                                : colors.mutedForeground,
                          },
                        ]}
                      >
                        {unit}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

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
                  Fetal Heart Rate (optional)
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
                  value={fetalHeartRate}
                  onChangeText={setFetalHeartRate}
                  placeholder="e.g. 148 bpm"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="default"
                />
              </>
            )}

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
              placeholder={
                isSchedule
                  ? "Any prep notes or reminders for this visit…"
                  : "What did the provider say? Anything to follow up on?"
              }
              placeholderTextColor={colors.mutedForeground}
              multiline
              numberOfLines={3}
            />

            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
              onPress={() =>
                onSave({
                  visitDate,
                  weight: weight.trim() ? `${weight.trim()} ${weightUnit}` : "",
                  bloodPressure,
                  fetalHeartRate,
                  notes,
                })
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

// ─── Upcoming Appointments Section ───────────────────────────────────────────

function UpcomingAppointmentsSection({
  upcoming,
  onSchedule,
  onEdit,
  onDelete,
  dueDate,
}: {
  upcoming: PrenatalVisit[];
  onSchedule: () => void;
  onEdit: (v: PrenatalVisit) => void;
  onDelete: (id: number) => void;
  dueDate: string | null | undefined;
}) {
  const colors = useColors();

  function gaLabel(visitDateIso: string) {
    if (!dueDate) return null;
    const { weeks, days } = getGestationalAgeAtDate(
      parseApiDate(dueDate),
      new Date(visitDateIso),
    );
    if (weeks < 4 || weeks > 45) return null;
    return `${weeks}w ${days}d`;
  }

  function expectationLabel(visitDateIso: string) {
    if (!dueDate) return null;
    const { weeks } = getGestationalAgeAtDate(
      parseApiDate(dueDate),
      new Date(visitDateIso),
    );
    if (weeks < 4 || weeks > 45) return null;
    return getVisitExpectation(weeks).label;
  }

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Text style={[styles.title, { color: colors.foreground }]}>
          Upcoming Appointments
        </Text>
        <TouchableOpacity
          style={[styles.addBtn, { backgroundColor: colors.primary }]}
          onPress={onSchedule}
        >
          <Ionicons name="add" size={14} color={colors.primaryForeground} />
          <Text
            style={[styles.addBtnText, { color: colors.primaryForeground }]}
          >
            Schedule
          </Text>
        </TouchableOpacity>
      </View>

      {upcoming.length === 0 && (
        <TouchableOpacity
          style={[
            styles.emptyUpcomingCard,
            {
              backgroundColor: colors.primary + "0D",
              borderColor: colors.primary + "33",
            },
          ]}
          onPress={onSchedule}
        >
          <Ionicons name="calendar-outline" size={24} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text
              style={[styles.emptyUpcomingTitle, { color: colors.foreground }]}
            >
              No upcoming appointments
            </Text>
            <Text
              style={[
                styles.emptyUpcomingSub,
                { color: colors.mutedForeground },
              ]}
            >
              Schedule your next visit to receive a day-before reminder.
            </Text>
          </View>
          <Ionicons
            name="chevron-forward"
            size={16}
            color={colors.mutedForeground}
          />
        </TouchableOpacity>
      )}

      {upcoming.map((item) => {
        const ga = gaLabel(item.visitDate);
        const exp = expectationLabel(item.visitDate);
        return (
          <TouchableOpacity
            key={item.id}
            style={[
              styles.upcomingItem,
              {
                backgroundColor: colors.primary + "0D",
                borderColor: colors.primary + "33",
              },
            ]}
            onPress={() => onEdit(item)}
          >
            <View
              style={[styles.upcomingDot, { backgroundColor: colors.primary }]}
            />
            <View style={styles.itemMain}>
              <Text style={[styles.itemDate, { color: colors.foreground }]}>
                {formatDateTime(item.visitDate)}
              </Text>
              {ga ? (
                <Text
                  style={[styles.itemMeta, { color: colors.mutedForeground }]}
                >
                  {ga}
                  {exp ? ` · ${exp}` : ""}
                </Text>
              ) : null}
              {item.notes ? (
                <Text
                  style={[styles.itemMeta, { color: colors.mutedForeground }]}
                  numberOfLines={1}
                >
                  {item.notes}
                </Text>
              ) : null}
            </View>
            <TouchableOpacity
              onPress={() => onDelete(item.id)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons
                name="trash-outline"
                size={18}
                color={colors.mutedForeground}
              />
            </TouchableOpacity>
          </TouchableOpacity>
        );
      })}

      {upcoming.length > 0 && (
        <Text style={[styles.upcomingHint, { color: colors.mutedForeground }]}>
          You'll receive a reminder the morning before each appointment.
        </Text>
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
            {(item.weight || item.bloodPressure || item.fetalHeartRate) && (
              <Text
                style={[styles.itemMeta, { color: colors.mutedForeground }]}
              >
                {[
                  item.weight ? `Weight: ${item.weight}` : null,
                  item.bloodPressure ? `BP: ${item.bloodPressure}` : null,
                  item.fetalHeartRate ? `FHR: ${item.fetalHeartRate}` : null,
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

// ─── Prep-for-Visit PDF builder ───────────────────────────────────────────────

type SymptomItem = {
  id: number;
  symptom: string;
  severity?: number | null;
  notes?: string | null;
  loggedAt: Date | string;
};
type KickSessionItem = {
  id: number;
  startedAt: Date | string;
  endedAt?: Date | string | null;
  kickCount: number;
};
type ContractionItem = {
  id: number;
  startedAt: Date | string;
  durationSeconds?: number | null;
  intervalSeconds?: number | null;
  sessionDate: string;
};

function toDate(d: Date | string): Date {
  return d instanceof Date ? d : new Date(d);
}
function fmtDate(d: Date | string) {
  return toDate(d).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
function fmtDateTime(d: Date | string) {
  const dt = toDate(d);
  return (
    dt.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
    " " +
    dt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
  );
}
function fmtSecs(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

function buildPrepHtml(
  questions: QuestionItem[],
  symptoms: SymptomItem[],
  kickSessions: KickSessionItem[],
  contractions: ContractionItem[],
): string {
  const date = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const questionRows = questions
    .map(
      (q) => `
        <div class="row">
          <div class="checkbox"></div>
          <span>${q.text}</span>
        </div>`,
    )
    .join("");

  const severityDots = (sev: number | null | undefined) =>
    sev
      ? [1, 2, 3, 4, 5]
          .map(
            (n) =>
              `<span class="dot" style="background:${n <= sev ? "#ec4899" : "#fce7f3"}"></span>`,
          )
          .join("")
      : "";

  const symptomRows = symptoms
    .map(
      (s) => `
        <div class="row">
          <div class="row-main">
            <span class="row-title">${s.symptom}</span>
            <span class="row-meta">${fmtDateTime(s.loggedAt)}${s.severity ? ` · Severity: ${s.severity}/5` : ""}</span>
            ${s.severity ? `<div class="dots">${severityDots(s.severity)}</div>` : ""}
            ${s.notes ? `<span class="row-meta">${s.notes}</span>` : ""}
          </div>
        </div>`,
    )
    .join("");

  const kickRows = kickSessions
    .map((k) => {
      const dur =
        k.endedAt && k.startedAt
          ? Math.round(
              (toDate(k.endedAt).getTime() - toDate(k.startedAt).getTime()) /
                60000,
            )
          : null;
      return `
        <div class="row">
          <div class="row-main">
            <span class="row-title">${k.kickCount} kicks</span>
            <span class="row-meta">${fmtDateTime(k.startedAt)}${dur !== null ? ` · ${dur} min` : ""}</span>
          </div>
        </div>`;
    })
    .join("");

  const contractionRows = contractions
    .map(
      (c) => `
        <div class="row">
          <div class="row-main">
            <span class="row-title">${c.durationSeconds ? fmtSecs(c.durationSeconds) : "—"}</span>
            <span class="row-meta">${fmtDateTime(c.startedAt)}${c.intervalSeconds ? ` · Interval: ${fmtSecs(c.intervalSeconds)}` : ""}</span>
          </div>
        </div>`,
    )
    .join("");

  const toolsBlock =
    symptoms.length || kickSessions.length || contractions.length
      ? `
        <div style="margin-top:28px">
          ${
            symptoms.length
              ? `<div class="section-label">Recent Symptoms</div>
                 <div class="rows-block">${symptomRows}</div>`
              : ""
          }
          ${
            kickSessions.length
              ? `<div class="section-label" style="margin-top:${symptoms.length ? 20 : 0}px">Kick Counter</div>
                 <div class="rows-block">${kickRows}</div>`
              : ""
          }
          ${
            contractions.length
              ? `<div class="section-label" style="margin-top:${symptoms.length || kickSessions.length ? 20 : 0}px">Contractions — ${fmtDate(contractions[0]!.startedAt)}</div>
                 <div class="rows-block">${contractionRows}</div>`
              : ""
          }
        </div>`
      : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Prep for Visit</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: Inter, system-ui, sans-serif;
      background: #fff;
      color: #1f1f1f;
      padding: 40px 48px;
    }
    .header {
      background: linear-gradient(135deg, #fdf2f8 0%, #fce7f3 60%, #fbcfe8 100%);
      border-radius: 16px;
      padding: 28px 32px;
      margin-bottom: 32px;
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .header-icon {
      width: 52px; height: 52px;
      background: #fff;
      border-radius: 14px;
      display: flex; align-items: center; justify-content: center;
      font-size: 26px;
      box-shadow: 0 2px 8px rgba(236,72,153,0.12);
    }
    .header-text h1 { font-size: 22px; font-weight: 700; color: #9d174d; }
    .header-text p { font-size: 13px; color: #be185d; margin-top: 4px; }
    .section-label {
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.8px;
      text-transform: uppercase;
      color: #be185d;
      margin-bottom: 14px;
    }
    .rows-block { margin-bottom: 4px; }
    .row {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 11px 0;
      border-bottom: 1px solid #fce7f3;
    }
    .row:last-child { border-bottom: none; }
    .row-main { display: flex; flex-direction: column; gap: 3px; flex: 1; }
    .checkbox {
      width: 18px; height: 18px;
      border: 2px solid #f9a8d4;
      border-radius: 5px;
      flex-shrink: 0;
      margin-top: 2px;
    }
    .row span { font-size: 14px; line-height: 1.5; color: #1f1f1f; }
    .row-title { font-size: 14px; font-weight: 500; color: #1f1f1f; }
    .row-meta { font-size: 12px; color: #6b7280; }
    .dots { display: flex; gap: 4px; margin-top: 2px; }
    .dot { width: 8px; height: 8px; border-radius: 50%; }
    .footer {
      margin-top: 36px;
      font-size: 11px;
      color: #9ca3af;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-icon">📋</div>
    <div class="header-text">
      <h1>Prep for My Visit</h1>
      <p>${date}</p>
    </div>
  </div>
  <div class="section-label">Questions to Ask My Provider</div>
  <div class="rows-block">${questionRows}</div>
  ${toolsBlock}
  <div class="footer">Printed from Pregnancy AI Assistant</div>
</body>
</html>`;
}

// ─── What Questions Do You Want to Ask Section ───────────────────────────────

function QuestionsToAskSection() {
  const colors = useColors();
  const { isSignedIn } = useUser();
  const [items, setItems] = useState<QuestionItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [newQuestion, setNewQuestion] = useState("");
  const [viewing, setViewing] = useState(false);

  const symptomsParams = { limit: 10, offset: 0 };
  const { data: symptomsData } = useListSymptoms(symptomsParams, {
    query: {
      queryKey: getListSymptomsQueryKey(symptomsParams),
      enabled: !!isSignedIn,
    },
  });
  const kickParams = { limit: 5, offset: 0 };
  const { data: kickData } = useListKickSessions(kickParams, {
    query: {
      queryKey: getListKickSessionsQueryKey(kickParams),
      enabled: !!isSignedIn,
    },
  });
  const contractionParams = { limit: 50 };
  const { data: contractionData } = useListContractions(contractionParams, {
    query: {
      queryKey: getListContractionsQueryKey(contractionParams),
      enabled: !!isSignedIn,
    },
  });

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
  const selected = items.filter((q) => q.selected);

  const handleViewPdf = useCallback(async () => {
    if (!selected.length) return;
    setViewing(true);
    try {
      const html = buildPrepHtml(
        selected,
        symptomsData?.items ?? [],
        kickData?.items ?? [],
        contractionData?.items ?? [],
      );
      const { uri } = await Print.printToFileAsync({ html });
      router.push({
        pathname: "/pdf-viewer",
        params: {
          uri,
          title: "Prep for Visit",
          shareTitle: "Prep for Visit — Questions for My Provider",
        },
      });
    } catch {
      Alert.alert("Error", "Could not generate PDF. Please try again.");
    } finally {
      setViewing(false);
    }
  }, [selected, symptomsData?.items, kickData?.items, contractionData?.items]);

  return (
    <View style={styles.container}>
      <Text style={[styles.title, { color: colors.foreground }]}>
        Prep for the Visit
      </Text>
      <Text
        style={[styles.questionsSubtitle, { color: colors.mutedForeground }]}
      >
        What Questions Do You Want to Ask?
      </Text>
      <Text style={[styles.progress, { color: colors.mutedForeground }]}>
        {selectedCount} selected
      </Text>
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

      {selectedCount > 0 && (
        <TouchableOpacity
          style={[styles.viewPdfBtn, { borderColor: colors.primary }]}
          onPress={handleViewPdf}
          disabled={viewing}
        >
          {viewing ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Ionicons
              name="document-text-outline"
              size={18}
              color={colors.primary}
            />
          )}
          <Text style={[styles.viewPdfBtnText, { color: colors.primary }]}>
            {viewing ? "Generating…" : "View PDF"}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Main Office Visit Screen ────────────────────────────────────────────────

export default function OfficeVisitScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { isSignedIn } = useUser();

  const { data: profileData } = useGetProfile({
    query: { queryKey: getGetProfileQueryKey(), enabled: !!isSignedIn },
  });
  const dueDate = profileData?.dueDate ?? null;

  const prenatalVisitsParams = { limit: 50, offset: 0 };
  const { data, isLoading, refetch } = useListPrenatalVisits(
    prenatalVisitsParams,
    {
      query: {
        queryKey: getListPrenatalVisitsQueryKey(prenatalVisitsParams),
        enabled: !!isSignedIn,
      },
    },
  );
  const createMutation = useCreatePrenatalVisit();
  const updateMutation = useUpdatePrenatalVisit();
  const deleteMutation = useDeletePrenatalVisit();

  const [modalVisible, setModalVisible] = useState(false);
  const [modalMode, setModalMode] = useState<"schedule" | "log">("log");
  const [modalDefaultDate, setModalDefaultDate] = useState<Date | undefined>(
    undefined,
  );
  const [editing, setEditing] = useState<PrenatalVisit | null>(null);

  const items = useMemo(() => data?.items ?? [], [data?.items]);
  const now = Date.now();
  const past = useMemo(
    () =>
      items
        .filter((v) => new Date(v.visitDate).getTime() <= now)
        .sort(
          (a, b) =>
            new Date(b.visitDate).getTime() - new Date(a.visitDate).getTime(),
        ),
    [items, now],
  );
  const upcoming = useMemo(
    () =>
      items
        .filter((v) => new Date(v.visitDate).getTime() > now)
        .sort(
          (a, b) =>
            new Date(a.visitDate).getTime() - new Date(b.visitDate).getTime(),
        ),
    [items, now],
  );

  const openAdd = useCallback(() => {
    setEditing(null);
    setModalMode("log");
    setModalDefaultDate(undefined);
    setModalVisible(true);
  }, []);

  const openAddUpcoming = useCallback(() => {
    setEditing(null);
    setModalMode("schedule");
    // Default to one week from now
    const d = new Date();
    d.setDate(d.getDate() + 7);
    d.setHours(10, 0, 0, 0);
    setModalDefaultDate(d);
    setModalVisible(true);
  }, []);

  const openEdit = useCallback((v: PrenatalVisit) => {
    setEditing(v);
    setModalMode(
      new Date(v.visitDate).getTime() > Date.now() ? "schedule" : "log",
    );
    setModalDefaultDate(undefined);
    setModalVisible(true);
  }, []);

  const handleSave = useCallback(
    async (saveData: {
      visitDate: Date;
      weight: string;
      bloodPressure: string;
      fetalHeartRate: string;
      notes: string;
    }) => {
      const payload = {
        visitDate: saveData.visitDate.toISOString(),
        weight: saveData.weight.trim() || null,
        bloodPressure: saveData.bloodPressure.trim() || null,
        fetalHeartRate: saveData.fetalHeartRate.trim() || null,
        notes: saveData.notes.trim() || null,
      };

      if (editing) {
        // Cancel old reminder before updating
        await cancelAppointmentReminder(editing.id);
        await updateMutation.mutateAsync({ id: editing.id, data: payload });
        // Reschedule if still in the future
        if (saveData.visitDate.getTime() > Date.now() && dueDate) {
          const { weeks } = getGestationalAgeAtDate(
            parseApiDate(dueDate),
            saveData.visitDate,
          );
          await scheduleAppointmentReminder(
            editing.id,
            saveData.visitDate,
            weeks,
          );
        }
      } else {
        const created = await createMutation.mutateAsync({ data: payload });
        // Schedule reminder for new future appointments
        if (saveData.visitDate.getTime() > Date.now() && dueDate) {
          const { weeks } = getGestationalAgeAtDate(
            parseApiDate(dueDate),
            saveData.visitDate,
          );
          await scheduleAppointmentReminder(
            created.id,
            saveData.visitDate,
            weeks,
          );
        }
      }
      setModalVisible(false);
      setEditing(null);
      refetch();
    },
    [editing, createMutation, updateMutation, refetch, dueDate],
  );

  const handleDelete = useCallback(
    (id: number) => {
      Alert.alert("Delete", "Remove this appointment?", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await cancelAppointmentReminder(id);
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
          Prenatal Care
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
            Sign in to use Office Visits
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
        <ResponsiveContainer style={{ paddingHorizontal: 16 }}>
          <Animated.View entering={FadeInDown.duration(400)}>
            <Text style={[styles.pageTitle, { color: colors.foreground }]}>
              Office Visits
            </Text>
            <Text style={[styles.pageSub, { color: colors.mutedForeground }]}>
              Get ready for your prenatal appointments.
            </Text>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(20).duration(400)}>
            <TouchableOpacity
              style={[styles.modeBtn, { backgroundColor: colors.primary }]}
              onPress={() => router.push("/in-office")}
            >
              <Ionicons name="business" size={20} color="#fff" />
              <Text style={styles.modeBtnText}>Enter Office Mode</Text>
              <Ionicons name="chevron-forward" size={18} color="#fff" />
            </TouchableOpacity>
          </Animated.View>

          <Animated.View
            entering={FadeInDown.delay(40).duration(400)}
            style={[
              styles.card,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <QuestionsToAskSection />
          </Animated.View>

          {isLoading && !data ? (
            <ActivityIndicator
              color={colors.primary}
              style={{ marginTop: 20 }}
            />
          ) : (
            <>
              <Animated.View
                entering={FadeInDown.delay(120).duration(400)}
                style={[
                  styles.card,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <UpcomingAppointmentsSection
                  upcoming={upcoming}
                  onSchedule={openAddUpcoming}
                  onEdit={openEdit}
                  onDelete={handleDelete}
                  dueDate={dueDate}
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
            entering={FadeInDown.delay(320).duration(400)}
            style={[
              styles.card,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <TouchableOpacity
              style={styles.reportCard}
              onPress={() => router.push("/visit-summary")}
            >
              <View style={styles.reportCardIcon}>
                <Ionicons
                  name="document-text"
                  size={28}
                  color={colors.primary}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.title, { color: colors.foreground }]}>
                  View Full Visit Report
                </Text>
                <Text
                  style={[styles.scribeDesc, { color: colors.mutedForeground }]}
                >
                  Appointment log, questions, and symptoms — all in one place.
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={20}
                color={colors.mutedForeground}
              />
            </TouchableOpacity>
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
            defaultDate={modalDefaultDate}
            mode={modalMode}
          />
        </ResponsiveContainer>
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
  scroll: {},
  modeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 18,
    marginBottom: 20,
  },
  modeBtnText: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
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
    marginTop: 2,
    marginBottom: 8,
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
  questionsSubtitle: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    marginTop: 2,
    marginBottom: 6,
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
  scribeIntro: {
    gap: 12,
  },
  scribeTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  scribeDesc: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 21,
  },
  sectionHeader: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 10,
    marginTop: 4,
  },
  reportCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  reportCardIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  viewPdfBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 12,
    marginTop: 4,
  },
  viewPdfBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  emptyUpcomingCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 4,
  },
  emptyUpcomingTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 2,
  },
  emptyUpcomingSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 17,
  },
  upcomingItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginBottom: 8,
  },
  upcomingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 5,
    flexShrink: 0,
  },
  upcomingHint: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    marginTop: 4,
  },
});
