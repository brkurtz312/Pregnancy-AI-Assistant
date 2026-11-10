import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

interface SidebarRoute {
  key: string;
  name: string;
}

// Matches expo-router's BottomTabBarProps (SDK 58), which hands custom tab
// bars `navigateToTab(routeKey)` instead of the old `navigation` object.
interface SidebarProps {
  state: { routes: SidebarRoute[]; index: number };
  navigateToTab: (routeKey: string) => void;
  descriptors?: unknown;
}

const SIDEBAR_WIDTH = 220;

const TAB_ICONS: Record<
  string,
  {
    icon: keyof typeof Ionicons.glyphMap;
    activeIcon: keyof typeof Ionicons.glyphMap;
    label: string;
  }
> = {
  index: { icon: "home-outline", activeIcon: "home", label: "Home" },
  tools: { icon: "heart-outline", activeIcon: "heart", label: "Tools" },
  ask: {
    icon: "chatbubble-ellipses-outline",
    activeIcon: "chatbubble-ellipses",
    label: "Ask",
  },
  learn: { icon: "book-outline", activeIcon: "book", label: "Learn" },
  "visit-prep": {
    icon: "checkmark-done-outline",
    activeIcon: "checkmark-done",
    label: "Get Ready",
  },
  profile: { icon: "person-outline", activeIcon: "person", label: "My Info" },
};

export function IPadSidebar({ state, navigateToTab }: SidebarProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.sidebar,
        {
          backgroundColor: colors.card,
          borderRightColor: colors.border,
          paddingTop: insets.top + 16,
          paddingBottom: insets.bottom + 16,
        },
      ]}
    >
      {/* App title */}
      <View style={styles.brandRow}>
        <Ionicons name="heart" size={20} color={colors.primary} />
        <Text style={[styles.brandText, { color: colors.foreground }]}>
          Pregnancy AI
        </Text>
      </View>

      <View style={styles.divider} />

      {/* Nav items */}
      <View style={styles.navItems}>
        {state.routes.map((route: SidebarRoute, index: number) => {
          const isFocused = state.index === index;
          const meta = TAB_ICONS[route.name];
          if (!meta) return null;

          return (
            <Pressable
              key={route.key}
              style={({ pressed }) => [
                styles.navItem,
                isFocused && { backgroundColor: colors.primary + "18" },
                pressed && { opacity: 0.7 },
              ]}
              onPress={() => {
                if (!isFocused) {
                  navigateToTab(route.key);
                }
              }}
            >
              <View
                style={[
                  styles.iconWrap,
                  route.name === "ask" && {
                    backgroundColor: colors.primary,
                    borderRadius: 12,
                    padding: 2,
                  },
                ]}
              >
                <Ionicons
                  name={isFocused ? meta.activeIcon : meta.icon}
                  size={22}
                  color={
                    route.name === "ask"
                      ? "#fff"
                      : isFocused
                        ? colors.primary
                        : colors.mutedForeground
                  }
                />
              </View>
              <Text
                style={[
                  styles.navLabel,
                  {
                    color: isFocused ? colors.primary : colors.mutedForeground,
                    fontFamily: isFocused
                      ? "Inter_600SemiBold"
                      : "Inter_400Regular",
                  },
                ]}
              >
                {meta.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    width: SIDEBAR_WIDTH,
    borderRightWidth: 1,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  brandText: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  divider: {
    height: 1,
    backgroundColor: "rgba(0,0,0,0.08)",
    marginHorizontal: 16,
    marginBottom: 12,
  },
  navItems: {
    gap: 2,
    paddingHorizontal: 8,
  },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  iconWrap: {
    width: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  navLabel: {
    fontSize: 15,
  },
});
