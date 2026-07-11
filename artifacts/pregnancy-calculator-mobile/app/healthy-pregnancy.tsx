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

const TOPICS = [
  {
    icon: "airplane-outline" as const,
    title: "Travel in Pregnancy",
    description:
      "Safety tips for air, car, and international travel at every stage.",
    route: "/hp-travel",
  },
  {
    icon: "briefcase-outline" as const,
    title: "Work & Bedrest",
    description:
      "Working safely during pregnancy and what to know about bedrest.",
    route: "/hp-work-bedrest",
  },
  {
    icon: "nutrition-outline" as const,
    title: "Nutrition & Weight Gain",
    description: "Recommended weight gain, key nutrients, and foods to avoid.",
    route: "/hp-nutrition",
  },
  {
    icon: "heart-outline" as const,
    title: "Intimacy During Pregnancy",
    description:
      "What's safe, what changes, and when to check with your provider.",
    route: "/hp-intimacy",
  },
  {
    icon: "flask-outline" as const,
    title: "Medications & Substances",
    description:
      "Safe medications, substances to avoid, and talking to your provider.",
    route: "/hp-medications",
  },
  {
    icon: "walk-outline" as const,
    title: "Exercise in Pregnancy",
    description:
      "Benefits of staying active, recommended activities, and warning signs.",
    route: "/hp-exercise",
  },
  {
    icon: "body-outline" as const,
    title: "Body Mechanics",
    description:
      "How to lift, sit, sleep, and move safely to prevent back and pelvic pain.",
    route: "/hp-body-mechanics",
  },
  {
    icon: "alert-circle-outline" as const,
    title: "Warning Signs",
    description:
      "Symptoms that always mean you should call your provider or go to the ER.",
    route: "/hp-warning-signs",
  },
];

export default function HealthyPregnancyScreen() {
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
            Learn
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
            Healthy Pregnancy
          </Text>
          <Text style={[styles.pageSub, { color: colors.mutedForeground }]}>
            Evidence-based ACOG guidance on staying well through your pregnancy.
          </Text>
        </Animated.View>

        {TOPICS.map((topic, i) => (
          <Animated.View
            key={topic.route}
            entering={FadeInDown.delay(60 + i * 60).duration(400)}
          >
            <TouchableOpacity
              style={[
                styles.card,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
              onPress={() =>
                router.push(topic.route as Parameters<typeof router.push>[0])
              }
              activeOpacity={0.8}
            >
              <View
                style={[
                  styles.cardIcon,
                  { backgroundColor: colors.primary + "18" },
                ]}
              >
                <Ionicons name={topic.icon} size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.cardTitle, { color: colors.foreground }]}>
                  {topic.title}
                </Text>
                <Text
                  style={[styles.cardDesc, { color: colors.mutedForeground }]}
                >
                  {topic.description}
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={18}
                color={colors.mutedForeground}
              />
            </TouchableOpacity>
          </Animated.View>
        ))}

        <Animated.View
          entering={FadeInDown.delay(440).duration(400)}
          style={[styles.noteBox, { backgroundColor: colors.primary + "10" }]}
        >
          <Ionicons
            name="information-circle-outline"
            size={16}
            color={colors.primary}
          />
          <Text style={[styles.noteText, { color: colors.mutedForeground }]}>
            All content is based on ACOG patient education materials. Always
            discuss your individual situation with your care provider.
          </Text>
        </Animated.View>
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
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
  },
  backText: {
    fontSize: 16,
    fontFamily: "Inter_500Medium",
    marginLeft: 2,
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
    lineHeight: 20,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
  },
  cardIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 2,
  },
  cardDesc: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
  noteBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
  },
  noteText: {
    flex: 1,
    fontSize: 12.5,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
});
