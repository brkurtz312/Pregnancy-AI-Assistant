import { Ionicons } from "@expo/vector-icons";
import { useAppAuth as useAuth } from "@/hooks/useAppAuth";
import { router, useLocalSearchParams } from "expo-router";
import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system/legacy";
import * as Haptics from "expo-haptics";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as WebBrowser from "expo-web-browser";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
  useUpdateProfile,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { AskCard } from "@/components/AskCard";
import {
  PPD_HIGHLIGHTS,
  PPD_CRISIS_RESOURCES,
  buildPostpartumResourceHtml,
  loadPpdCheckin,
  savePpdCheckin,
  markPpdSummaryGenerated,
  PHQ9_QUESTIONS,
  PHQ9_OPTIONS,
  loadPhq9Answers,
  savePhq9Answers,
  scorePhq9,
  phq9Complete,
  getPhq9Category,
  type PpdCheckin,
  type YesNo,
  type Phq9Answers,
} from "@/lib/postpartum-depression";
import { ResponsiveContainer } from "@/components/ResponsiveContainer";

const PDF_ASSET = require("@/assets/docs/postpartum-depression.pdf");

async function openHandoutPdf() {
  try {
    const asset = Asset.fromModule(PDF_ASSET);
    await asset.downloadAsync();
    const sourceUri = asset.localUri ?? asset.uri;
    if (!sourceUri) {
      throw new Error("PDF asset has no resolvable URI");
    }
    const destUri = `${FileSystem.cacheDirectory}postpartum-depression.pdf`;
    await FileSystem.copyAsync({ from: sourceUri, to: destUri });
    if (Platform.OS === "web") {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(destUri, {
          mimeType: "application/pdf",
          dialogTitle: "Postpartum Depression",
          UTI: "com.adobe.pdf",
        });
      } else {
        Alert.alert(
          "Can't open PDF",
          "Viewing files isn't available on this device.",
        );
      }
      return;
    }
    router.push({
      pathname: "/pdf-viewer",
      params: {
        uri: destUri,
        title: "Postpartum Depression",
        shareTitle: "Postpartum Depression",
      },
    });
  } catch {
    Alert.alert(
      "Can't open PDF",
      "Something went wrong opening the handout. Please try again.",
    );
  }
}

