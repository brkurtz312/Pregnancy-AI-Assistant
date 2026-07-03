import { useRef, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Animated } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ClinicalData } from "@/constants/fetalStages";

const ACCENT = "#4ecdc4";

export function ClinicalDrawer({ data }: { data: ClinicalData }) {
  const [open, setOpen] = useState(false);
  const heightAnim = useRef(new Animated.Value(0)).current;

  function toggle() {
    const next = !open;
    setOpen(next);
    Animated.timing(heightAnim, {
      toValue: next ? 1 : 0,
      duration: 280,
      useNativeDriver: false,
    }).start();
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity
        onPress={toggle}
        activeOpacity={0.75}
        style={[
          styles.toggleBtn,
          { borderColor: open ? "rgba(78,205,196,0.55)" : "rgba(78,205,196,0.28)" },
        ]}
      >
        <Ionicons name="medkit-outline" size={14} color={open ? ACCENT : "#7abcb4"} />
        <Text style={[styles.toggleText, { color: open ? ACCENT : "#7abcb4" }]}>
          Clinical Reference
        </Text>
        <Ionicons
          name={open ? "chevron-up" : "chevron-down"}
          size={13}
          color={open ? ACCENT : "#7abcb4"}
        />
      </TouchableOpacity>

      {open && (
        <Animated.View
          style={[
            styles.panel,
            {
              opacity: heightAnim,
            },
          ]}
        >
          <Text style={styles.summary}>{data.summary}</Text>

          <View style={styles.paramsGrid}>
            {data.params.map((p, i) => (
              <View key={i} style={styles.paramRow}>
                <Text style={styles.paramLabel}>{p.label}</Text>
                <Text style={styles.paramValue}>{p.value}</Text>
              </View>
            ))}
          </View>

          {data.action && (
            <View style={styles.actionRow}>
              <Text style={styles.actionFlag}>⚑</Text>
              <Text style={styles.actionText}>{data.action}</Text>
            </View>
          )}
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 18, alignSelf: "stretch" },
  toggleBtn: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  toggleText: {
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  panel: {
    marginTop: 10,
    backgroundColor: "rgba(78,205,196,0.05)",
    borderWidth: 1,
    borderColor: "rgba(78,205,196,0.18)",
    borderRadius: 6,
    padding: 14,
  },
  summary: {
    fontSize: 13,
    lineHeight: 20,
    color: "#b0d4ce",
    paddingBottom: 10,
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(78,205,196,0.1)",
  },
  paramsGrid: { gap: 8 },
  paramRow: { gap: 2 },
  paramLabel: {
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: "#5db0a6",
  },
  paramValue: {
    fontSize: 13,
    lineHeight: 18,
    color: "#d4eae6",
  },
  actionRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(78,205,196,0.1)",
  },
  actionFlag: { color: ACCENT, fontSize: 12, marginTop: 1 },
  actionText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    color: "#7abcb4",
  },
});
