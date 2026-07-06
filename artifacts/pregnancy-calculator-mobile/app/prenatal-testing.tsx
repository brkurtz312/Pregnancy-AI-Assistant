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
import {
  TIMELINE,
  FAQS,
  VISIT_QUESTIONS,
} from "@/lib/prenatal-testing-content";

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

        <Animated.View
          entering={FadeInDown.delay(420).duration(400)}
          style={[
            styles.card,
            styles.askCard,
            { backgroundColor: colors.card, borderColor: colors.primary },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            Have a specific question about your testing?
          </Text>
          <Text
            style={[
              styles.body,
              { color: colors.mutedForeground, marginBottom: 14 },
            ]}
          >
            Our AI assistant can answer questions about your own prenatal
            testing timeline and results.
          </Text>
          <TouchableOpacity
            style={[styles.askBtn, { backgroundColor: colors.primary }]}
            onPress={() =>
              router.push({
                pathname: "/ask",
                params: { returnTo: "/prenatal-testing" },
              })
            }
          >
            <Ionicons name="chatbubble-ellipses" size={18} color="#fff" />
            <Text style={styles.askBtnText}>Ask a Question</Text>
          </TouchableOpacity>
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
