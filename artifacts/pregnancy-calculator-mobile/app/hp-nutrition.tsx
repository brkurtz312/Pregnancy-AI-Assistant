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

const PDF_ASSET = require("@/assets/docs/nutrition-weight-gain.pdf");
const HANDOUT_TITLE = "Nutrition and Weight Gain During Pregnancy";

const HIGHLIGHTS = [
  "Recommended weight gain depends on your pre-pregnancy BMI: underweight (<18.5) → 28–40 lb; normal (18.5–24.9) → 25–35 lb; overweight (25–29.9) → 15–25 lb; obese (≥30) → 11–20 lb.",
  "Take a daily prenatal vitamin with at least 400–800 mcg of folic acid to reduce the risk of neural tube defects. Ideally begin before conception.",
  "Iron needs increase during pregnancy (27 mg/day). Eat iron-rich foods (lean meats, beans, fortified cereals) and pair them with vitamin C to boost absorption.",
  "Calcium (1,000 mg/day) supports your baby's bone development. Dairy, leafy greens, and fortified plant milks are good sources.",
  "DHA (an omega-3 fatty acid) supports fetal brain and eye development. Aim for 200–300 mg/day from low-mercury fish (salmon, sardines) or a supplement.",
  "You need only about 340 extra calories per day in the second trimester and 450 in the third — focus on quality, not just quantity.",
  "Drink plenty of water (8–10 cups per day). Dehydration can trigger contractions and fatigue.",
];

const AVOID_FOODS = [
  "Raw or undercooked meat, fish, or eggs (listeria and salmonella risk)",
  "High-mercury fish: shark, swordfish, king mackerel, tilefish, bigeye tuna",
  "Unpasteurized dairy products and juices (listeria risk)",
  "Deli meats and hot dogs unless heated until steaming (listeria risk)",
  "More than 200 mg of caffeine per day (roughly one 12-oz cup of coffee)",
];

const RESOURCES = [
  {
    name: "ACOG: Nutrition During Pregnancy",
    detail: "Evidence-based guidance on eating well during pregnancy",
    url: "https://www.acog.org/womens-health/faqs/nutrition-during-pregnancy",
  },
  {
    name: "USDA MyPlate: Pregnant & Breastfeeding",
    detail: "Personalized food plan and portion guidance for pregnancy",
    url: "https://www.myplate.gov/life-stages/pregnancy-and-breastfeeding",
  },
  {
    name: "FDA: Eating Fish During Pregnancy",
    detail: "Safe fish choices and mercury guidance from the FDA",
    url: "https://www.fda.gov/food/consumers/advice-about-eating-fish",
  },
];

async function openHandoutPdf(setOpening: (v: boolean) => void) {
  try {
    setOpening(true);
    const asset = Asset.fromModule(PDF_ASSET);
    await asset.downloadAsync();
    const sourceUri = asset.localUri ?? asset.uri;
    if (!sourceUri) throw new Error("PDF asset has no resolvable URI");
    const destUri = `${FileSystem.cacheDirectory}nutrition-weight-gain.pdf`;
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

export default function HpNutritionScreen() {
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
            Nutrition & Weight Gain
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
          <Ionicons name="nutrition" size={18} color={colors.primary} />
          <Text style={[styles.reassureText, { color: colors.foreground }]}>
            Good nutrition during pregnancy supports your baby&apos;s growth and
            your own health. It&apos;s about eating well, not just eating more.
          </Text>
        </Animated.View>

        <Animated.View
          entering={FadeInDown.delay(70).duration(400)}
          style={[
            styles.calloutBox,
            { borderColor: "#c0392b", backgroundColor: colors.card },
          ]}
        >
          <View style={styles.calloutHeaderRow}>
            <Ionicons name="close-circle" size={20} color="#c0392b" />
            <Text style={[styles.calloutTitle, { color: "#c0392b" }]}>
              Foods to avoid during pregnancy
            </Text>
          </View>
          {AVOID_FOODS.map((item) => (
            <View key={item} style={styles.calloutRow}>
              <Text style={[styles.calloutBullet, { color: "#c0392b" }]}>
                •
              </Text>
              <Text style={[styles.calloutText, { color: colors.foreground }]}>
                {item}
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

        <AskCard returnTo="/hp-nutrition" />
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
