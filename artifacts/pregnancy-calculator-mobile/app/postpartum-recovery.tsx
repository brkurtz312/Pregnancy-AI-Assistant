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

const PDF_ASSET = require("@/assets/docs/postpartum-recovery.pdf");
const HANDOUT_TITLE = "Postpartum Recovery";

const HIGHLIGHTS = [
  "Recovery timeline: days 1–3 are the hardest (heavy bleeding, cramping, big emotional swings). Milk comes in days 3–5. Most patients feel noticeably better at 4–6 weeks, and most physical recovery is behind you by 3 months.",
  "Vaginal delivery care: ice packs to the perineum for 24–48 hours, peri-bottle after every bathroom visit, sitz baths 2–3× daily from day 2, stool softeners starting day 1. Ibuprofen 600 mg every 6 hours is safe with breastfeeding and works well for pain and cramping.",
  "Cesarean care: shower from day 2, keep the incision dry. Hold a pillow against your belly when you cough or laugh. Walk within 12 hours — it prevents blood clots and speeds recovery. No lifting heavier than your baby for 2 weeks; no driving until you can brake without pain.",
  "What's normal: heavy red bleeding days 1–3, tapering over 4–6 weeks. Afterpains when nursing (worse with each baby). Night sweats for 2–3 weeks. Hair shedding around 3–4 months that grows back.",
  "Baby blues vs. PPD: about 80% of patients get tearfulness and mood swings starting around day 3, easing by 2 weeks. If mood symptoms persist past 2 weeks, or include hopelessness, intrusive scary thoughts, or inability to sleep even when baby sleeps — that's postpartum depression, and it's very treatable. Call us.",
  "Surviving the hard weeks: sleep when the baby sleeps for at least one nap. Tag-team nights with your partner. Keep water within reach at every feeding spot. Accept every offer of food and help. Visitors who want to hold the baby should be current on Tdap, flu, and COVID vaccines.",
  "Pelvic floor: Kegels can begin as soon as comfortable — usually day 2–3 after vaginal delivery, day 5–7 after cesarean. Walking is the ideal exercise for weeks 1–6. Wait for your 6-week visit before running, lifting weights, or high-impact exercise.",
  "Postpartum visits: ACOG recommends an early check-in within 3 weeks (often by phone or video) plus a comprehensive visit no later than 12 weeks. You don't have to wait until six weeks if something feels wrong.",
];

const CALL_ER = [
  "Heavy bleeding — soaking through a pad in less than an hour, or clots larger than a golf ball",
  "Fever above 100.4°F (38°C)",
  "Severe headache that doesn't improve with fluids and acetaminophen, or vision changes",
  "Chest pain, shortness of breath, or leg swelling, redness, or pain — possible blood clot",
  "Redness, warmth, drainage, or opening of your cesarean or perineal incision",
  "A red, warm, painful area of the breast with flu-like symptoms — possible mastitis",
  "Painful or burning urination, or inability to urinate",
  "Thoughts of harming yourself or the baby, or feeling that you cannot go on",
];

const RESOURCES = [
  {
    name: "ACOG Explains: Postpartum Recovery",
    detail: "Video guide to the first weeks after delivery",
    url: "https://www.acog.org/womens-health/videos/postpartum-recovery",
  },
  {
    name: "ACOG — Optimizing Postpartum Care",
    detail: 'The full "fourth trimester" framework for clinicians and patients',
    url: "https://www.acog.org/clinical/clinical-guidance/committee-opinion/articles/2018/05/optimizing-postpartum-care",
  },
  {
    name: "ACOG — Recovery After Cesarean Birth",
    detail: "Patient FAQ on cesarean healing, incision care, and activity",
    url: "https://www.acog.org/womens-health/faqs/cesarean-birth",
  },
  {
    name: "Postpartum Support International",
    detail: "Free 24/7 helpline: 1-800-944-4773 · postpartum.net",
    url: "https://www.postpartum.net",
  },
  {
    name: "988 Suicide & Crisis Lifeline",
    detail: "Call or text 988 anytime for immediate mental-health support",
    url: "https://988lifeline.org",
  },
];

async function openHandoutPdf(setOpening: (v: boolean) => void) {
  try {
    setOpening(true);
    const asset = Asset.fromModule(PDF_ASSET);
    await asset.downloadAsync();
    const sourceUri = asset.localUri ?? asset.uri;
    if (!sourceUri) throw new Error("PDF asset has no resolvable URI");
    const destUri = `${FileSystem.cacheDirectory}postpartum-recovery.pdf`;
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

export default function PostpartumRecoveryScreen() {
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
            Postpartum
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
            Postpartum Recovery
          </Text>
          <Text style={[styles.pageSub, { color: colors.mutedForeground }]}>
            Week by week — what to expect and how to get through the hard part
          </Text>
        </Animated.View>

        <Animated.View
          entering={FadeInDown.delay(40).duration(400)}
          style={[
            styles.reassureBox,
            { backgroundColor: colors.primary + "12" },
          ]}
        >
          <Ionicons name="sunny-outline" size={18} color={colors.primary} />
          <Text style={[styles.reassureText, { color: colors.foreground }]}>
            It gets better. Almost every patient tells us the first two weeks
            were the hardest and things improved noticeably around 4–6 weeks. By
            3 months, most of the physical recovery is behind you. You are not
            going to feel this way forever.
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
            <Ionicons name="call" size={20} color="#c0392b" />
            <Text style={[styles.calloutTitle, { color: "#c0392b" }]}>
              Call us right away (or go to the ER) for any of these
            </Text>
          </View>
          {CALL_ER.map((item) => (
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

        <AskCard returnTo="/postpartum-recovery" />
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
  pageSub: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    marginBottom: 16,
    lineHeight: 20,
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
