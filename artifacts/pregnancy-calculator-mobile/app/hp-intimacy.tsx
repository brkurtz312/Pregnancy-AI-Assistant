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

const PDF_ASSET = require("@/assets/docs/intimacy-during-pregnancy.pdf");
const HANDOUT_TITLE = "Intimacy During Pregnancy";

const HIGHLIGHTS = [
  "Sex is safe during most uncomplicated pregnancies. The baby is protected by amniotic fluid and the uterus, and orgasm or penetration will not harm the baby.",
  "Changes in sexual desire are completely normal — some women feel more interested, others less. Both experiences are expected and valid.",
  "Open communication with your partner about comfort, concerns, and emotional needs is important as your body changes throughout pregnancy.",
  "Experiment with positions for comfort as your belly grows. Side-lying or woman-on-top positions often work well in the third trimester.",
  "Breast tenderness, increased vaginal discharge, and mild uterine cramping or spotting after sex are common and usually not concerning — but always report spotting to your provider.",
  "Non-penetrative intimacy (cuddling, massage, oral sex) is a safe alternative if penetrative sex becomes uncomfortable.",
  "A new sexual partner during pregnancy requires the same safer-sex practices (barrier methods) as before pregnancy — STIs pose real risks to you and the baby.",
];

const AVOID_SEX = [
  "Placenta previa (placenta covering the cervix) — risk of serious bleeding",
  "Active preterm labor or unexplained vaginal bleeding",
  "Your water (membranes) has already broken — infection risk",
  "Incompetent/short cervix with a cerclage in place",
  "A partner with an active herpes or STI outbreak",
];

const RESOURCES = [
  {
    name: "ACOG: Sex During Pregnancy",
    detail: "Evidence-based guidance on intimacy throughout pregnancy",
    url: "https://www.acog.org/womens-health/faqs/sex-during-pregnancy",
  },
  {
    name: "March of Dimes: Sex During Pregnancy",
    detail: "Practical information on intimacy and when to ask your provider",
    url: "https://www.marchofdimes.org/find-support/topics/pregnancy/sex-during-pregnancy",
  },
];

async function openHandoutPdf(setOpening: (v: boolean) => void) {
  try {
    setOpening(true);
    const asset = Asset.fromModule(PDF_ASSET);
    await asset.downloadAsync();
    const sourceUri = asset.localUri ?? asset.uri;
    if (!sourceUri) throw new Error("PDF asset has no resolvable URI");
    const destUri = `${FileSystem.cacheDirectory}intimacy-during-pregnancy.pdf`;
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

export default function HpIntimacyScreen() {
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
            Intimacy During Pregnancy
          </Text>
          <Text style={[styles.pageSub, { color: colors.mutedForeground }]}>
            Based on ACOG patient guidance
          </Text>
        </Animated.View>

        <Animated.View
          entering={FadeInDown.delay(40).duration(400)}
          style={[styles.reassureBox, { backgroundColor: colors.primary + "12" }]}
        >
          <Ionicons name="heart" size={18} color={colors.primary} />
          <Text style={[styles.reassureText, { color: colors.foreground }]}>
            For most pregnancies, sexual intimacy is safe throughout all three
            trimesters. Changes in desire and comfort are normal — talk openly
            with your partner and your care team.
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
              Avoid penetrative sex if you have
            </Text>
          </View>
          {AVOID_SEX.map((reason) => (
            <View key={reason} style={styles.calloutRow}>
              <Text style={[styles.calloutBullet, { color: "#e07b39" }]}>•</Text>
              <Text style={[styles.calloutText, { color: colors.foreground }]}>
                {reason}
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

        <AskCard returnTo="/hp-intimacy" />
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
