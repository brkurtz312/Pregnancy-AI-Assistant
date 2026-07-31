import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, router } from "expo-router";
import React, { useCallback, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { ResponsiveContainer } from "@/components/ResponsiveContainer";

type SectionOption = {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  route: string;
};

const SECTIONS: SectionOption[] = [
  {
    key: "prenatal-care",
    icon: "clipboard-outline",
    title: "Prenatal Care",
    description: "Office visits, prenatal testing, and your birth plan.",
    route: "/prenatal-care",
  },
  {
    key: "labor-delivery",
    icon: "pulse-outline",
    title: "Labor and Delivery",
    description: "What to expect and how to prepare for the big day.",
    route: "/labor-delivery",
  },
  {
    key: "postpartum",
    icon: "flower-outline",
    title: "Postpartum",
    description: "Recovery, newborn care, and support after birth.",
    route: "/postpartum",
  },
];

export default function GetReadyScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [pickerVisible, setPickerVisible] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setPickerVisible(true);
    }, []),
  );

  const handleSelect = useCallback((route: string) => {
    setPickerVisible(false);
    router.push(route as never);
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ResponsiveContainer
        style={[styles.content, { paddingTop: insets.top + 40 }]}
      >
        <Ionicons
          name="checkmark-done-circle-outline"
          size={48}
          color={colors.mutedForeground}
        />
        <Text style={[styles.title, { color: colors.foreground }]}>
          Get Ready
        </Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Choose a section to prepare for your pregnancy journey.
        </Text>
        <Pressable
          style={[styles.openBtn, { backgroundColor: colors.primary }]}
          onPress={() => setPickerVisible(true)}
        >
          <Text
            style={[styles.openBtnText, { color: colors.primaryForeground }]}
          >
            Choose a Section
          </Text>
        </Pressable>
      </ResponsiveContainer>

      <Modal
        visible={pickerVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setPickerVisible(false)}
      >
        <Pressable
          style={styles.overlay}
          onPress={() => setPickerVisible(false)}
        >
          <Pressable
            style={[styles.sheet, { backgroundColor: colors.card }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: colors.foreground }]}>
                Get Ready
              </Text>
              <Pressable
                onPress={() => setPickerVisible(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons
                  name="close"
                  size={22}
                  color={colors.mutedForeground}
                />
              </Pressable>
            </View>
            <Text style={[styles.sheetSub, { color: colors.mutedForeground }]}>
              What would you like to get ready for?
            </Text>

            {SECTIONS.map((section) => (
              <Pressable
                key={section.key}
                style={[
                  styles.option,
                  { backgroundColor: colors.muted, borderColor: colors.border },
                ]}
                onPress={() => handleSelect(section.route)}
              >
                <View
                  style={[
                    styles.optionIcon,
                    { backgroundColor: colors.primary + "18" },
                  ]}
                >
                  <Ionicons
                    name={section.icon}
                    size={20}
                    color={colors.primary}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={[styles.optionTitle, { color: colors.foreground }]}
                  >
                    {section.title}
                  </Text>
                  <Text
                    style={[
                      styles.optionDesc,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    {section.description}
                  </Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={colors.mutedForeground}
                />
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 32,
    gap: 12,
  },
  title: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
    marginTop: 4,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 8,
  },
  openBtn: {
    borderRadius: 24,
    paddingHorizontal: 22,
    paddingVertical: 12,
  },
  openBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    padding: 24,
  },
  sheet: {
    borderRadius: 24,
    padding: 20,
  },
  sheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  sheetTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  sheetSub: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginBottom: 16,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
  },
  optionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  optionTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 2,
  },
  optionDesc: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 16,
  },
});
