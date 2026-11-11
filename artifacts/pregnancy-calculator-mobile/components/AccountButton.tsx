import { useAppAuth as useAuth } from "@/hooks/useAppAuth";
import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";

import { AccountSheet } from "@/components/AccountSheet";
import { usePass } from "@/hooks/usePass";
import type { FunnelSource } from "@/lib/analytics";

/**
 * Header entry point for account + pass management. Renders a person icon that
 * opens the account sheet, with a small badge when the Full Pregnancy Pass is
 * active. Placed in the home header; safe to render signed-out.
 */
export function AccountButton({
  source = "other",
}: {
  /** Where this button lives, for funnel counting. */
  source?: FunnelSource;
} = {}) {
  const [open, setOpen] = useState(false);
  const { isSignedIn } = useAuth();
  const pass = usePass();

  return (
    <>
      <TouchableOpacity
        style={styles.button}
        onPress={() => setOpen(true)}
        hitSlop={10}
        accessibilityLabel="Account and pass"
      >
        <Ionicons
          name={isSignedIn ? "person-circle" : "person-circle-outline"}
          size={28}
          color="#fff"
        />
        {isSignedIn && pass.hasPass && <View style={styles.badge} />}
      </TouchableOpacity>
      <AccountSheet
        visible={open}
        onClose={() => setOpen(false)}
        source={source}
      />
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    top: -1,
    right: -1,
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: "#34D399",
    borderWidth: 1.5,
    borderColor: "#fff",
  },
});
