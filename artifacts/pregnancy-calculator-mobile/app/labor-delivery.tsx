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

export default function LaborDeliveryScreen() {
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
            Labor and Delivery
          </Text>
          <Text style={[styles.pageSub, { color: colors.mutedForeground }]}>
            Get ready for the big day
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
                pathname: "/labor-natural-induced",
                params: { from: "Labor and Delivery" },
              })
            }
          >
            <View
              style={[
                styles.learnIcon,
                { backgroundColor: colors.primary + "18" },
              ]}
            >
              <Ionicons name="body-outline" size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.learnTitle, { color: colors.foreground }]}>
                Labor - Natural and Induced
              </Text>
              <Text
                style={[styles.learnSub, { color: colors.mutedForeground }]}
              >
                Signs of labor, what to expect, and how induction works
              </Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={colors.mutedForeground}
            />
          </TouchableOpacity>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(120).duration(400)}>
          <TouchableOpacity
            style={[
              styles.learnCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
            onPress={() =>
              router.push({
                pathname: "/labor-pain-management",
                params: { from: "Labor and Delivery" },
              })
            }
          >
            <View
              style={[
                styles.learnIcon,
                { backgroundColor: colors.primary + "18" },
              ]}
            >
              <Ionicons
                name="medkit-outline"
                size={20}
                color={colors.primary}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.learnTitle, { color: colors.foreground }]}>
                Pain Management in Labor
              </Text>
              <Text
                style={[styles.learnSub, { color: colors.mutedForeground }]}
              >
                Your options, from breathing and movement to epidurals
              </Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={colors.mutedForeground}
            />
          </TouchableOpacity>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(180).duration(400)}>
          <TouchableOpacity
            style={[
              styles.learnCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
            onPress={() =>
              router.push({
                pathname: "/cesarean-birth",
                params: { from: "Labor and Delivery" },
              })
            }
          >
            <View
              style={[
                styles.learnIcon,
                { backgroundColor: colors.primary + "18" },
              ]}
            >
              <Ionicons name="cut-outline" size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.learnTitle, { color: colors.foreground }]}>
                What about a Cesarean
              </Text>
              <Text
                style={[styles.learnSub, { color: colors.mutedForeground }]}
              >
                What to expect, recovery, and future pregnancies
              </Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={colors.mutedForeground}
            />
          </TouchableOpacity>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(240).duration(400)}>
          <TouchableOpacity
            style={[
              styles.learnCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
            onPress={() =>
              router.push({
                pathname: "/hospital-bag",
                params: { from: "Labor and Delivery" },
              })
            }
          >
            <View
              style={[
                styles.learnIcon,
                { backgroundColor: colors.primary + "18" },
              ]}
            >
              <Ionicons name="bag-outline" size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.learnTitle, { color: colors.foreground }]}>
                Hospital Bag Checklist
              </Text>
              <Text
                style={[styles.learnSub, { color: colors.mutedForeground }]}
              >
                Check off what to pack, then print or save it as a PDF
              </Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={colors.mutedForeground}
            />
          </TouchableOpacity>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(300).duration(400)}>
          <TouchableOpacity
            style={[
              styles.learnCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
            onPress={() =>
              router.push({
                pathname: "/support-person-vol2",
                params: { from: "Labor and Delivery" },
              })
            }
          >
            <View
              style={[
                styles.learnIcon,
                { backgroundColor: colors.primary + "18" },
              ]}
            >
              <Ionicons
                name="hand-left-outline"
                size={20}
                color={colors.primary}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.learnTitle, { color: colors.foreground }]}>
                Support Person Survival Series · Vol 2
              </Text>
              <Text
                style={[styles.learnSub, { color: colors.mutedForeground }]}
              >
                "Can We Do This?" — the labor & delivery handbook for your
                support person
              </Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={colors.mutedForeground}
            />
          </TouchableOpacity>
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
});
