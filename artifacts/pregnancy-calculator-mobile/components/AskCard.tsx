import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useColors } from "@/hooks/useColors";

interface AskCardProps {
  returnTo: string;
}

export function AskCard({ returnTo }: AskCardProps) {
  const colors = useColors();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.primary },
      ]}
    >
      <Ionicons
        name="chatbubble-ellipses-outline"
        size={22}
        color={colors.primary}
        style={{ marginBottom: 8 }}
      />
      <Text style={[styles.heading, { color: colors.foreground }]}>
        Have more questions?
      </Text>
      <Text style={[styles.body, { color: colors.mutedForeground }]}>
        Our AI assistant can answer questions about your pregnancy, your
        options, and what to expect.
      </Text>
      <TouchableOpacity
        style={[styles.btn, { backgroundColor: colors.primary }]}
        onPress={() =>
          router.push({
            pathname: "/ask",
            params: { returnTo },
          })
        }
      >
        <Ionicons
          name="chatbubble-ellipses"
          size={17}
          color={colors.primaryForeground}
        />
        <Text style={[styles.btnText, { color: colors.primaryForeground }]}>
          Go to Ask
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    borderWidth: 1.5,
    padding: 16,
    marginBottom: 16,
    alignItems: "flex-start",
  },
  heading: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 6,
  },
  body: {
    fontSize: 13.5,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
    marginBottom: 14,
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 18,
  },
  btnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
});
