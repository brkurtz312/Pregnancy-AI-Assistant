import DateTimePicker, {
  DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  type DimensionValue,
  Image,
  type ImageSourcePropType,
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

import { AccountButton } from "@/components/AccountButton";
import { AiAssistant } from "@/components/AiAssistant";
import { useColors } from "@/hooks/useColors";
import { getWeeklyDevelopment } from "@/lib/fetal-development";
import { getFetalImage } from "@/lib/fetal-images";
import {
  PregnancyResults,
  calculateByConceptionDate,
  calculateByDueDate,
  calculateByLMP,
  calculateByUltrasound,
  formatDate,
  formatGestationalAge,
  getMilestones,
} from "@/lib/pregnancy-math";

type Method = "lmp" | "due" | "conception" | "ultrasound";

const METHODS: {
  id: Method;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { id: "lmp", label: "Last Period", icon: "calendar-outline" },
  { id: "due", label: "Due Date", icon: "checkmark-circle-outline" },
  { id: "conception", label: "Conception", icon: "heart-outline" },
  { id: "ultrasound", label: "Ultrasound", icon: "scan-outline" },
];

const METHOD_DESCRIPTIONS: Record<Method, string> = {
  lmp: "Enter the first day of your last menstrual period",
  due: "Enter your known estimated due date",
  conception: "Enter the date of conception",
  ultrasound: "Enter the ultrasound date and gestational age at that scan",
};

function DatePickerField({
  value,
  onChange,
  label,
  placeholder = "Select a date",
}: {
  value: Date | null;
  onChange: (date: Date) => void;
  label: string;
  placeholder?: string;
}) {
  const colors = useColors();
  const [showPicker, setShowPicker] = useState(false);
  const isWeb = Platform.OS === "web";
  const isAndroid = Platform.OS === "android";

  const displayText = value
    ? value.toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : placeholder;

  if (isWeb) {
    return (
      <View>
        <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
          {label}
        </Text>
        <TextInput
          style={[
            styles.webDateInput,
            {
              borderColor: colors.border,
              color: colors.foreground,
              backgroundColor: colors.card,
            },
          ]}
          placeholder="MM/DD/YYYY"
          placeholderTextColor={colors.mutedForeground}
          value={
            value
              ? `${value.getMonth() + 1}/${value.getDate()}/${value.getFullYear()}`
              : ""
          }
          onChangeText={(text) => {
            const parts = text.split("/");
            if (parts.length === 3) {
              const d = new Date(
                `${parts[2]}-${parts[0]?.padStart(2, "0")}-${parts[1]?.padStart(2, "0")}`,
              );
              if (!isNaN(d.getTime())) onChange(d);
            }
          }}
        />
      </View>
    );
  }

  return (
    <View>
      <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
        {label}
      </Text>
      <TouchableOpacity
        style={[
          styles.dateButton,
          { borderColor: colors.border, backgroundColor: colors.card },
        ]}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setShowPicker(true);
        }}
        testID="date-picker-button"
      >
        <Ionicons
          name="calendar-outline"
          size={18}
          color={value ? colors.primary : colors.mutedForeground}
        />
        <Text
          style={[
            styles.dateButtonText,
            { color: value ? colors.foreground : colors.mutedForeground },
          ]}
        >
          {displayText}
        </Text>
        <Ionicons
          name="chevron-down"
          size={16}
          color={colors.mutedForeground}
        />
      </TouchableOpacity>

      {isAndroid && showPicker && (
        <DateTimePicker
          value={value ?? new Date()}
          mode="date"
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
            style={styles.modalOverlay}
            onPress={() => setShowPicker(false)}
          >
            <Pressable
              style={[styles.pickerSheet, { backgroundColor: colors.card }]}
            >
              <View
                style={[
                  styles.pickerHeader,
                  { borderBottomColor: colors.border },
                ]}
              >
                <Text
                  style={[styles.pickerTitle, { color: colors.foreground }]}
                >
                  {label}
                </Text>
                <TouchableOpacity onPress={() => setShowPicker(false)}>
                  <Text style={[styles.pickerDone, { color: colors.primary }]}>
                    Done
                  </Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={value ?? new Date()}
                mode="date"
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

function Stepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  const colors = useColors();
  return (
    <View style={styles.stepperContainer}>
      <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
        {label}
      </Text>
      <View
        style={[
          styles.stepper,
          { borderColor: colors.border, backgroundColor: colors.card },
        ]}
      >
        <TouchableOpacity
          style={[styles.stepperBtn, { borderRightColor: colors.border }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            if (value > min) onChange(value - 1);
          }}
          disabled={value <= min}
        >
          <Ionicons
            name="remove"
            size={20}
            color={value <= min ? colors.mutedForeground : colors.foreground}
          />
        </TouchableOpacity>
        <Text style={[styles.stepperValue, { color: colors.foreground }]}>
          {value}
        </Text>
        <TouchableOpacity
          style={[styles.stepperBtn, { borderLeftColor: colors.border }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            if (value < max) onChange(value + 1);
          }}
          disabled={value >= max}
        >
          <Ionicons
            name="add"
            size={20}
            color={value >= max ? colors.mutedForeground : colors.foreground}
          />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function FetalImageViewer({
  source,
  visible,
  onClose,
}: {
  source: ImageSourcePropType;
  visible: boolean;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable style={styles.imageViewerOverlay} onPress={onClose}>
        <View style={[styles.imageViewerClose, { top: insets.top + 16 }]}>
          <Ionicons name="close" size={22} color="#fff" />
        </View>
        <Image
          source={source}
          style={styles.imageViewerFull}
          resizeMode="contain"
        />
        <Text style={[styles.imageViewerHint, { bottom: insets.bottom + 20 }]}>
          Tap anywhere to close
        </Text>
      </Pressable>
    </Modal>
  );
}

function ResultsView({ results }: { results: PregnancyResults }) {
  const colors = useColors();
  const [imageFullscreen, setImageFullscreen] = useState(false);
  const weekData = getWeeklyDevelopment(results.currentGestationalAgeWeeks);
  const milestones = getMilestones(results);
  const isOverdue = results.daysUntilDue < 0;

  const trimesterLabel =
    results.trimester === 1
      ? "1st Trimester"
      : results.trimester === 2
        ? "2nd Trimester"
        : "3rd Trimester";

  return (
    <Animated.View entering={FadeInDown.duration(400).springify()}>
      {/* EDD Card */}
      <View style={[styles.eddCard, { backgroundColor: colors.primary }]}>
        <Text style={styles.eddLabel}>Estimated Due Date</Text>
        <Text style={styles.eddDate}>{formatDate(results.edd)}</Text>
        <View style={styles.eddRow}>
          <View
            style={[
              styles.eddBadge,
              { backgroundColor: "rgba(255,255,255,0.25)" },
            ]}
          >
            <Text style={styles.eddBadgeText}>{trimesterLabel}</Text>
          </View>
          <Text style={styles.eddDays}>
            {isOverdue
              ? `${Math.abs(results.daysUntilDue)} days overdue`
              : results.daysUntilDue === 0
                ? "Today is your due date!"
                : `${results.daysUntilDue} days to go`}
          </Text>
        </View>
      </View>

      {/* Progress */}
      <View
        style={[
          styles.card,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <View style={styles.cardRow}>
          <Ionicons name="time-outline" size={18} color={colors.primary} />
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>
            Gestational Age
          </Text>
        </View>
        <Text style={[styles.gestAge, { color: colors.foreground }]}>
          {formatGestationalAge(
            results.currentGestationalAgeWeeks,
            results.currentGestationalAgeRemainderDays,
          )}
        </Text>
        <View style={[styles.progressTrack, { backgroundColor: colors.muted }]}>
          <View
            style={[
              styles.progressFill,
              {
                backgroundColor: colors.primary,
                width:
                  `${Math.min(100, results.progressPercentage)}%` as DimensionValue,
              },
            ]}
          />
        </View>
        <Text style={[styles.progressLabel, { color: colors.mutedForeground }]}>
          {results.progressPercentage.toFixed(0)}% complete
        </Text>
      </View>

      {/* Key Dates */}
      <View
        style={[
          styles.card,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <View style={styles.cardRow}>
          <Ionicons name="calendar-outline" size={18} color={colors.primary} />
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>
            Key Dates
          </Text>
        </View>
        {[
          { label: "Last Menstrual Period", date: results.lmp },
          { label: "Estimated Conception", date: results.conception },
          { label: "End of 1st Trimester", date: milestones.endFirstTrimester },
          {
            label: "End of 2nd Trimester",
            date: milestones.endSecondTrimester,
          },
          { label: "Due Date (EDD)", date: results.edd },
        ].map(({ label, date }, i) => (
          <View
            key={label}
            style={[
              styles.dateRow,
              i > 0 && { borderTopWidth: 1, borderTopColor: colors.border },
            ]}
          >
            <Text
              style={[styles.dateRowLabel, { color: colors.mutedForeground }]}
            >
              {label}
            </Text>
            <Text style={[styles.dateRowValue, { color: colors.foreground }]}>
              {formatDate(date)}
            </Text>
          </View>
        ))}
      </View>

      {/* Fetal Development */}
      <View
        style={[
          styles.card,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <View style={styles.cardRow}>
          <Ionicons name="sparkles-outline" size={18} color={colors.primary} />
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>
            Week {weekData.week} Development
          </Text>
        </View>

        {/* Size badge + image */}
        <View style={styles.weekHeader}>
          <View>
            <View style={[styles.sizeBadge, { backgroundColor: colors.muted }]}>
              <Text style={[styles.sizeBadgeText, { color: colors.primary }]}>
                {weekData.size}
              </Text>
            </View>
            <Text
              style={[styles.sizeComparison, { color: colors.mutedForeground }]}
            >
              ~ {weekData.sizeComparison}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setImageFullscreen(true);
            }}
            activeOpacity={0.85}
          >
            <Image
              source={getFetalImage(weekData.week)}
              style={[styles.fetalImage, { backgroundColor: colors.muted }]}
              resizeMode="contain"
            />
            <View
              style={[styles.fetalImageHint, { backgroundColor: colors.muted }]}
            >
              <Ionicons
                name="expand-outline"
                size={12}
                color={colors.mutedForeground}
              />
            </View>
          </TouchableOpacity>
        </View>

        <FetalImageViewer
          source={getFetalImage(weekData.week)}
          visible={imageFullscreen}
          onClose={() => setImageFullscreen(false)}
        />

        {/* Baby development */}
        <Text style={[styles.sectionLabel, { color: colors.foreground }]}>
          Baby this week
        </Text>
        {weekData.development.map((item, i) => (
          <View key={i} style={styles.bulletRow}>
            <View
              style={[styles.bullet, { backgroundColor: colors.primary }]}
            />
            <Text style={[styles.bulletText, { color: colors.foreground }]}>
              {item}
            </Text>
          </View>
        ))}

        {/* Mother changes */}
        <Text
          style={[
            styles.sectionLabel,
            { color: colors.foreground, marginTop: 12 },
          ]}
        >
          How you may feel
        </Text>
        {weekData.motherChanges.map((item, i) => (
          <View key={i} style={styles.bulletRow}>
            <View style={[styles.bullet, { backgroundColor: colors.accent }]} />
            <Text style={[styles.bulletText, { color: colors.foreground }]}>
              {item}
            </Text>
          </View>
        ))}

        {/* Coming up */}
        <View style={[styles.comingUpBox, { backgroundColor: colors.muted }]}>
          <Ionicons
            name="arrow-forward-circle-outline"
            size={16}
            color={colors.primary}
          />
          <Text
            style={[styles.comingUpText, { color: colors.mutedForeground }]}
          >
            {weekData.comingUp}
          </Text>
        </View>
      </View>
    </Animated.View>
  );
}

export default function CalculatorScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";

  const [method, setMethod] = useState<Method>("lmp");
  const [date, setDate] = useState<Date | null>(null);
  const [usWeeks, setUsWeeks] = useState(10);
  const [usDays, setUsDays] = useState(0);
  const [results, setResults] = useState<PregnancyResults | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleCalculate() {
    setError(null);
    if (!date) {
      setError("Please select a date to continue.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }
    try {
      let r: PregnancyResults;
      if (method === "lmp") r = calculateByLMP(date);
      else if (method === "due") r = calculateByDueDate(date);
      else if (method === "conception") r = calculateByConceptionDate(date);
      else r = calculateByUltrasound(date, usWeeks, usDays);

      setResults(r);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      setError("Could not calculate. Please check your input.");
    }
  }

  function handleReset() {
    setDate(null);
    setResults(null);
    setError(null);
    setUsWeeks(10);
    setUsDays(0);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  const topPad = isWeb ? 67 : insets.top;
  const bottomPad = isWeb ? 34 : insets.bottom + 16;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: bottomPad + 24 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
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
            <Ionicons name="heart" size={28} color={colors.primary} />
          </View>
          <Text style={styles.headerTitle}>Pregnancy Assistant</Text>
          <Text style={styles.headerSubtitle}>
            Your gentle guide through every week
          </Text>
        </View>

        <View style={styles.content}>
          {/* Method Selector */}
          <Text
            style={[styles.sectionHeading, { color: colors.mutedForeground }]}
          >
            CALCULATE BY
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.methodScroll}
          >
            {METHODS.map((m) => {
              const active = method === m.id;
              return (
                <TouchableOpacity
                  key={m.id}
                  style={[
                    styles.methodPill,
                    {
                      backgroundColor: active ? colors.primary : colors.card,
                      borderColor: active ? colors.primary : colors.border,
                    },
                  ]}
                  onPress={() => {
                    setMethod(m.id);
                    setResults(null);
                    setError(null);
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                  testID={`method-${m.id}`}
                >
                  <Ionicons
                    name={m.icon}
                    size={16}
                    color={active ? "#fff" : colors.mutedForeground}
                    style={{ marginRight: 6 }}
                  />
                  <Text
                    style={[
                      styles.methodPillText,
                      { color: active ? "#fff" : colors.foreground },
                    ]}
                  >
                    {m.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Input Card */}
          <View
            style={[
              styles.card,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Text
              style={[
                styles.methodDescription,
                { color: colors.mutedForeground },
              ]}
            >
              {METHOD_DESCRIPTIONS[method]}
            </Text>

            {method === "lmp" && (
              <DatePickerField
                label="First Day of Last Period"
                value={date}
                onChange={(d) => {
                  setDate(d);
                  setResults(null);
                }}
              />
            )}
            {method === "due" && (
              <DatePickerField
                label="Estimated Due Date"
                value={date}
                onChange={(d) => {
                  setDate(d);
                  setResults(null);
                }}
              />
            )}
            {method === "conception" && (
              <DatePickerField
                label="Date of Conception"
                value={date}
                onChange={(d) => {
                  setDate(d);
                  setResults(null);
                }}
              />
            )}
            {method === "ultrasound" && (
              <>
                <DatePickerField
                  label="Date of Ultrasound"
                  value={date}
                  onChange={(d) => {
                    setDate(d);
                    setResults(null);
                  }}
                />
                <View style={styles.stepperRow}>
                  <Stepper
                    label="Weeks at scan"
                    value={usWeeks}
                    min={4}
                    max={42}
                    onChange={(v) => {
                      setUsWeeks(v);
                      setResults(null);
                    }}
                  />
                  <Stepper
                    label="Days"
                    value={usDays}
                    min={0}
                    max={6}
                    onChange={(v) => {
                      setUsDays(v);
                      setResults(null);
                    }}
                  />
                </View>
              </>
            )}

            {error && (
              <Text style={[styles.errorText, { color: colors.destructive }]}>
                {error}
              </Text>
            )}

            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={[
                  styles.calculateBtn,
                  { backgroundColor: colors.primary },
                ]}
                onPress={handleCalculate}
                testID="calculate-button"
              >
                <Ionicons
                  name="calculator-outline"
                  size={18}
                  color="#fff"
                  style={{ marginRight: 8 }}
                />
                <Text style={styles.calculateBtnText}>Calculate</Text>
              </TouchableOpacity>
              {results && (
                <TouchableOpacity
                  style={[styles.resetBtn, { borderColor: colors.border }]}
                  onPress={handleReset}
                >
                  <Ionicons
                    name="refresh-outline"
                    size={18}
                    color={colors.mutedForeground}
                  />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Results */}
          {results && (
            <>
              <ResultsView results={results} />
              <AiAssistant currentWeek={results.currentGestationalAgeWeeks} />
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
  sectionHeading: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1.2,
    marginBottom: 2,
    marginLeft: 2,
  },
  methodScroll: { marginBottom: 4 },
  methodPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
  },
  methodPillText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  methodDescription: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
  fieldLabel: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    marginBottom: 6,
    letterSpacing: 0.3,
  },
  dateButton: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  dateButtonText: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  webDateInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  pickerSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: "hidden",
    paddingBottom: 24,
  },
  pickerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  pickerTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  pickerDone: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  stepperRow: {
    flexDirection: "row",
    gap: 12,
  },
  stepperContainer: { flex: 1 },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 10,
    overflow: "hidden",
  },
  stepperBtn: {
    padding: 10,
    borderWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    flex: 0,
    width: 42,
  },
  stepperValue: {
    flex: 1,
    textAlign: "center",
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
  },
  errorText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  buttonRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  calculateBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 12,
  },
  calculateBtnText: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  resetBtn: {
    width: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    borderWidth: 1,
  },
  eddCard: {
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
    gap: 4,
  },
  eddLabel: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.5,
  },
  eddDate: {
    color: "#fff",
    fontSize: 26,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  eddRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 6,
    flexWrap: "wrap",
    justifyContent: "center",
  },
  eddBadge: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  eddBadgeText: {
    color: "#fff",
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  eddDays: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  cardRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  cardTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  gestAge: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    marginTop: 4,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
    marginTop: 4,
  },
  progressFill: {
    height: 6,
    borderRadius: 3,
  },
  progressLabel: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  dateRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    flexWrap: "wrap",
    gap: 4,
  },
  dateRowLabel: { fontSize: 13, fontFamily: "Inter_400Regular", flex: 1 },
  dateRowValue: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    textAlign: "right",
  },
  weekHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  sizeBadge: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: "flex-start",
    marginBottom: 4,
  },
  sizeBadgeText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  sizeComparison: { fontSize: 12, fontFamily: "Inter_400Regular" },
  fetalImage: {
    width: 100,
    height: 100,
    borderRadius: 12,
  },
  sectionLabel: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 6,
  },
  bulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 6,
  },
  bullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 6,
    flexShrink: 0,
  },
  bulletText: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
  },
  comingUpBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderRadius: 10,
    padding: 12,
    marginTop: 8,
  },
  comingUpText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
  fetalImageHint: {
    position: "absolute",
    bottom: 6,
    right: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  imageViewerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.93)",
    alignItems: "center",
    justifyContent: "center",
  },
  imageViewerFull: {
    width: "90%",
    height: "70%",
  },
  imageViewerClose: {
    position: "absolute",
    right: 20,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  imageViewerHint: {
    position: "absolute",
    color: "rgba(255,255,255,0.4)",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
});
