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

const PDF_ASSET = require("@/assets/docs/medications-alcohol-substances.pdf");
const HANDOUT_TITLE = "Medications, Alcohol, and Substances in Pregnancy";

const HIGHLIGHTS = [
  "Always check with your provider or pharmacist before taking any medication — including over-the-counter drugs, herbal supplements, and vitamins — during pregnancy.",
  "Acetaminophen (Tylenol) is generally considered the safest OTC pain reliever during pregnancy. NSAIDs (ibuprofen, naproxen) are not recommended, especially after 20 weeks.",
  "Some prescription medications are essential and must be continued during pregnancy. Stopping them abruptly can be more dangerous than the medication itself — never stop without talking to your provider.",
  "There is no known safe amount of alcohol during pregnancy. Alcohol can cause fetal alcohol spectrum disorders (FASDs), growth problems, and brain damage at any stage.",
  "Marijuana (cannabis) — even medical marijuana — is not safe during pregnancy. It is linked to low birth weight, preterm birth, and developmental problems. Do not use it in any form.",
  "Smoking cigarettes or using tobacco products during pregnancy increases the risk of preterm birth, low birth weight, placental problems, and SIDS.",
  "If you use opioids — whether prescribed or otherwise — your care team needs to know. There are safe, effective treatment options (like medication-assisted treatment) that protect you and your baby.",
];

const AVOID_COMPLETELY = [
  "Alcohol — no safe amount at any stage of pregnancy",
  "Marijuana, cannabis, or CBD products",
  "Tobacco and e-cigarettes / vaping",
  "Cocaine, methamphetamine, heroin, and other illicit drugs",
  "Unprescribed opioids or misuse of prescription opioids",
  "High-dose supplements not recommended by your provider",
];

const RESOURCES = [
  {
    name: "ACOG: Substance Use During Pregnancy",
    detail: "Medical guidance on alcohol, drugs, and substance use",
    url: "https://www.acog.org/womens-health/faqs/alcohol-and-women",
  },
  {
    name: "CDC: Alcohol Use in Pregnancy",
    detail: "Why there is no safe level of alcohol during pregnancy",
    url: "https://www.cdc.gov/ncbddd/fasd/alcohol-use.html",
  },
  {
    name: "SAMHSA Helpline",
    detail: "Free, confidential treatment referral and information: 1-800-662-4357",
    url: "https://www.samhsa.gov/find-help/national-helpline",
  },
  {
    name: "LactMed: Drug & Lactation Database",
    detail: "Information on medications and breastfeeding safety (NLM)",
    url: "https://www.ncbi.nlm.nih.gov/books/NBK501922/",
  },
];

async function openHandoutPdf(setOpening: (v: boolean) => void) {
  try {
    setOpening(true);
    const asset = Asset.fromModule(PDF_ASSET);
    await asset.downloadAsync();
    const sourceUri = asset.localUri ?? asset.uri;
    if (!sourceUri) throw new Error("PDF asset has no resolvable URI");
    const destUri = `${FileSystem.cacheDirectory}medications-alcohol-substances.pdf`;
    await FileSystem.copyAsync({ from: sourceUri, to: destUri });
    if (Platform.OS === "web") {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(destUri, {
          mimeType: "application/pdf",
          dialogTitle: HANDOUT_TITLE,
          UTI: "com.adobe.pdf",
        });
      } else {
        Alert.alert("Can't open PDF", "Viewing files isn't available on this device.");
      }
      return;
    }
    router.push({
      pathname: "/pdf-viewer",
      params: { uri: destUri, title: HANDOUT_TITLE, shareTitle: HANDOUT_TITLE },
    });
  } catch {
    Alert.alert("Can't open PDF", "Something went wrong opening the handout. Please try again.");
  } finally {
    setOpening(false);
  }
}

export default function HpMedicationsScreen() {
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
            Medications & Substances
          </Text>
          <Text style={[styles.pageSub, { color: colors.mutedForeground }]}>
            Based on ACOG patient guidance
          </Text>
        </Animated.View>

        <Animated.View
          entering={FadeInDown.delay(40).duration(400)}
          style={[styles.reassureBox, { backgroundColor: colors.primary + "12" }]}
        >
          <Ionicons name="flask" size={18} color={colors.primary} />
          <Text style={[styles.reassureText, { color: colors.foreground }]}>
            Many medications are safe during pregnancy, but some are not. When in
            doubt, always ask your provider before taking anything — even
            vitamins or herbal products.
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
              Avoid completely during pregnancy
            </Text>
          </View>
          {AVOID_COMPLETELY.map((item) => (
            <View key={item} style={styles.calloutRow}>
              <Text style={[styles.calloutBullet, { color: "#c0392b" }]}>•</Text>
              <Text style={[styles.calloutText, { color: colors.foreground }]}>
                {item}
              </Text>
            </View>
          ))}
        </Animated.View>

        <Animated.View
          entering={FadeInDown.delay(110).duration(400)}
          style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            What to know
          </Text>
          {HIGHLIGHTS.map((h, i) => (
            <View key={i} style={styles.highlightRow}>
              <Text style={[styles.bullet, { color: colors.primary }]}>•</Text>
              <Text style={[styles.highlightText, { color: colors.mutedForeground }]}>
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
              <Ionicons name="document-text-outline" size={18} color={colors.primary} />
            )}
            <Text style={[styles.pdfBtnText, { color: colors.primary }]}>
              View Full Handout (PDF)
            </Text>
          </TouchableOpacity>
        </Animated.View>

        <Animated.View
          entering={FadeInDown.delay(150).duration(400)}
          style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
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
                <Text style={[styles.resourceName, styles.resourceLink, { color: colors.primary }]}>
                  {r.name}
                </Text>
                <Text style={[styles.resourceDetail, { color: colors.mutedForeground }]}>
                  {r.detail}
                </Text>
              </View>
              <Ionicons name="open-outline" size={16} color={colors.primary} />
            </TouchableOpacity>
          ))}
        </Animated.View>

        <AskCard returnTo="/hp-medications" />
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
  reassureText: { flex: 1, fontSize: 13.5, fontFamily: "Inter_500Medium", lineHeight: 19 },
  calloutBox: { borderRadius: 16, padding: 14, borderWidth: 1.5, marginBottom: 16 },
  calloutHeaderRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  calloutTitle: { fontSize: 15, fontFamily: "Inter_700Bold", flex: 1 },
  calloutRow: { flexDirection: "row", gap: 6, marginBottom: 4 },
  calloutBullet: { fontSize: 13, fontFamily: "Inter_700Bold", lineHeight: 19 },
  calloutText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  card: { borderRadius: 18, padding: 16, marginBottom: 16, borderWidth: 1 },
  sectionTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", marginBottom: 10 },
  highlightRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
  bullet: { fontSize: 14, fontFamily: "Inter_700Bold", lineHeight: 20 },
  highlightText: { flex: 1, fontSize: 13.5, fontFamily: "Inter_400Regular", lineHeight: 20 },
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
  resourceItem: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  resourceName: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginBottom: 2 },
  resourceLink: { textDecorationLine: "underline" },
  resourceDetail: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
});
