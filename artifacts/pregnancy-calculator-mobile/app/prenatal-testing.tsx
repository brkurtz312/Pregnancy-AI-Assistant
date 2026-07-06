import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

type Test = {
  time: string;
  tests: string;
  why: string;
};

const TIMELINE: Test[] = [
  {
    time: "Before 8 weeks",
    tests: "Pregnancy confirmation, dating ultrasound when needed",
    why: "Confirms viability and helps establish the due date so later testing can be timed correctly.",
  },
  {
    time: "8–12 weeks",
    tests:
      "CBC, blood type/Rh, antibody screen, HIV, hepatitis B, hepatitis C, syphilis, rubella, varicella, urine culture, gonorrhea/chlamydia",
    why: "Looks for anemia, infection, immunity, and blood factors that may affect the pregnancy or baby.",
  },
  {
    time: "9+ weeks",
    tests: "Cell-free DNA screening, if desired and appropriate",
    why: "Screens for common chromosomal conditions such as trisomy 21, 18, and 13.",
  },
  {
    time: "Early pregnancy",
    tests: "Carrier screening, if not previously done",
    why: "Checks whether a parent carries certain inherited conditions.",
  },
  {
    time: "20–22 weeks",
    tests: "Anatomy ultrasound",
    why: "Evaluates fetal anatomy, growth, and placental location.",
  },
  {
    time: "24–28 weeks",
    tests: "Gestational diabetes screening",
    why: "Looks for diabetes that develops during pregnancy.",
  },
  {
    time: "Around 28 weeks",
    tests:
      "Repeat CBC, HIV, syphilis; repeat type and screen with RhoGAM if Rh negative",
    why: "Rechecks for anemia and infection and helps prevent Rh sensitization in Rh-negative patients.",
  },
  {
    time: "27–36 weeks",
    tests: "Tdap vaccine",
    why: "Helps protect the newborn from pertussis after birth.",
  },
  {
    time: "32–36 weeks",
    tests: "RSV vaccine in appropriate seasonal circumstances",
    why: "Helps reduce the baby's risk of serious RSV illness after birth.",
  },
  {
    time: "36–37 weeks",
    tests: "Group B strep testing",
    why: "Identifies who should receive antibiotics during labor to help protect the newborn.",
  },
];

const FAQS: { q: string; a: string }[] = [
  {
    q: "Why are so many blood tests done early?",
    a: "Many important conditions in pregnancy do not cause symptoms at first. Early testing helps identify problems while there is time to treat them or plan care safely.",
  },
  {
    q: "Are all genetic tests required?",
    a: "No. Some genetic tests are optional, and patients can decide how much information they want. Screening and diagnostic testing each have benefits, limits, and different purposes.",
  },
  {
    q: "Will I need more testing than this?",
    a: "Possibly. Some pregnancies need extra monitoring, while others follow the routine schedule. Your care team can explain which tests apply to your pregnancy and why.",
  },
];

const VISIT_QUESTIONS = [
  "Which tests are routine for my pregnancy?",
  "Are any optional genetic tests right for me?",
  "Will I need any extra monitoring later in pregnancy?",
  "What should I expect during my next ultrasound or lab visit?",
  "Are there vaccines I should receive during this pregnancy?",
];

export default function PrenatalTestingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

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
            Visit Prep
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
          entering={FadeInDown.delay(60).duration(400)}
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
          <Text
            style={[styles.body, { color: colors.foreground, marginTop: 10 }]}
          >
            Every pregnancy is different, so your schedule may vary based on
            your medical history, how far along you are when prenatal care
            begins, whether you are carrying more than one baby, or what
            previous test results show.
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

        <Animated.View
          entering={FadeInDown.delay(120).duration(400)}
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            Prenatal testing at a glance
          </Text>
          {TIMELINE.map((row, i) => (
            <View
              key={row.time}
              style={[
                styles.timelineRow,
                i < TIMELINE.length - 1 && {
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border,
                },
              ]}
            >
              <Text style={[styles.timelineTime, { color: colors.primary }]}>
                {row.time}
              </Text>
              <Text
                style={[styles.timelineTests, { color: colors.foreground }]}
              >
                {row.tests}
              </Text>
              <Text
                style={[styles.timelineWhy, { color: colors.mutedForeground }]}
              >
                {row.why}
              </Text>
            </View>
          ))}
        </Animated.View>

        <Animated.View
          entering={FadeInDown.delay(180).duration(400)}
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            When extra testing is needed
          </Text>
          <Text style={[styles.body, { color: colors.foreground }]}>
            Not every pregnancy follows the exact same testing path. Some
            patients need added monitoring because of high blood pressure,
            diabetes, twins, fetal growth concerns, abnormal earlier tests,
            decreased fetal movement, or other maternal or fetal conditions.
          </Text>
          <Text
            style={[styles.body, { color: colors.foreground, marginTop: 10 }]}
          >
            Additional testing later in pregnancy may include repeat
            ultrasounds, nonstress testing, or biophysical profile testing to
            give the care team closer information about the baby's well-being.
          </Text>
        </Animated.View>

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
          entering={FadeInDown.delay(300).duration(400)}
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

        <Animated.View
          entering={FadeInDown.delay(360).duration(400)}
          style={[
            styles.card,
            {
              backgroundColor: colors.primary + "12",
              borderColor: colors.primary + "30",
            },
          ]}
        >
          <Text style={[styles.body, { color: colors.foreground }]}>
            Most prenatal testing is done to provide reassurance, catch common
            problems early, and guide safe care for pregnancy and delivery.
            These tests are one part of supporting a healthy pregnancy for both
            mother and baby.
          </Text>
        </Animated.View>
      </ScrollView>
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
    marginBottom: 20,
  },
  card: {
    borderRadius: 18,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
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
  timelineRow: {
    paddingVertical: 12,
  },
  timelineTime: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    marginBottom: 4,
  },
  timelineTests: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    lineHeight: 20,
    marginBottom: 4,
  },
  timelineWhy: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 19,
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
});
