import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as WebBrowser from "expo-web-browser";
import React, { useState } from "react";
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
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { AskCard } from "@/components/AskCard";

const PDF_ASSET = require("@/assets/docs/travel-in-pregnancy.pdf");
const HANDOUT_TITLE = "Travel During Pregnancy";

const HIGHLIGHTS = [
  "Air travel is generally safe for uncomplicated pregnancies up to 36 weeks. After that, many airlines require a letter from your provider.",
  "Always wear your seat belt: the lap strap should go below your belly across your hips and pelvis, and the shoulder strap across your chest.",
  "On long flights or car rides, move your legs or walk every 1–2 hours to reduce the risk of blood clots (DVT).",
  "Stay well hydrated during travel — cabin air is very dry and dehydration can trigger contractions.",
  "If traveling internationally, check destination-specific risks (Zika, malaria, food/water safety) and required vaccinations well in advance.",
  "Keep a copy of your prenatal records with you and know the location of medical facilities at your destination.",
  "Compression stockings can help reduce leg swelling and DVT risk during long-distance travel.",
];

const AVOID_TRAVEL = [
  "Pregnancy complications such as placenta previa, preeclampsia, or preterm labor risk",
  "Destinations with active Zika virus transmission (no safe level of exposure)",
  "Areas where required vaccines are not safe during pregnancy",
  "Late third trimester without your provider's explicit clearance",
];

const RESOURCES = [
  {
    name: "ACOG: Travel During Pregnancy",
    detail:
      "Full guidance from the American College of Obstetricians and Gynecologists",
    url: "https://www.acog.org/womens-health/faqs/travel-during-pregnancy",
  },
  {
    name: "CDC: Traveling While Pregnant or Breastfeeding",
    detail: "Destination risks, vaccines, and travel health tips",
    url: "https://wwwnc.cdc.gov/travel/page/pregnant-travelers",
  },
  {
    name: "CDC: Zika Virus and Pregnancy",
    detail: "Current Zika travel notices and pregnancy guidance",
    url: "https://www.cdc.gov/zika/pregnancy/index.html",
  },
];

async function openHandoutPdf(setOpening: (v: boolean) => void) {
  try {
    setOpening(true);
    const asset = Asset.fromModule(PDF_ASSET);
    await asset.downloadAsync();
    const sourceUri = asset.localUri ?? asset.uri;
    if (!sourceUri) throw new Error("PDF asset has no resolvable URI");
    const destUri = `${FileSystem.cacheDirectory}travel-in-pregnancy.pdf`;
    await FileSystem.copyAsync({ from: sourceUri, to: destUri });
    if (Platform.OS === "web") {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(destUri, {
          mimeType: "application/pdf",
          dialogTitle: HANDOUT_TITLE,
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
      params: { uri: destUri, title: HANDOUT_TITLE, shareTitle: HANDOUT_TITLE },
    });
  } catch {
    Alert.alert(
      "Can't open PDF",
      "Something went wrong opening the handout. Please try again.",
    );
  } finally {
    setOpening(false);
  }
}

export default function HpTravelScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [opening, setOpening] = useState(false);

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
            Healthy Pregnancy
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
            Travel in Pregnancy
          </Text>
          <Text style={[styles.pageSub, { color: colors.mutedForeground }]}>
            Based on ACOG patient guidance
          </Text>
        </Animated.View>

        <Animated.View
          entering={FadeInDown.delay(40).duration(400)}
          style={[
            styles.reassureBox,
            { backgroundColor: colors.primary + "12" },
          ]}
        >
          <Ionicons name="airplane" size={18} color={colors.primary} />
          <Text style={[styles.reassureText, { color: colors.foreground }]}>
            Most healthy pregnant women can travel safely. The key is planning
            ahead, knowing your limits, and staying in touch with your care
            team.
          </Text>
        </Animated.View>

        <Animated.View
          entering={FadeInDown.delay(70).duration(400)}
          style={[
            styles.calloutBox,
            { borderColor: "#e07b39", backgroundColor: colors.card },
          ]}
        >
          <View style={styles.calloutHeaderRow}>
            <Ionicons name="alert-circle" size={20} color="#e07b39" />
            <Text style={[styles.calloutTitle, { color: "#e07b39" }]}>
              Avoid or postpone travel if you have
            </Text>
          </View>
          {AVOID_TRAVEL.map((reason) => (
            <View key={reason} style={styles.calloutRow}>
              <Text style={[styles.calloutBullet, { color: "#e07b39" }]}>
                •
              </Text>
              <Text style={[styles.calloutText, { color: colors.foreground }]}>
                {reason}
              </Text>
            </View>
          ))}
        </Animated.View>

        <Animated.View
          entering={FadeInDown.delay(110).duration(400)}
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            What to know
          </Text>
          {HIGHLIGHTS.map((h, i) => (
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
            onPress={() => openHandoutPdf(setOpening)}
            disabled={opening}
          >
            {opening ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Ionicons
                name="document-text-outline"
                size={18}
                color={colors.primary}
              />
            )}
            <Text style={[styles.pdfBtnText, { color: colors.primary }]}>
              View Full Handout (PDF)
            </Text>
          </TouchableOpacity>
        </Animated.View>

        <Animated.View
          entering={FadeInDown.delay(150).duration(400)}
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            Trusted resources
          </Text>
          {RESOURCES.map((r) => (
            <TouchableOpacity
              key={r.name}
              style={styles.resourceItem}
              onPress={() => WebBrowser.openBrowserAsync(r.url)}
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
              <Ionicons name="open-outline" size={16} color={colors.primary} />
            </TouchableOpacity>
          ))}
        </Animated.View>

        <AskCard returnTo="/hp-travel" />
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
  backBtn: { flexDirection: "row", alignItems: "center" },
  backText: { fontSize: 16, fontFamily: "Inter_500Medium", marginLeft: 2 },
  scroll: { paddingHorizontal: 16, paddingTop: 16 },
  pageTitle: { fontSize: 26, fontFamily: "Inter_700Bold", marginBottom: 4 },
  pageSub: { fontSize: 14, fontFamily: "Inter_400Regular", marginBottom: 16 },
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
  calloutTitle: { fontSize: 15, fontFamily: "Inter_700Bold", flex: 1 },
  calloutRow: { flexDirection: "row", gap: 6, marginBottom: 4 },
  calloutBullet: { fontSize: 13, fontFamily: "Inter_700Bold", lineHeight: 19 },
  calloutText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 19,
  },
  card: { borderRadius: 18, padding: 16, marginBottom: 16, borderWidth: 1 },
  sectionTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 10,
  },
  highlightRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
  bullet: { fontSize: 14, fontFamily: "Inter_700Bold", lineHeight: 20 },
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
  pdfBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
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
  resourceLink: { textDecorationLine: "underline" },
  resourceDetail: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
});
