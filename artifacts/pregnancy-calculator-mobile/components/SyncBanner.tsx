import React, { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

interface SyncBannerProps {
  visible: boolean;
  synced?: boolean;
  message?: string;
}

export function SyncBanner({
  visible,
  synced = false,
  message = "Saved locally — will sync when you're back online.",
}: SyncBannerProps) {
  const [showSynced, setShowSynced] = useState(false);
  const opacity = useRef(new Animated.Value(0)).current;
  const prevSyncedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (synced && !prevSyncedRef.current) {
      setShowSynced(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setShowSynced(false), 2000);
    }
    prevSyncedRef.current = synced;
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [synced]);

  const shouldShow = visible || showSynced;
  const isSynced = !visible && showSynced;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: shouldShow ? 1 : 0,
      duration: 260,
      useNativeDriver: true,
    }).start();
  }, [shouldShow, opacity]);

  return (
    <Animated.View style={[styles.banner, { opacity }]} pointerEvents="none">
      <View
        style={[
          styles.inner,
          isSynced ? styles.innerSynced : styles.innerOffline,
        ]}
      >
        <Ionicons
          name={isSynced ? "checkmark-circle-outline" : "cloud-offline-outline"}
          size={15}
          color="#fff"
        />
        <Text style={styles.text}>
          {isSynced ? "All changes saved" : message}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: "absolute",
    bottom: 16,
    left: 16,
    right: 16,
    zIndex: 100,
  },
  inner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  innerOffline: {
    backgroundColor: "rgba(60,60,60,0.92)",
  },
  innerSynced: {
    backgroundColor: "rgba(34,139,82,0.92)",
  },
  text: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    flex: 1,
    lineHeight: 18,
  },
});