function YesNoRow({
  value,
  onChange,
  colors,
}: {
  value: YesNo;
  onChange: (v: YesNo) => void;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={styles.yesNoRow}>
      {(["yes", "no"] as const).map((opt) => {
        const selected = value === opt;
        return (
          <TouchableOpacity
            key={opt}
            style={[
              styles.yesNoBtn,
              {
                borderColor: selected ? colors.primary : colors.border,
                backgroundColor: selected ? colors.primary + "18" : colors.card,
              },
            ]}
            onPress={() => onChange(opt)}
            activeOpacity={0.7}
          >
            <Ionicons
              name={selected ? "radio-button-on" : "radio-button-off"}
              size={18}
              color={selected ? colors.primary : colors.mutedForeground}
            />
            <Text
              style={[
                styles.yesNoLabel,
                { color: selected ? colors.primary : colors.foreground },
              ]}
            >
              {opt === "yes" ? "Yes" : "No"}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export default function PostpartumDepressionScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ from?: string }>();
  const backLabel = params.from || "Postpartum";

  const { isSignedIn } = useAuth();
  const { data: profile } = useGetProfile({
    query: { enabled: !!isSignedIn, queryKey: getGetProfileQueryKey() },
  });
  const updateProfileMutation = useUpdateProfile();
  const profileZip = profile?.zipCode?.trim() ?? "";

  const [checkin, setCheckin] = useState<PpdCheckin>({
    concerned: undefined,
    wantsResources: undefined,
    zip: "",
  });
  const [loaded, setLoaded] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [zipError, setZipError] = useState<string | null>(null);

  const [phq9Answers, setPhq9Answers] = useState<Phq9Answers>(
    Array<undefined>(9).fill(undefined),
  );
  const [phq9Started, setPhq9Started] = useState(false);

  useEffect(() => {
    Promise.all([loadPpdCheckin(), loadPhq9Answers()]).then(([c, phq9]) => {
      setCheckin(c);
      setPhq9Answers(phq9);
      if (phq9.some((a) => a !== undefined)) setPhq9Started(true);
      setLoaded(true);
    });
  }, []);

  const handlePhq9Change = useCallback((index: number, value: number) => {
    setPhq9Answers((prev) => {
      const next = [...prev];
      next[index] = value;
      savePhq9Answers(next);
      return next;
    });
    Haptics.selectionAsync();
  }, []);

  const handlePhq9Reset = useCallback(() => {
    const blank = Array<undefined>(9).fill(undefined);
    setPhq9Answers(blank);
    savePhq9Answers(blank);
  }, []);

  const updateCheckin = useCallback((patch: Partial<PpdCheckin>) => {
    setCheckin((prev) => {
      const next = { ...prev, ...patch };
      savePpdCheckin(next);
      return next;
    });
  }, []);

  const handleGenerate = useCallback(async () => {
    const zip = profileZip || (checkin.zip?.trim() ?? "");
    if (checkin.wantsResources === "yes" && !/^\d{5}$/.test(zip)) {
      setZipError("Please enter a valid 5-digit zip code.");
      return;
    }
    setZipError(null);
    try {
      setGenerating(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const checkinForSummary = { ...checkin, zip };
      const html = buildPostpartumResourceHtml(checkinForSummary);
      const updated = await markPpdSummaryGenerated(checkinForSummary);
      setCheckin(updated);
      if (!profileZip && isSignedIn && /^\d{5}$/.test(zip)) {
        updateProfileMutation.mutate({ data: { zipCode: zip } });
      }
      if (Platform.OS === "web") {
        Alert.alert(
          "Resource summary ready",
          "Printing/saving as a PDF is available in the mobile app.",
        );
        return;
      }
      const { uri } = await Print.printToFileAsync({ html });
      router.push({
        pathname: "/pdf-viewer",
        params: {
          uri,
          title: "My Resource Summary",
          shareTitle: "My Postpartum Depression Resource Summary",
        },
      });
    } catch {
      Alert.alert(
        "Couldn't generate",
        "Something went wrong creating your resource summary. Please try again.",
      );
    } finally {
      setGenerating(false);
    }
  }, [checkin, profileZip, isSignedIn, updateProfileMutation]);

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

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: insets.bottom + 32 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <ResponsiveContainer style={{ paddingHorizontal: 16 }}>
          <Animated.View entering={FadeInDown.duration(400)}>
            <Text style={[styles.pageTitle, { color: colors.foreground }]}>
              Postpartum Depression
            </Text>
            <Text style={[styles.pageSub, { color: colors.mutedForeground }]}>
              Based on ACOG patient guidance
            </Text>
          </Animated.View>

          <Animated.View
            entering={FadeInDown.delay(40).duration(400)}
            style={[
              styles.crisisBox,
              { borderColor: "#c0392b", backgroundColor: colors.card },
            ]}
          >
            <View style={styles.crisisHeaderRow}>
              <Ionicons name="warning" size={20} color="#c0392b" />
              <Text style={[styles.crisisTitle, { color: "#c0392b" }]}>
                If you are in crisis, get help right now
              </Text>
            </View>
            {PPD_CRISIS_RESOURCES.map((r) =>
              r.url ? (
                <TouchableOpacity
                  key={r.name}
                  style={styles.resourceItem}
                  onPress={() => WebBrowser.openBrowserAsync(r.url as string)}
                >
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.crisisResourceName,
                        styles.resourceLink,
                        { color: "#c0392b" },
                      ]}
                    >
                      {r.name}
                    </Text>
                    <Text
                      style={[
                        styles.crisisResourceDetail,
                        { color: colors.foreground },
                      ]}
                    >
                      {r.detail}
                    </Text>
                  </View>
                  <Ionicons name="open-outline" size={16} color="#c0392b" />
                </TouchableOpacity>
              ) : (
                <View key={r.name} style={{ marginBottom: 6 }}>
                  <Text
                    style={[styles.crisisResourceName, { color: "#c0392b" }]}
                  >
                    {r.name}
                  </Text>
                  <Text
                    style={[
                      styles.crisisResourceDetail,
                      { color: colors.foreground },
                    ]}
                  >
                    {r.detail}
                  </Text>
                </View>
              ),
            )}
            <Text style={[styles.crisisFooter, { color: colors.foreground }]}>
              Please also let your ob-gyn know how you're feeling — do not wait
              for your next appointment. If you are having any thoughts of
              harming yourself or your baby, don't hesitate to go to the nearest
              hospital.
            </Text>
          </Animated.View>

          <Animated.View
            entering={FadeInDown.delay(80).duration(400)}
            style={[
              styles.card,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              What to know
            </Text>
            {PPD_HIGHLIGHTS.map((h, i) => (
              <View key={i} style={styles.highlightRow}>
                <Text style={[styles.bullet, { color: colors.primary }]}>
                  •
                </Text>
                <Text
                  style={[
                    styles.highlightText,
                    { color: colors.mutedForeground },
                  ]}
                >
                  {h}
                </Text>
              </View>
            ))}
            <TouchableOpacity
              style={[
                styles.pdfBtn,
                { borderColor: colors.primary, backgroundColor: colors.card },
              ]}
              onPress={openHandoutPdf}
            >
              <Ionicons
                name="document-text-outline"
                size={18}
                color={colors.primary}
              />
              <Text style={[styles.pdfBtnText, { color: colors.primary }]}>
                View Full Handout (PDF)
              </Text>
            </TouchableOpacity>
          </Animated.View>

          {!loaded && (
            <ActivityIndicator
              color={colors.primary}
              style={{ marginTop: 20 }}
            />
          )}

          {loaded && (
            <>
              {/* ── PHQ-9 Screening ── */}
              <Animated.View
                entering={FadeInDown.delay(120).duration(400)}
                style={[
                  styles.card,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <View style={styles.phq9HeaderRow}>
                  <Ionicons
                    name="clipboard-outline"
                    size={20}
                    color={colors.primary}
                  />
                  <Text
                    style={[
                      styles.sectionTitle,
                      { color: colors.foreground, flex: 1, marginBottom: 0 },
                    ]}
                  >
                    PHQ-9 Depression Screening
                  </Text>
                </View>

                <Text
                  style={[styles.phq9Intro, { color: colors.mutedForeground }]}
                >
                  The PHQ-9 is a validated 9-question tool used by healthcare
                  providers to screen for depression. Answer each question based
                  on how often you have been bothered by each problem{" "}
                  <Text style={{ fontFamily: "Inter_600SemiBold" }}>
                    over the last 2 weeks
                  </Text>
                  .
                </Text>
                <Text
                  style={[
                    styles.phq9Disclaimer,
                    { color: colors.mutedForeground },
                  ]}
                >
                  This is a screening tool — not a diagnosis. Always share your
                  results with your ob-gyn.
                </Text>

                {!phq9Started ? (
                  <TouchableOpacity
                    style={[
                      styles.phq9StartBtn,
                      { backgroundColor: colors.primary },
                    ]}
                    onPress={() => setPhq9Started(true)}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name="play-circle-outline"
                      size={18}
                      color={colors.primaryForeground}
                    />
                    <Text
                      style={[
                        styles.phq9StartBtnText,
                        { color: colors.primaryForeground },
                      ]}
                    >
                      Start Screening
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <>
                    {/* Progress */}
                    <View style={styles.phq9ProgressRow}>
                      <Text
                        style={[
                          styles.phq9ProgressText,
                          { color: colors.mutedForeground },
                        ]}
                      >
                        {phq9Answers.filter((a) => a !== undefined).length} of 9
                        answered
                      </Text>
                      <TouchableOpacity onPress={handlePhq9Reset}>
                        <Text
                          style={[
                            styles.phq9ResetText,
                            { color: colors.mutedForeground },
                          ]}
                        >
                          Reset
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {/* Questions */}
                    {PHQ9_QUESTIONS.map((q, qi) => (
                      <View
                        key={qi}
                        style={[
                          styles.phq9QuestionCard,
                          {
                            backgroundColor: colors.background,
                            borderColor:
                              phq9Answers[qi] !== undefined
                                ? colors.primary + "55"
                                : colors.border,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.phq9QuestionNum,
                            { color: colors.primary },
                          ]}
                        >
                          {qi + 1}.
                        </Text>
                        <Text
                          style={[
                            styles.phq9QuestionText,
                            { color: colors.foreground },
                          ]}
                        >
                          {q}
                        </Text>
                        <View style={styles.phq9OptionsGrid}>
                          {PHQ9_OPTIONS.map((opt) => {
                            const selected = phq9Answers[qi] === opt.value;
                            return (
                              <TouchableOpacity
                                key={opt.value}
                                style={[
                                  styles.phq9OptionBtn,
                                  {
                                    borderColor: selected
                                      ? colors.primary
                                      : colors.border,
                                    backgroundColor: selected
                                      ? colors.primary + "18"
                                      : colors.card,
                                  },
                                ]}
                                onPress={() => handlePhq9Change(qi, opt.value)}
                                activeOpacity={0.7}
                              >
                                <Text
                                  style={[
                                    styles.phq9OptionScore,
                                    {
                                      color: selected
                                        ? colors.primary
                                        : colors.mutedForeground,
                                    },
                                  ]}
                                >
                                  {opt.value}
                                </Text>
                                <Text
                                  style={[
                                    styles.phq9OptionLabel,
                                    {
                                      color: selected
                                        ? colors.primary
                                        : colors.foreground,
                                      fontFamily: selected
                                        ? "Inter_600SemiBold"
                                        : "Inter_400Regular",
                                    },
                                  ]}
                                >
                                  {opt.label}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                        {/* Safety note for Q9 */}
                        {qi === 8 &&
                          phq9Answers[8] !== undefined &&
                          phq9Answers[8]! > 0 && (
                            <View
                              style={[
                                styles.phq9SafetyBox,
                                {
                                  backgroundColor: "#fdf1f0",
                                  borderColor: "#c0392b",
                                },
                              ]}
                            >
                              <Ionicons
                                name="warning-outline"
                                size={16}
                                color="#c0392b"
                              />
                              <Text
                                style={[
                                  styles.phq9SafetyText,
                                  { color: "#c0392b" },
                                ]}
                              >
                                If you are having thoughts of harming yourself
                                or your baby, please call 988 or 911, or go to
                                the nearest emergency room right now.
                              </Text>
                            </View>
                          )}
                      </View>
                    ))}

                    {/* Results */}
                    {phq9Complete(phq9Answers) &&
                      (() => {
                        const score = scorePhq9(phq9Answers);
                        const cat = getPhq9Category(score);
                        return (
                          <View
                            style={[
                              styles.phq9ResultCard,
                              {
                                borderColor: cat.color,
                                backgroundColor: cat.color + "12",
                              },
                            ]}
                          >
                            <View style={styles.phq9ResultHeaderRow}>
                              <Ionicons
                                name="bar-chart-outline"
                                size={20}
                                color={cat.color}
                              />
                              <Text
                                style={[
                                  styles.phq9ResultTitle,
                                  { color: cat.color },
                                ]}
                              >
                                Your Score: {score} / 27
                              </Text>
                            </View>
                            <Text
                              style={[
                                styles.phq9ResultLabel,
                                { color: cat.color },
                              ]}
                            >
                              {cat.label}
                            </Text>
                            <Text
                              style={[
                                styles.phq9ResultRec,
                                { color: colors.foreground },
                              ]}
                            >
                              {cat.recommendation}
                            </Text>
                            <View
                              style={[
                                styles.phq9ActionRow,
                                { backgroundColor: cat.color + "20" },
                              ]}
                            >
                              <Ionicons
                                name="arrow-forward-circle-outline"
                                size={16}
                                color={cat.color}
                              />
                              <Text
                                style={[
                                  styles.phq9ActionText,
                                  { color: cat.color },
                                ]}
                              >
                                {cat.action}
                              </Text>
                            </View>
                            <View style={styles.phq9ScoreGuide}>
                              <Text
                                style={[
                                  styles.phq9ScoreGuideTitle,
                                  { color: colors.mutedForeground },
                                ]}
                              >
                                Score guide
                              </Text>
                              {[
                                {
                                  range: "0–4",
                                  label: "Minimal or none",
                                  color: "#27ae60",
                                },
                                {
                                  range: "5–9",
                                  label: "Mild",
                                  color: "#f39c12",
                                },
                                {
                                  range: "10–14",
                                  label: "Moderate",
                                  color: "#e67e22",
                                },
                                {
                                  range: "15–19",
                                  label: "Moderately severe",
                                  color: "#e74c3c",
                                },
                                {
                                  range: "20–27",
                                  label: "Severe",
                                  color: "#c0392b",
                                },
                              ].map((row) => (
                                <View
                                  key={row.range}
                                  style={styles.phq9ScoreRow}
                                >
                                  <View
                                    style={[
                                      styles.phq9ScoreDot,
                                      { backgroundColor: row.color },
                                    ]}
                                  />
                                  <Text
                                    style={[
                                      styles.phq9ScoreRangeText,
                                      { color: colors.mutedForeground },
                                    ]}
                                  >
                                    <Text
                                      style={{
                                        fontFamily: "Inter_600SemiBold",
                                      }}
                                    >
                                      {row.range}
                                    </Text>{" "}
                                    — {row.label}
                                  </Text>
                                </View>
                              ))}
                            </View>
                          </View>
                        );
                      })()}
                  </>
                )}
              </Animated.View>

              {/* ── Concerned check-in ── */}
              <Animated.View
                entering={FadeInDown.delay(160).duration(400)}
                style={[
                  styles.card,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <Text
                  style={[styles.sectionTitle, { color: colors.foreground }]}
                >
                  Are you concerned you might be experiencing postpartum
                  depression?
                </Text>
                <YesNoRow
                  value={checkin.concerned}
                  onChange={(v) => updateCheckin({ concerned: v })}
                  colors={colors}
                />

                {checkin.concerned === "yes" && (
                  <View
                    style={[
                      styles.reminderBox,
                      { backgroundColor: colors.primary + "18" },
                    ]}
                  >
                    <Ionicons
                      name="heart-outline"
                      size={18}
                      color={colors.primary}
                    />
                    <Text
                      style={[
                        styles.reminderText,
                        { color: colors.foreground },
                      ]}
                    >
                      Please let your ob-gyn know how you're feeling as soon as
                      possible — you don't need to wait for your next
                      appointment. And remember: if you're having thoughts of
                      hurting yourself or your baby, call 988 or 911, or go to
                      the nearest hospital right away.
                    </Text>
                  </View>
                )}
              </Animated.View>

              {checkin.concerned && (
                <Animated.View
                  entering={FadeInDown.delay(160).duration(400)}
                  style={[
                    styles.card,
                    {
                      backgroundColor: colors.card,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[styles.sectionTitle, { color: colors.foreground }]}
                  >
                    Would you like help finding additional resources?
                  </Text>
                  <YesNoRow
                    value={checkin.wantsResources}
                    onChange={(v) => updateCheckin({ wantsResources: v })}
                    colors={colors}
                  />

                  {checkin.wantsResources === "yes" && (
                    <View style={{ marginTop: 14 }}>
                      {profileZip ? (
                        <Text
                          style={[
                            styles.fieldHelper,
                            { color: colors.mutedForeground },
                          ]}
                        >
                          We'll use the zip code from My Info ({profileZip}) to
                          point you to local support groups, therapists, and
                          low-cost clinics near you.
                        </Text>
                      ) : (
                        <>
                          <Text
                            style={[
                              styles.fieldLabel,
                              { color: colors.foreground },
                            ]}
                          >
                            Your zip code
                          </Text>
                          <Text
                            style={[
                              styles.fieldHelper,
                              { color: colors.mutedForeground },
                            ]}
                          >
                            We'll point you to directories that let you search
                            for local support groups, therapists, and low-cost
                            clinics near you. We'll also save this to My Info so
                            we don't have to ask again.
                          </Text>
                          <TextInput
                            style={[
                              styles.input,
                              {
                                borderColor: zipError
                                  ? "#c0392b"
                                  : colors.border,
                                color: colors.foreground,
                                backgroundColor: colors.background,
                              },
                            ]}
                            value={checkin.zip}
                            onChangeText={(v) => {
                              setZipError(null);
                              updateCheckin({ zip: v });
                            }}
                            placeholder="e.g. 94110"
                            placeholderTextColor={colors.mutedForeground}
                            keyboardType="number-pad"
                            maxLength={5}
                          />
                          {zipError && (
                            <Text
                              style={[styles.errorText, { color: "#c0392b" }]}
                            >
                              {zipError}
                            </Text>
                          )}
                        </>
                      )}
                    </View>
                  )}
                </Animated.View>
              )}

              {checkin.concerned && checkin.wantsResources && (
                <TouchableOpacity
                  style={[
                    styles.generateBtn,
                    { backgroundColor: colors.primary },
                  ]}
                  onPress={handleGenerate}
                  disabled={generating}
                >
                  {generating ? (
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
                          styles.generateBtnText,
                          { color: colors.primaryForeground },
                        ]}
                      >
                        View My Resource Summary
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </>
          )}
          <AskCard returnTo="/postpartum-depression" />
        </ResponsiveContainer>
      </ScrollView>
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
    marginBottom: 16,
  },
  crisisBox: {
    borderRadius: 16,
    padding: 14,
    borderWidth: 1.5,
    marginBottom: 16,
  },
  crisisHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  crisisTitle: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    flex: 1,
  },
  resourceItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  resourceLink: {
    textDecorationLine: "underline",
  },
  crisisResourceName: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  crisisResourceDetail: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
  crisisFooter: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    lineHeight: 19,
    marginTop: 6,
  },
  card: {
    borderRadius: 18,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 10,
  },
  highlightRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
  },
  bullet: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    lineHeight: 20,
  },
  highlightText: {
    flex: 1,
    fontSize: 13.5,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
  },
  pdfBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 12,
    paddingVertical: 14,
    borderWidth: 1.5,
    marginTop: 8,
  },
  pdfBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  yesNoRow: {
    flexDirection: "row",
    gap: 10,
  },
  yesNoBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 10,
    borderWidth: 1.5,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  yesNoLabel: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  reminderBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderRadius: 12,
    padding: 12,
    marginTop: 14,
  },
  reminderText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    lineHeight: 19,
  },
  fieldLabel: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 4,
  },
  fieldHelper: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginBottom: 8,
    lineHeight: 17,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  errorText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    marginTop: 6,
  },
  generateBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 12,
    paddingVertical: 16,
    marginTop: 4,
    marginBottom: 12,
  },
  generateBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  phq9HeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  phq9Intro: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 19,
    marginBottom: 6,
  },
  phq9Disclaimer: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    fontStyle: "italic",
    lineHeight: 17,
    marginBottom: 14,
  },
  phq9StartBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 12,
    paddingVertical: 14,
  },
  phq9StartBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  phq9ProgressRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  phq9ProgressText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  phq9ResetText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    textDecorationLine: "underline",
  },
  phq9QuestionCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginBottom: 10,
  },
  phq9QuestionNum: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    marginBottom: 2,
  },
  phq9QuestionText: {
    fontSize: 13.5,
    fontFamily: "Inter_500Medium",
    lineHeight: 19,
    marginBottom: 10,
  },
  phq9OptionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  phq9OptionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 8,
    borderWidth: 1,
    paddingVertical: 7,
    paddingHorizontal: 10,
    minWidth: "47%",
    flexGrow: 1,
  },
  phq9OptionScore: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    minWidth: 14,
  },
  phq9OptionLabel: {
    fontSize: 12,
    lineHeight: 16,
    flexShrink: 1,
  },
  phq9SafetyBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
    marginTop: 10,
  },
  phq9SafetyText: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    lineHeight: 17,
  },
  phq9ResultCard: {
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 14,
    marginTop: 6,
  },
  phq9ResultHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  phq9ResultTitle: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
  },
  phq9ResultLabel: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 10,
  },
  phq9ResultRec: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 19,
    marginBottom: 12,
  },
  phq9ActionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 10,
    padding: 10,
    marginBottom: 14,
  },
  phq9ActionText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    flex: 1,
    lineHeight: 18,
  },
  phq9ScoreGuide: {
    gap: 4,
  },
  phq9ScoreGuideTitle: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  phq9ScoreRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  phq9ScoreDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  phq9ScoreRangeText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
});
