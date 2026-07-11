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
  BF_HIGHLIGHTS,
  BF_CALLOUT_REASONS,
  BF_NATIONAL_RESOURCES,
  BF_LOCAL_DIRECTORIES,
  buildBreastfeedingResourceHtml,
  loadBfCheckin,
  type BfCheckin,
} from "@/lib/breastfeeding";

export default function BreastfeedingSummaryScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ from?: string }>();
  const backLabel = params.from || "Breastfeeding";

  const [checkin, setCheckin] = useState<BfCheckin | null>(null);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    loadBfCheckin().then(setCheckin);
  }, []);

  const handleShare = async () => {
    if (!checkin) return;
    try {
      setSharing(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const html = buildBreastfeedingResourceHtml(checkin);
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
        params: { uri, title: "Resource Summary", shareTitle: "My Breastfeeding Resource Summary" },
      });
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
            Breastfeeding — based on ACOG guidance
          </Text>

          <View
            style={[
              styles.calloutBox,
              { borderColor: "#b5651d", backgroundColor: colors.card },
            ]}
          >
            <View style={styles.calloutHeaderRow}>
              <Ionicons name="alert-circle" size={20} color="#b5651d" />
              <Text style={[styles.calloutTitle, { color: "#b5651d" }]}>
                Call your ob-gyn the same day if you notice
              </Text>
            </View>
            {BF_CALLOUT_REASONS.map((reason) => (
              <View key={reason} style={styles.calloutRow}>
                <Text style={[styles.calloutBullet, { color: "#b5651d" }]}>
                  •
                </Text>
                <Text
                  style={[styles.calloutText, { color: colors.foreground }]}
                >
                  {reason}
                </Text>
              </View>
            ))}
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
            {BF_HIGHLIGHTS.map((h, i) => (
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

          <View
            style={[
              styles.card,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              National support
            </Text>
            {BF_NATIONAL_RESOURCES.map((r) =>
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
                {checkin.zip ? ` (${checkin.zip})` : ""} for lactation
                consultants, peer-support groups, and free breastfeeding help
                near you.
              </Text>
              {BF_LOCAL_DIRECTORIES.map((r) =>
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
                  View PDF
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
  calloutBox: {
    borderRadius: 16,
    padding: 14,
    borderWidth: 1.5,
    marginBottom: 16,
  },
  calloutHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  calloutTitle: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    flex: 1,
  },
  calloutRow: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 4,
  },
  calloutBullet: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    lineHeight: 19,
  },
  calloutText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
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
