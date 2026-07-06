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

export default function PostpartumScreen() {
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
            Get Ready
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
            Postpartum
          </Text>
          <Text style={[styles.pageSub, { color: colors.mutedForeground }]}>
            Guidance on recovery and newborn care after birth
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(60).duration(400)}>
          <TouchableOpacity
            style={[
              styles.learnCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
            onPress={() =>
              router.push({
                pathname: "/postpartum-depression",
                params: { from: "Postpartum" },
              })
            }
          >
            <View
              style={[
                styles.learnIcon,
                { backgroundColor: colors.primary + "18" },
              ]}
            >
              <Ionicons name="heart-outline" size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.learnTitle, { color: colors.foreground }]}>
                Postpartum Depression
              </Text>
              <Text
                style={[styles.learnSub, { color: colors.mutedForeground }]}
              >
                Learn the warning signs, get crisis resources, and find support
                near you
              </Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={colors.mutedForeground}
            />
          </TouchableOpacity>
        </Animated.View>

        <Animated.View
          entering={FadeInDown.delay(120).duration(400)}
          style={[
            styles.comingSoonCard,
            { backgroundColor: colors.primary + "10" },
          ]}
        >
          <Ionicons name="flower-outline" size={28} color={colors.primary} />
          <Text style={[styles.comingSoonText, { color: colors.foreground }]}>
            More guidance on recovery and newborn care is coming soon.
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
    marginBottom: 16,
  },
  learnCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    marginBottom: 16,
  },
  learnIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  learnTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 2,
  },
  learnSub: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  comingSoonCard: {
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
    gap: 10,
  },
  comingSoonText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
    lineHeight: 20,
  },
});
