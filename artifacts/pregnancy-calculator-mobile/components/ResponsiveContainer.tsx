import React from "react";
import { StyleSheet, View, type ViewStyle, type StyleProp } from "react-native";
import { useIsTablet } from "@/hooks/useIsTablet";

interface ResponsiveContainerProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /**
   * Maximum content width in points when on tablet.
   * Defaults to 680 — comfortable reading width for most content.
   */
  maxWidth?: number;
}

/**
 * Centres content with a max-width constraint on iPad so it doesn't stretch
 * across the full screen. On iPhone it renders as a plain full-width View.
 */
export function ResponsiveContainer({
  children,
  style,
  maxWidth = 680,
}: ResponsiveContainerProps) {
  const isTablet = useIsTablet();

  if (!isTablet) {
    return <View style={[styles.base, style]}>{children}</View>;
  }

  return (
    <View style={styles.tabletOuter}>
      <View style={[styles.base, { maxWidth, width: "100%" }, style]}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    flex: 1,
  },
  tabletOuter: {
    flex: 1,
    alignItems: "center",
  },
});
