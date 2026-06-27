import { Ionicons } from "@expo/vector-icons";
import React, { useEffect } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";

interface WhatsNewItem {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  title: string;
  body: string;
}

/**
 * Content shown for each app version. Add a new entry here whenever a
 * user-visible change ships and bump the version in app.json.
 *
 * Only the entry matching the *current* version is displayed; older entries
 * are kept for reference but never shown.
 */
const WHATS_NEW: Record<string, { headline: string; items: WhatsNewItem[] }> = {
  "1.0.1": {
    headline: "What's new in this update",
    items: [
      {
        icon: "flash-outline",
        title: "Sign-in is now faster and more reliable",
        body: 'We fixed a timing issue that could leave you looking at a loading spinner after tapping "Sign In". You should be in instantly.',
      },
      {
        icon: "shield-checkmark-outline",
        title: "Fewer unexpected sign-outs",
        body: "Session handling is more resilient, so you stay signed in across app restarts.",
      },
    ],
  },
};

export function WhatsNewModal({
  version,
  visible,
  onDismiss,
}: {
  version: string;
  visible: boolean;
  onDismiss: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const content = WHATS_NEW[version];

  // When the modal is triggered for a version that has no copy, silently mark
  // it as seen so the check doesn't fire again on the next launch.
  useEffect(() => {
    if (visible && !content) {
      onDismiss();
    }
  }, [visible, content, onDismiss]);

  if (!content) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onDismiss}
    >
      <Pressable style={styles.backdrop} onPress={onDismiss} />
      <View
        style={[
          styles.sheet,
          {
            backgroundColor: colors.background,
            borderColor: colors.border,
            paddingBottom: insets.bottom + 24,
          },
        ]}
      >
        <View style={styles.handle} />

        <View style={styles.headerRow}>
          <Text style={[styles.headline, { color: colors.foreground }]}>
            {content.headline}
          </Text>
          <TouchableOpacity onPress={onDismiss} hitSlop={10}>
            <Ionicons name="close" size={24} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>

        <View style={styles.itemList}>
          {content.items.map((item) => (
            <View key={item.title} style={styles.item}>
              <View
                style={[
                  styles.iconWrap,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <Ionicons name={item.icon} size={20} color={colors.primary} />
              </View>
              <View style={styles.itemText}>
                <Text style={[styles.itemTitle, { color: colors.foreground }]}>
                  {item.title}
                </Text>
                <Text
                  style={[styles.itemBody, { color: colors.mutedForeground }]}
                >
                  {item.body}
                </Text>
              </View>
            </View>
          ))}
        </View>

        <TouchableOpacity
          style={[styles.btn, { backgroundColor: colors.primary }]}
          onPress={onDismiss}
        >
          <Text style={styles.btnText}>Got it</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 24,
    paddingTop: 10,
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(128,128,128,0.4)",
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 20,
    gap: 12,
  },
  headline: {
    flex: 1,
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    lineHeight: 26,
  },
  itemList: { gap: 16, marginBottom: 24 },
  item: { flexDirection: "row", gap: 14, alignItems: "flex-start" },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  itemText: { flex: 1, gap: 3 },
  itemTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", lineHeight: 21 },
  itemBody: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 19,
  },
  btn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  btnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
