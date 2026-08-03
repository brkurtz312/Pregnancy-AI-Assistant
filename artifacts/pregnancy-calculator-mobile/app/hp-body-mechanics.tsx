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

const PDF_ASSET = require("@/assets/docs/body-mechanics-pregnancy.pdf");
const HANDOUT_TITLE = "Body Mechanics in Pregnancy";

const HIGHLIGHTS = [
  "About two-thirds of pregnant patients develop low-back pain, and 1 in 5 develop pelvic-girdle pain. Most of this is preventable with small adjustments in how you move.",
  "When lifting: bend at your knees and hips (never the waist), hold objects close to your body, and avoid twisting. Turn your feet, not your torso.",
  "Set weight limits: aim to keep single lifts under 20 lbs after 20 weeks, and under 13 lbs in the last month for repeated lifting. Ask for help with anything heavier or awkward.",
  "For prolonged standing: rest one foot on a low stool and alternate, wear supportive low-heeled shoes, and consider a maternity support belt for pelvic-girdle pain.",
  "At a desk or in the car: sit all the way back with lumbar support, keep feet flat on the floor, and get up to walk and stretch every 30–60 minutes.",
  "From about 20 weeks, sleep on your side with a pillow between your knees. To get up, roll onto your side first, drop your legs, then push up with your arms.",
  "Gentle daily exercises that help: pelvic tilts, Kegel exercises, wall squats, hip flexor stretches, walking, and swimming (especially good for pelvic-girdle pain).",
];

const CALL_PROVIDER = [
  "Sudden severe back pain, especially with bleeding or contractions",
  "Pain that shoots down both legs, or causes weakness or numbness",
  "Loss of bladder or bowel control, or numbness in the groin/inner thighs",
  "Back pain with fever, chills, or painful urination — possible kidney infection",
  "A fall, car accident, or direct blow to the belly — even if you feel fine",
  "Regular painful contractions or fluid leaking from the vagina",
];

const RESOURCES = [
  {
    name: "ACOG: Back Pain During Pregnancy",
    detail: "Patient FAQ with prevention tips and exercises",
    url: "https://www.acog.org/womens-health/faqs/back-pain-during-pregnancy",
  },
  {
    name: "ACOG: Exercise During Pregnancy",
    detail: "Guidelines for safe exercise and body mechanics",
    url: "https://www.acog.org/womens-health/faqs/exercise-during-pregnancy",
  },
  {
    name: "About Physical Job Demands and Reproductive Health",
    detail: "Federal guidance on recommended weight limits by trimester",
    url: "https://www.cdc.gov/niosh/reproductive-health/prevention/physical-demands.html",
  },
  {
    name: "EEOC: Pregnant Workers Fairness Act (PWFA)",
    detail: "Your legal right to reasonable workplace accommodations",
    url: "https://www.eeoc.gov/pregnant-workers-fairness-act",
  },
];

async function openHandoutPdf(setOpening: (v: boolean) => void) {
  try {
    setOpening(true);
    const asset = Asset.fromModule(PDF_ASSET);
    await asset.downloadAsync();
    const sourceUri = asset.localUri ?? asset.uri;
    if (!sourceUri) throw new Error("PDF asset has no resolvable URI");
    const destUri = `${FileSystem.cacheDirectory}body-mechanics-pregnancy.pdf`;
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

export default function HpBodyMechanicsScreen() {
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
            Body Mechanics
          </Text>
          <Text style={[styles.pageSub, { color: colors.mutedForeground }]}>
            How to lift, sit, sleep, and move safely as your body changes
          </Text>
        </Animated.View>

        <Animated.View
          entering={FadeInDown.delay(40).duration(400)}
          style={[
            styles.reassureBox,
            { backgroundColor: colors.primary + "12" },
          ]}
        >
          <Ionicons name="body" size={18} color={colors.primary} />
          <Text style={[styles.reassureText, { color: colors.foreground }]}>
            Most pregnancy back and pelvic pain is preventable. Small changes in
            how you lift, sit, and sleep each day make a real difference.
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
              Call your provider right away if you have
            </Text>
          </View>
          {CALL_PROVIDER.map((item) => (
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

        <AskCard returnTo="/hp-body-mechanics" />
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
