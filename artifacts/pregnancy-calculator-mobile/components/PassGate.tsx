import { Ionicons } from "@expo/vector-icons";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useColors } from "@/hooks/useColors";
import { PURCHASE_LOCATION_HINT } from "@/lib/app-store";

interface PassGateProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  description: string;
}

export function PassGate({
  visible,
  onClose,
  title,
  description,
}: PassGateProps) {
  const colors = useColors();

  return (
    <Modal visible={visible} transparent animationType="fade">
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: colors.background }]}
          onPress={() => {}}
        >
          <View
            style={[
              styles.iconWrap,
              { backgroundColor: colors.primary + "22" },
            ]}
          >
            <Ionicons name="star" size={30} color={colors.primary} />
          </View>

          <Text style={[styles.title, { color: colors.foreground }]}>
            {title}
          </Text>
          <Text style={[styles.desc, { color: colors.mutedForeground }]}>
            {description}
          </Text>

          {/* This used to open a browser to Stripe checkout — an external
              purchase for digital content, on iOS. The pass is bought with the
              in-app purchase in the account sheet, which is the one place that
              flow lives. See docs/stripe-removal-plan.md. */}
          <Text
            style={[styles.hint, { color: colors.mutedForeground }]}
            accessibilityRole="text"
          >
            {PURCHASE_LOCATION_HINT}
          </Text>

          <TouchableOpacity
            style={[styles.btn, { backgroundColor: colors.primary }]}
            onPress={onClose}
            accessibilityLabel="Close"
          >
            <Ionicons
              name="lock-open-outline"
              size={17}
              color={colors.primaryForeground}
            />
            <Text style={[styles.btnText, { color: colors.primaryForeground }]}>
              Got it
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={onClose} style={styles.cancelBtn}>
            <Text
              style={[styles.cancelText, { color: colors.mutedForeground }]}
            >
              Not now
            </Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  sheet: {
    width: "100%",
    borderRadius: 24,
    padding: 28,
    alignItems: "center",
    gap: 12,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  title: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  desc: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 21,
    textAlign: "center",
    marginBottom: 4,
  },
  hint: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 19,
    textAlign: "center",
    marginTop: 6,
    marginBottom: 10,
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 14,
    paddingVertical: 15,
    paddingHorizontal: 24,
    width: "100%",
    marginTop: 4,
  },
  btnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  cancelBtn: {
    paddingVertical: 8,
    marginTop: 2,
  },
  cancelText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
});
