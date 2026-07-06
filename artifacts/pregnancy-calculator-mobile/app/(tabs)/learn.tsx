import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import {
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

const ACOG_URL = "https://www.acog.org/womens-health/resources-for-you";

function ResourceCard({
  icon,
  title,
  description,
  onPress,
  delay,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  onPress: () => void;
  delay: number;
}) {
  const colors = useColors();

  return (
    <Animated.View entering={FadeInDown.delay(delay).duration(400)}>
      <TouchableOpacity
        style={[
          styles.card,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
        onPress={onPress}
        activeOpacity={0.8}
      >
        <View
          style={[styles.cardIcon, { backgroundColor: colors.primary + "18" }]}
        >
          <Ionicons name={icon} size={20} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>
            {title}
          </Text>
          <Text style={[styles.cardDesc, { color: colors.mutedForeground }]}>
            {description}
          </Text>
        </View>
        <Ionicons
          name="chevron-forward"
          size={18}
          color={colors.mutedForeground}
        />
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function LearnScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[
        styles.scroll,
        { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <Animated.View entering={FadeInDown.duration(400)}>
        <Text style={[styles.pageTitle, { color: colors.foreground }]}>
          Learn
        </Text>
        <Text style={[styles.pageSub, { color: colors.mutedForeground }]}>
          Educational resources to help you understand your pregnancy journey.
        </Text>
      </Animated.View>

      <ResourceCard
        icon="leaf-outline"
        title="Fetal & Maternal Development"
        description="Explore week-by-week changes for your baby and your body, from conception to birth."
        onPress={() => router.push("/development")}
        delay={80}
      />

      <ResourceCard
        icon="document-text-outline"
        title="Understanding Prenatal Testing"
        description="What to expect and why routine and optional tests matter at each stage."
        onPress={() => router.push("/prenatal-testing")}
        delay={140}
      />

      <Animated.View
        entering={FadeInDown.delay(200).duration(400)}
        style={[
          styles.card,
          styles.externalCard,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <View
          style={[styles.cardIcon, { backgroundColor: colors.primary + "18" }]}
        >
          <Ionicons name="medkit-outline" size={20} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>
            ACOG Women&apos;s Health Resources
          </Text>
          <Text
            style={[
              styles.cardDesc,
              { color: colors.mutedForeground, marginBottom: 10 },
            ]}
          >
            The American College of Obstetricians and Gynecologists (ACOG) is
            the leading professional organization for OB-GYNs in the United
            States. Their women&apos;s health resource hub offers free,
            evidence-based guides on pregnancy, labor and delivery, postpartum
            care, and general women&apos;s health topics — written and reviewed
            by practicing physicians.
          </Text>
          <TouchableOpacity
            style={[styles.linkBtn, { borderColor: colors.primary }]}
            onPress={() => Linking.openURL(ACOG_URL)}
            activeOpacity={0.8}
          >
            <Ionicons name="open-outline" size={16} color={colors.primary} />
            <Text style={[styles.linkBtnText, { color: colors.primary }]}>
              Visit acog.org
            </Text>
          </TouchableOpacity>
        </View>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(260).duration(400)}>
        <Text style={[styles.footerNote, { color: colors.mutedForeground }]}>
          More educational links and resources are on the way.
        </Text>
      </Animated.View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: 16,
  },
  pageTitle: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    marginBottom: 4,
  },
  pageSub: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    marginBottom: 20,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 18,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
  },
  externalCard: {
    alignItems: "flex-start",
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
    lineHeight: 19,
  },
  linkBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  linkBtnText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  footerNote: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    marginTop: 4,
    marginBottom: 8,
  },
});
