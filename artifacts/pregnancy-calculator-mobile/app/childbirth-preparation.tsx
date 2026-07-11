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
  CHILDBIRTH_METHOD_HIGHLIGHTS,
  CHILDBIRTH_PREP_HANDOUT,
  CHILDBIRTH_PREP_RESOURCES,
  buildChildbirthPrepResourceHtml,
  buildFacilityClassesSearchUrl,
  buildLocalClassesSearchUrl,
} from "@/lib/childbirth-preparation";

async function openHandoutPdf() {
  try {
    const asset = Asset.fromModule(CHILDBIRTH_PREP_HANDOUT.asset);
    await asset.downloadAsync();
    const sourceUri = asset.localUri ?? asset.uri;
    if (!sourceUri) {
      throw new Error("PDF asset has no resolvable URI");
    }
    const destUri = `${FileSystem.cacheDirectory}${CHILDBIRTH_PREP_HANDOUT.file}`;
    await FileSystem.copyAsync({ from: sourceUri, to: destUri });
    if (Platform.OS === "web") {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(destUri, {
          mimeType: "application/pdf",
          dialogTitle: CHILDBIRTH_PREP_HANDOUT.title,
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
        title: CHILDBIRTH_PREP_HANDOUT.title,
        shareTitle: CHILDBIRTH_PREP_HANDOUT.title,
      },
    });
  } catch {
    Alert.alert(
      "Can't open PDF",
      "Something went wrong opening the handout. Please try again.",
    );
  }
}

