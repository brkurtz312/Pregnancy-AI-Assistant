import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as WebBrowser from "expo-web-browser";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import {
  PPD_HIGHLIGHTS,
  PPD_CRISIS_RESOURCES,
  PPD_NATIONAL_RESOURCES,
  PPD_LOCAL_DIRECTORIES,
  buildPostpartumResourceHtml,
  loadPpdCheckin,
  type PpdCheckin,
} from "@/lib/postpartum-depression";

export default function PostpartumDepressionSummaryScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ from?: string }>();
  const backLabel = params.from || "Postpartum Depression";

  const [checkin, setCheckin] = useState<PpdCheckin | null>(null);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    loadPpdCheckin().then(setCheckin);
  }, []);

  const handleShare = async () => {
    if (!checkin) return;
    try {
      setSharing(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const html = buildPostpartumResourceHtml(checkin);
      if (Platform.OS === "web") {
        Alert.alert(
          "Not available on web",
          "Printing/saving as a PDF is available in the mobile app.",
        );
        return;
      }
      const { uri } = await Print.printToFileAsync({ html });
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
        "Couldn't share",
        "Something went wrong preparing your PDF. Please try again.",
      );
    } finally {
      setSharing(false);
    }
  };

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

      {!checkin ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingBottom: insets.bottom + 32 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.pageTitle, { color: colors.foreground }]}>
            My Resource Summary
          </Text>
          <Text style={[styles.pageSub, { color: colors.mutedForeground }]}>
            Postpartum depression — based on ACOG guidance
          </Text>

          <View
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
              Please also let your ob-gyn know how you're feeling. Don't
              hesitate to go to the nearest hospital if you're having any
              thoughts of harming yourself or your baby.
            </Text>
          </View>

          <View
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
          </View>

          {checkin.concerned && (
            <View
              style={[
                styles.card,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                Your check-in
              </Text>
              <Text style={[styles.body, { color: colors.mutedForeground }]}>
                You indicated you{" "}
                {checkin.concerned === "yes" ? "are" : "are not currently"}{" "}
                concerned about postpartum depression symptoms.
                {checkin.concerned === "yes"
                  ? " Please tell your ob-gyn how you're feeling as soon as possible."
                  : ""}
              </Text>
            </View>
          )}

          <View
            style={[
              styles.card,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              National support
            </Text>
            {PPD_NATIONAL_RESOURCES.map((r) =>
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
          </View>

          {checkin.wantsResources === "yes" && (
            <View
              style={[
                styles.card,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                Local resources
                {checkin.zip ? ` near ${checkin.zip}` : ""}
              </Text>
              <Text
                style={[
                  styles.body,
                  { color: colors.mutedForeground, marginBottom: 10 },
                ]}
              >
                These directories let you search by your zip code
                {checkin.zip ? ` (${checkin.zip})` : ""} for support groups,
                therapists, and low-cost clinics near you.
              </Text>
              {PPD_LOCAL_DIRECTORIES.map((r) =>
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
                      style={[
                        styles.resourceName,
                        { color: colors.foreground },
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
                ),
              )}
            </View>
          )}

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
                  name="share-outline"
                  size={18}
                  color={colors.primaryForeground}
                />
                <Text
                  style={[
                    styles.shareBtnText,
                    { color: colors.primaryForeground },
                  ]}
                >
                  Print / Save as PDF
                </Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.editBtn,
              { borderColor: colors.primary, backgroundColor: colors.card },
            ]}
            onPress={() => router.back()}
          >
            <Ionicons name="create-outline" size={18} color={colors.primary} />
            <Text style={[styles.editBtnText, { color: colors.primary }]}>
              Edit My Answers
            </Text>
          </TouchableOpacity>
        </ScrollView>
      )}
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
  body: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 21,
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
  resourceItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  resourceLink: {
    textDecorationLine: "underline",
  },
  resourceName: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 2,
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
  editBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 12,
    paddingVertical: 14,
    borderWidth: 1.5,
    marginBottom: 8,
  },
  editBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
});
