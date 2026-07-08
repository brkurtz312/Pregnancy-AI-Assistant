import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import React, { useState } from "react";
import {
  Alert,
  Modal,
  Platform,
  Pressable,
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
import {
  TEST_CATEGORIES,
  FAQS,
  VISIT_QUESTIONS,
  type TestDetail,
  type HepBTest,
} from "@/lib/prenatal-testing-content";

const PDF_ASSET = require("@/assets/docs/routine-prenatal-tests.pdf");

function isHepBTest(test: TestDetail | HepBTest): test is HepBTest {
  return "subParts" in test;
}

async function openPdfSummary() {
  try {
    const asset = Asset.fromModule(PDF_ASSET);
    await asset.downloadAsync();
    const sourceUri = asset.localUri ?? asset.uri;
    if (!sourceUri) {
      throw new Error("PDF asset has no resolvable URI");
    }
    const destUri = `${FileSystem.cacheDirectory}routine-prenatal-tests.pdf`;
    await FileSystem.copyAsync({ from: sourceUri, to: destUri });
    if (Platform.OS === "web") {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(destUri, {
          mimeType: "application/pdf",
          dialogTitle: "Routine Prenatal Tests & Procedures",
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
        title: "Routine Prenatal Tests & Procedures",
        shareTitle: "Routine Prenatal Tests & Procedures",
      },
    });
  } catch {
    Alert.alert(
      "Can't open PDF",
      "Something went wrong opening the PDF summary. Please try again.",
    );
  }
}

function TestDetailBlock({
  test,
  colors,
}: {
  test: TestDetail;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View>
      <Text style={[styles.detailLabel, { color: colors.primary }]}>
        WHY IT'S DONE
      </Text>
      <Text style={[styles.detailBody, { color: colors.foreground }]}>
        {test.why}
      </Text>
      <Text
        style={[styles.detailLabel, { color: colors.primary, marginTop: 14 }]}
      >
        WHEN
      </Text>
      <Text style={[styles.detailBody, { color: colors.foreground }]}>
        {test.when}
      </Text>
      <Text
        style={[styles.detailLabel, { color: colors.primary, marginTop: 14 }]}
      >
        WHAT IF IT'S ABNORMAL
      </Text>
      <Text style={[styles.detailBody, { color: colors.foreground }]}>
        {test.whatIfAbnormal}
      </Text>
    </View>
  );
}

export default function PrenatalTestingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [selectedTest, setSelectedTest] = useState<
    TestDetail | HepBTest | null
  >(null);

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
            Prenatal Care
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
            Understanding Prenatal Testing
          </Text>
          <Text style={[styles.pageSub, { color: colors.mutedForeground }]}>
            What to expect during pregnancy and why these tests matter
          </Text>
        </Animated.View>

        <Animated.View
          entering={FadeInDown.delay(40).duration(400)}
          style={[styles.tipBanner, { backgroundColor: colors.primary + "18" }]}
        >
          <Ionicons
            name="information-circle"
            size={20}
            color={colors.primary}
          />
          <Text style={[styles.tipBannerText, { color: colors.foreground }]}>
            Tap on each test below for more information — why it's done, when
            it's done, and what happens if the result is abnormal.
          </Text>
        </Animated.View>

        <Animated.View
          entering={FadeInDown.delay(80).duration(400)}
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.body, { color: colors.foreground }]}>
            Prenatal testing helps your care team watch over both you and your
            baby throughout pregnancy. Some tests are routine for most
            pregnancies, while others are offered as options or recommended only
            when there are special risks, symptoms, or earlier results that need
            a closer look.
          </Text>
          <View
            style={[styles.noteBox, { backgroundColor: colors.primary + "18" }]}
          >
            <Text style={[styles.noteText, { color: colors.foreground }]}>
              Important: This page describes common prenatal testing during
              pregnancy, but care should always be individualized. The exact
              timing or need for testing may differ based on each patient's
              history, symptoms, and clinical findings.
            </Text>
          </View>
        </Animated.View>

        {TEST_CATEGORIES.map((category, categoryIndex) => (
          <Animated.View
            key={category.id}
            entering={FadeInDown.delay(120 + categoryIndex * 40).duration(400)}
            style={[
              styles.card,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              {category.title}
            </Text>
            {category.tests.map((test, i) => (
              <View key={test.id}>
                <TouchableOpacity
                  style={[
                    styles.testRow,
                    i < category.tests.length - 1 && {
                      borderBottomWidth: 1,
                      borderBottomColor: colors.border,
                    },
                  ]}
                  onPress={() => setSelectedTest(test)}
                  activeOpacity={0.6}
                >
                  <View
                    style={[
                      styles.testDot,
                      { backgroundColor: colors.primary },
                    ]}
                  />
                  <Text style={[styles.testName, { color: colors.primary }]}>
                    {test.name}
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={colors.mutedForeground}
                  />
                </TouchableOpacity>
                {isHepBTest(test) && (
                  <View style={styles.subPartRow}>
                    {test.subParts.map((sub) => (
                      <TouchableOpacity
                        key={sub.id}
                        style={[
                          styles.subPartChip,
                          {
                            backgroundColor: colors.primary + "14",
                            borderColor: colors.primary + "40",
                          },
                        ]}
                        onPress={() => setSelectedTest(sub)}
                        activeOpacity={0.6}
                      >
                        <Text
                          style={[
                            styles.subPartChipText,
                            { color: colors.primary },
                          ]}
                        >
                          {sub.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            ))}
          </Animated.View>
        ))}

        <Animated.View
          entering={FadeInDown.delay(240).duration(400)}
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            Questions patients often ask
          </Text>
          {FAQS.map((item, i) => (
            <View
              key={item.q}
              style={[
                styles.faqRow,
                i < FAQS.length - 1 && {
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border,
                },
              ]}
            >
              <Text style={[styles.faqQ, { color: colors.foreground }]}>
                {item.q}
              </Text>
              <Text style={[styles.faqA, { color: colors.mutedForeground }]}>
                {item.a}
              </Text>
            </View>
          ))}
        </Animated.View>

        <Animated.View
          entering={FadeInDown.delay(280).duration(400)}
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            Questions to ask at your next visit
          </Text>
          {VISIT_QUESTIONS.map((q) => (
            <View key={q} style={styles.bulletRow}>
              <View
                style={[styles.bulletDot, { backgroundColor: colors.primary }]}
              />
              <Text style={[styles.bulletText, { color: colors.foreground }]}>
                {q}
              </Text>
            </View>
          ))}
        </Animated.View>

        <AskCard returnTo="/prenatal-testing" />

        <Animated.View
          entering={FadeInDown.delay(360).duration(400)}
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            Want the full picture?
          </Text>
          <Text
            style={[
              styles.body,
              { color: colors.mutedForeground, marginBottom: 14 },
            ]}
          >
            If you'd like to see the complete PDF summary this page is based on,
            you can view or save it here.
          </Text>
          <TouchableOpacity
            style={[
              styles.pdfBtn,
              { borderColor: colors.primary, backgroundColor: colors.card },
            ]}
            onPress={openPdfSummary}
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
      </ScrollView>

      <Modal
        visible={!!selectedTest}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedTest(null)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setSelectedTest(null)}
        >
          <Pressable
            style={[
              styles.modalSheet,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>
                  {selectedTest?.name}
                </Text>
                <TouchableOpacity
                  onPress={() => setSelectedTest(null)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons
                    name="close"
                    size={22}
                    color={colors.mutedForeground}
                  />
                </TouchableOpacity>
              </View>
              {selectedTest && (
                <>
                  <TestDetailBlock test={selectedTest} colors={colors} />
                  {isHepBTest(selectedTest) && (
                    <View style={styles.subPartsSection}>
                      <Text
                        style={[
                          styles.subPartsHeading,
                          { color: colors.foreground },
                        ]}
                      >
                        The three parts of this panel
                      </Text>
                      {selectedTest.subParts.map((sub) => (
                        <TouchableOpacity
                          key={sub.id}
                          style={[
                            styles.subPartDetailRow,
                            {
                              backgroundColor: colors.primary + "10",
                              borderColor: colors.border,
                            },
                          ]}
                          onPress={() => setSelectedTest(sub)}
                          activeOpacity={0.6}
                        >
                          <Text
                            style={[
                              styles.subPartDetailName,
                              { color: colors.primary },
                            ]}
                          >
                            {sub.name}
                          </Text>
                          <Ionicons
                            name="chevron-forward"
                            size={16}
                            color={colors.mutedForeground}
                          />
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    borderBottomWidth: 1,
    paddingBottom: 12,
    paddingHorizontal: 16,
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  backText: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
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
  tipBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
  },
  tipBannerText: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    lineHeight: 20,
  },
  card: {
    borderRadius: 18,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
  },
  askCard: {
    borderWidth: 1.5,
  },
  askBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 12,
    paddingVertical: 14,
  },
  askBtnText: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  pdfBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 12,
    paddingVertical: 14,
    borderWidth: 1.5,
  },
  pdfBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  sectionTitle: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 12,
  },
  body: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 21,
  },
  noteBox: {
    borderRadius: 12,
    padding: 12,
    marginTop: 14,
  },
  noteText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    lineHeight: 19,
  },
  testRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 13,
  },
  testDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  testName: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    textDecorationLine: "underline",
  },
  subPartRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingBottom: 12,
    paddingLeft: 16,
  },
  subPartChip: {
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderWidth: 1,
  },
  subPartChipText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  faqRow: {
    paddingVertical: 12,
  },
  faqQ: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 4,
  },
  faqA: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 19,
  },
  bulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 10,
  },
  bulletDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 7,
  },
  bulletText: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    padding: 20,
  },
  modalSheet: {
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    maxHeight: "80%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 16,
  },
  modalTitle: {
    flex: 1,
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  detailLabel: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  detailBody: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 21,
  },
  subPartsSection: {
    marginTop: 20,
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.08)",
    paddingTop: 16,
  },
  subPartsHeading: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 10,
  },
  subPartDetailRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  subPartDetailName: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
});
