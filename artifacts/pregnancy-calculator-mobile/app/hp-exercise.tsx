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
import { ResponsiveContainer } from "@/components/ResponsiveContainer";

const PDF_ASSET = require("@/assets/docs/exercise-in-pregnancy.pdf");
const HANDOUT_TITLE = "Exercise During Pregnancy";

const HIGHLIGHTS = [
  "ACOG recommends at least 150 minutes of moderate-intensity aerobic activity per week for most pregnant women — the same as before pregnancy.",
  "Great options include brisk walking, swimming, stationary cycling, low-impact aerobics, and prenatal yoga or Pilates.",
  "Exercise during pregnancy reduces the risk of gestational diabetes, preeclampsia, excessive weight gain, and cesarean birth. It also improves mood, energy, and sleep.",
  "If you were not exercising before pregnancy, start slowly — begin with 10–15 minutes of moderate activity per day and gradually increase.",
  "Modify your routine as your belly grows: your center of gravity shifts, so balance exercises and high-impact moves become riskier.",
  "Stay well hydrated, avoid overheating (no hot yoga or exercising in very hot or humid weather), and wear supportive footwear.",
  "It is normal to feel short of breath more easily during pregnancy. Slow down if you cannot hold a conversation while exercising.",
];

const STOP_SIGNS = [
  "Vaginal bleeding or fluid leaking from the vagina",
  "Regular painful contractions or signs of preterm labor",
  "Dizziness, faintness, or severe headache",
  "Chest pain or difficulty breathing before exertion",
  "Calf pain or swelling (possible blood clot)",
  "Decreased fetal movement",
];

const AVOID_ACTIVITIES = [
  "Contact sports with a risk of being hit in the abdomen (hockey, soccer, basketball)",
  "Activities with a high fall risk (skiing, horseback riding, gymnastics)",
  "Scuba diving (risk of decompression sickness for the baby)",
  "Hot yoga or any exercise in extreme heat",
  "Lying flat on your back for extended periods after 20 weeks",
];

const RESOURCES = [
  {
    name: "ACOG: Exercise During Pregnancy",
    detail: "Full clinical guidance and recommendations for physical activity",
    url: "https://www.acog.org/womens-health/faqs/exercise-during-pregnancy",
  },
  {
    name: "CDC: Physical Activity During Pregnancy",
    detail: "Guidelines and benefits of staying active while pregnant",
    url: "https://www.cdc.gov/physicalactivity/basics/pregnancy/index.htm",
  },
  {
    name: "March of Dimes: Exercise During Pregnancy",
    detail: "Safe exercise ideas and tips for each trimester",
    url: "https://www.marchofdimes.org/find-support/topics/pregnancy/exercise-during-pregnancy",
  },
];

async function openHandoutPdf(setOpening: (v: boolean) => void) {
  try {
    setOpening(true);
    const asset = Asset.fromModule(PDF_ASSET);
    await asset.downloadAsync();
    const sourceUri = asset.localUri ?? asset.uri;
    if (!sourceUri) throw new Error("PDF asset has no resolvable URI");
    const destUri = `${FileSystem.cacheDirectory}exercise-in-pregnancy.pdf`;
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

export default function HpExerciseScreen() {
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
        <ResponsiveContainer style={{ paddingHorizontal: 16 }}>
          <Animated.View entering={FadeInDown.duration(400)}>
            <Text style={[styles.pageTitle, { color: colors.foreground }]}>
              Exercise in Pregnancy
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
            <Ionicons name="walk" size={18} color={colors.primary} />
            <Text style={[styles.reassureText, { color: colors.foreground }]}>
              Staying active during pregnancy is one of the best things you can
              do for yourself and your baby. Most healthy pregnant women can and
              should exercise.
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
              <Ionicons name="stop-circle" size={20} color="#c0392b" />
              <Text style={[styles.calloutTitle, { color: "#c0392b" }]}>
                Stop exercising and call your provider if you experience
              </Text>
            </View>
            {STOP_SIGNS.map((sign) => (
              <View key={sign} style={styles.calloutRow}>
                <Text style={[styles.calloutBullet, { color: "#c0392b" }]}>
                  •
                </Text>
                <Text
                  style={[styles.calloutText, { color: colors.foreground }]}
                >
                  {sign}
                </Text>
              </View>
            ))}
          </Animated.View>

          <Animated.View
            entering={FadeInDown.delay(90).duration(400)}
            style={[
              styles.calloutBox,
              { borderColor: "#e07b39", backgroundColor: colors.card },
            ]}
          >
            <View style={styles.calloutHeaderRow}>
              <Ionicons name="alert-circle" size={20} color="#e07b39" />
              <Text style={[styles.calloutTitle, { color: "#e07b39" }]}>
                Activities to avoid during pregnancy
              </Text>
            </View>
            {AVOID_ACTIVITIES.map((activity) => (
              <View key={activity} style={styles.calloutRow}>
                <Text style={[styles.calloutBullet, { color: "#e07b39" }]}>
                  •
                </Text>
                <Text
                  style={[styles.calloutText, { color: colors.foreground }]}
                >
                  {activity}
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
                <Ionicons
                  name="open-outline"
                  size={16}
                  color={colors.primary}
                />
              </TouchableOpacity>
            ))}
          </Animated.View>

          <AskCard returnTo="/hp-exercise" />
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
  backBtn: { flexDirection: "row", alignItems: "center" },
  backText: { fontSize: 16, fontFamily: "Inter_500Medium", marginLeft: 2 },
  scroll: { paddingTop: 16 },
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
