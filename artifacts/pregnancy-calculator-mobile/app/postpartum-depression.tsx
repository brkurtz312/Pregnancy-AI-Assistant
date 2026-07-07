import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@clerk/expo";
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
  type PpdCheckin,
  type YesNo,
} from "@/lib/postpartum-depression";

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
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(destUri, {
        mimeType: "application/pdf",
        dialogTitle: "Postpartum Depression (ACOG)",
        UTI: "com.adobe.pdf",
      });
    } else {
      Alert.alert(
        "Can't open PDF",
        "Viewing files isn't available on this device.",
      );
    }
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
  const [generated, setGenerated] = useState(false);
  const [zipError, setZipError] = useState<string | null>(null);

  useEffect(() => {
    loadPpdCheckin().then((c) => {
      setCheckin(c);
      setGenerated(!!c.generatedAt);
      setLoaded(true);
    });
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
        setGenerated(true);
        Alert.alert(
          "Resource summary ready",
          "You can view it in-app now. Printing/saving as a PDF is available in the mobile app.",
        );
        return;
      }
      const { uri } = await Print.printToFileAsync({ html });
      setGenerated(true);
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: "application/pdf",
          dialogTitle: "My Postpartum Depression Resource Summary",
        });
      } else {
        Alert.alert("Saved", "Your resource summary PDF was created.");
      }
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
                <Text style={[styles.crisisResourceName, { color: "#c0392b" }]}>
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
            for your next appointment. If you are having any thoughts of harming
            yourself or your baby, don't hesitate to go to the nearest hospital.
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
              <Text style={[styles.bullet, { color: colors.primary }]}>•</Text>
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
              View Full ACOG Handout (PDF)
            </Text>
          </TouchableOpacity>
        </Animated.View>

        {!loaded && (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
        )}

        {loaded && (
          <>
            <Animated.View
              entering={FadeInDown.delay(120).duration(400)}
              style={[
                styles.card,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
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
                    style={[styles.reminderText, { color: colors.foreground }]}
                  >
                    Please let your ob-gyn know how you're feeling as soon as
                    possible — you don't need to wait for your next appointment.
                    And remember: if you're having thoughts of hurting yourself
                    or your baby, call 988 or 911, or go to the nearest hospital
                    right away.
                  </Text>
                </View>
              )}
            </Animated.View>

            {checkin.concerned && (
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
                          We'll point you to directories that let you search for
                          local support groups, therapists, and low-cost clinics
                          near you. We'll also save this to My Info so we don't
                          have to ask again.
                        </Text>
                        <TextInput
                          style={[
                            styles.input,
                            {
                              borderColor: zipError ? "#c0392b" : colors.border,
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
                      name="sparkles-outline"
                      size={18}
                      color={colors.primaryForeground}
                    />
                    <Text
                      style={[
                        styles.generateBtnText,
                        { color: colors.primaryForeground },
                      ]}
                    >
                      Generate My Resource Summary
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            )}

            {generated && (
              <TouchableOpacity
                style={[
                  styles.viewBtn,
                  { borderColor: colors.primary, backgroundColor: colors.card },
                ]}
                onPress={() =>
                  router.push({
                    pathname: "/postpartum-depression-summary",
                    params: { from: "Postpartum Depression" },
                  })
                }
              >
                <Ionicons
                  name="reader-outline"
                  size={18}
                  color={colors.primary}
                />
                <Text style={[styles.viewBtnText, { color: colors.primary }]}>
                  View My Resource Summary in App
                </Text>
              </TouchableOpacity>
            )}
          </>
        )}
        <AskCard returnTo="/postpartum-depression" />
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
  viewBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 12,
    paddingVertical: 14,
    borderWidth: 1.5,
    marginBottom: 8,
  },
  viewBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
});