function LocalClassesFinder() {
  const colors = useColors();
  const { isSignedIn } = useAuth();
  const { data: profile, isLoading } = useGetProfile({
    query: { enabled: !!isSignedIn, queryKey: getGetProfileQueryKey() },
  });
  const updateMutation = useUpdateProfile();

  const [zipCode, setZipCode] = useState("");
  const [hospitalName, setHospitalName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile) {
      setZipCode(profile.zipCode ?? "");
      setHospitalName(profile.hospitalName ?? "");
    }
  }, [profile]);

  const hasZip = !!zipCode.trim();
  const hasFacility = !!hospitalName.trim();
  const needsInfo = !hasZip && !hasFacility;

  const handleSearchZip = useCallback(() => {
    if (!hasZip) return;
    WebBrowser.openBrowserAsync(buildLocalClassesSearchUrl(zipCode.trim()));
  }, [hasZip, zipCode]);

  const handleSearchFacility = useCallback(() => {
    if (!hasFacility) return;
    WebBrowser.openBrowserAsync(
      buildFacilityClassesSearchUrl(hospitalName.trim()),
    );
  }, [hasFacility, hospitalName]);

  const handleSaveAndSearch = useCallback(async () => {
    const trimmedZip = zipCode.trim();
    const trimmedFacility = hospitalName.trim();
    if (!trimmedZip && !trimmedFacility) {
      Alert.alert(
        "Add a ZIP code or facility",
        "Enter at least one so we can search for local classes.",
      );
      return;
    }
    if (isSignedIn) {
      try {
        setSaving(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        await updateMutation.mutateAsync({
          data: {
            firstName: profile?.firstName ?? null,
            zipCode: trimmedZip || null,
            providerName: profile?.providerName ?? null,
            providerPhone: profile?.providerPhone ?? null,
            providerAddress: profile?.providerAddress ?? null,
            deliveryCenterType: profile?.deliveryCenterType ?? "hospital",
            hospitalName: trimmedFacility || null,
            hospitalPhone: profile?.hospitalPhone ?? null,
            hospitalAddress: profile?.hospitalAddress ?? null,
          },
        });
      } catch {
        Alert.alert(
          "Couldn't save",
          "We couldn't save this to My Info, but we'll still search now.",
        );
      } finally {
        setSaving(false);
      }
    }
    if (trimmedZip) {
      WebBrowser.openBrowserAsync(buildLocalClassesSearchUrl(trimmedZip));
    }
    if (trimmedFacility) {
      WebBrowser.openBrowserAsync(
        buildFacilityClassesSearchUrl(trimmedFacility),
      );
    }
  }, [zipCode, hospitalName, isSignedIn, profile, updateMutation]);

  if (isSignedIn && isLoading) {
    return (
      <ActivityIndicator color={colors.primary} style={{ marginVertical: 8 }} />
    );
  }

  return (
    <View>
      {!needsInfo ? (
        <View style={{ gap: 10 }}>
          {hasZip ? (
            <TouchableOpacity
              style={[
                styles.searchBtn,
                { borderColor: colors.primary, backgroundColor: colors.card },
              ]}
              onPress={handleSearchZip}
            >
              <Ionicons
                name="location-outline"
                size={18}
                color={colors.primary}
              />
              <Text style={[styles.searchBtnText, { color: colors.primary }]}>
                Find classes near {zipCode.trim()}
              </Text>
            </TouchableOpacity>
          ) : null}
          {hasFacility ? (
            <TouchableOpacity
              style={[
                styles.searchBtn,
                { borderColor: colors.primary, backgroundColor: colors.card },
              ]}
              onPress={handleSearchFacility}
            >
              <Ionicons
                name="business-outline"
                size={18}
                color={colors.primary}
              />
              <Text
                style={[styles.searchBtnText, { color: colors.primary }]}
                numberOfLines={2}
              >
                Search {hospitalName.trim()}'s Women's Services for classes
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : (
        <View>
          <Text
            style={[styles.finderPrompt, { color: colors.mutedForeground }]}
          >
            Add your ZIP code or delivery facility to find classes near you.
          </Text>
          <View style={{ gap: 10 }}>
            <View style={styles.fieldWrap}>
              <Text
                style={[styles.fieldLabel, { color: colors.mutedForeground }]}
              >
                ZIP CODE
              </Text>
              <TextInput
                value={zipCode}
                onChangeText={setZipCode}
                placeholder="90210"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="number-pad"
                style={[
                  styles.input,
                  {
                    color: colors.foreground,
                    backgroundColor: colors.background,
                    borderColor: colors.border,
                  },
                ]}
              />
            </View>
            <View style={styles.fieldWrap}>
              <Text
                style={[styles.fieldLabel, { color: colors.mutedForeground }]}
              >
                DELIVERY FACILITY
              </Text>
              <TextInput
                value={hospitalName}
                onChangeText={setHospitalName}
                placeholder="City Medical Center"
                placeholderTextColor={colors.mutedForeground}
                style={[
                  styles.input,
                  {
                    color: colors.foreground,
                    backgroundColor: colors.background,
                    borderColor: colors.border,
                  },
                ]}
              />
            </View>
          </View>
        </View>
      )}

      {needsInfo ? (
        <TouchableOpacity
          style={[styles.saveSearchBtn, { backgroundColor: colors.primary }]}
          onPress={handleSaveAndSearch}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color={colors.primaryForeground} />
          ) : (
            <>
              <Ionicons
                name="search-outline"
                size={16}
                color={colors.primaryForeground}
              />
              <Text
                style={[
                  styles.saveSearchBtnText,
                  { color: colors.primaryForeground },
                ]}
              >
                {isSignedIn ? "Save & Search" : "Search"}
              </Text>
            </>
          )}
        </TouchableOpacity>
      ) : null}
      {needsInfo && !isSignedIn ? (
        <Text style={[styles.signInHint, { color: colors.mutedForeground }]}>
          Sign in to save this to My Info for next time.
        </Text>
      ) : null}
    </View>
  );
}

export default function ChildbirthPreparationScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ from?: string }>();
  const backLabel = params.from || "Prenatal Care";
  const [sharing, setSharing] = useState(false);

  const handleShare = useCallback(async () => {
    try {
      setSharing(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const html = buildChildbirthPrepResourceHtml();
      if (Platform.OS === "web") {
        Alert.alert(
          "Not available on web",
          "Printing/saving as a PDF is available in the mobile app.",
        );
        return;
      }
      const { uri } = await Print.printToFileAsync({ html });
      router.push({
        pathname: "/pdf-viewer",
        params: {
          uri,
          title: "Resource Summary",
          shareTitle: "My Preparing for Childbirth Resource Summary",
        },
      });
    } catch {
      Alert.alert(
        "Couldn't share",
        "Something went wrong preparing your PDF. Please try again.",
      );
    } finally {
      setSharing(false);
    }
  }, []);

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
            Childbirth Preparation
          </Text>
          <Text style={[styles.pageSub, { color: colors.mutedForeground }]}>
            Classes and skills to help you feel ready for labor
          </Text>
        </Animated.View>

        <Animated.View
          entering={FadeInDown.delay(40).duration(400)}
          style={[
            styles.reassureBox,
            { backgroundColor: colors.primary + "12" },
          ]}
        >
          <Ionicons name="heart" size={18} color={colors.primary} />
          <Text style={[styles.reassureText, { color: colors.foreground }]}>
            You don't have to figure labor out on the day. A good class teaches
            you what your body will do, what your options are, and brings your
            support person into the plan.
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
          {CHILDBIRTH_METHOD_HIGHLIGHTS.map((h, i) => (
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
              View Full Handout (PDF)
            </Text>
          </TouchableOpacity>
        </Animated.View>

        <Animated.View
          entering={FadeInDown.delay(120).duration(400)}
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            Find local classes
          </Text>
          <Text style={[styles.finderSub, { color: colors.mutedForeground }]}>
            We'll search near your ZIP code, and check your delivery facility's
            Women's Services page for classes.
          </Text>
          <LocalClassesFinder />
        </Animated.View>

        <Animated.View
          entering={FadeInDown.delay(160).duration(400)}
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            Trusted resources
          </Text>
          {CHILDBIRTH_PREP_RESOURCES.map((r) =>
            r.url ? (
              <TouchableOpacity
                key={r.name}
                style={styles.resourceItem}
                onPress={() => WebBrowser.openBrowserAsync(r.url as string)}
              >
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.resourceName,
                      styles.resourceLink,
                      { color: colors.primary },
                    ]}
                  >
                    {r.name}
                  </Text>
                  <Text
                    style={[
                      styles.resourceDetail,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    {r.detail}
                  </Text>
                </View>
                <Ionicons
                  name="open-outline"
                  size={16}
                  color={colors.primary}
                />
              </TouchableOpacity>
            ) : (
              <View key={r.name} style={{ marginBottom: 8 }}>
                <Text
                  style={[styles.resourceName, { color: colors.foreground }]}
                >
                  {r.name}
                </Text>
                <Text
                  style={[
                    styles.resourceDetail,
                    { color: colors.mutedForeground },
                  ]}
                >
                  {r.detail}
                </Text>
              </View>
            ),
          )}
        </Animated.View>

        <TouchableOpacity
          style={[styles.shareBtn, { backgroundColor: colors.primary }]}
          onPress={handleShare}
          disabled={sharing}
        >
          {sharing ? (
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
                  styles.shareBtnText,
                  { color: colors.primaryForeground },
                ]}
              >
                View Resource Summary PDF
              </Text>
            </>
          )}
        </TouchableOpacity>
        <AskCard returnTo="/childbirth-preparation" />
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
  reassureBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderRadius: 14,
    padding: 12,
    marginBottom: 16,
  },
  reassureText: {
    flex: 1,
    fontSize: 13.5,
    fontFamily: "Inter_500Medium",
    lineHeight: 19,
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
  finderSub: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
    marginBottom: 12,
  },
  finderPrompt: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
    marginBottom: 10,
  },
  fieldWrap: { gap: 6 },
  fieldLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.8,
  },
  input: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  searchBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1.5,
  },
  searchBtnText: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  saveSearchBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 12,
    paddingVertical: 12,
    marginTop: 12,
  },
  saveSearchBtnText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  signInHint: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    marginTop: 8,
  },
  resourceItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  resourceName: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 2,
  },
  resourceLink: {
    textDecorationLine: "underline",
  },
  resourceDetail: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
  shareBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 12,
    paddingVertical: 16,
    marginTop: 4,
    marginBottom: 12,
  },
  shareBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
});
