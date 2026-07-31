import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import React from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
} from "react-native";
import { useColors } from "@/hooks/useColors";
import { useIsTablet } from "@/hooks/useIsTablet";
import { IPadSidebar } from "@/components/IPadSidebar";

function AskTabButton({
  onPress,
}: {
  onPress?: (e: GestureResponderEvent) => void;
}) {
  const colors = useColors();
  return (
    <Pressable onPress={onPress} style={styles.askButtonWrap}>
      <View style={[styles.askBubble, { backgroundColor: colors.primary }]}>
        <Ionicons name="chatbubble-ellipses" size={24} color="#fff" />
      </View>
      <Text style={[styles.askLabel, { color: colors.primary }]}>Ask</Text>
    </Pressable>
  );
}

export default function TabLayout() {
  const colors = useColors();
  const isTablet = useIsTablet();

  return (
    <Tabs
      tabBar={isTablet ? (props) => <IPadSidebar {...props} /> : undefined}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          borderTopWidth: 1,
        },
        tabBarLabelStyle: {
          fontFamily: "Inter_500Medium",
          fontSize: 11,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="tools"
        options={{
          title: "Tools",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="heart-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="ask"
        options={{
          title: "Ask",
          tabBarButton: isTablet
            ? undefined
            : (props) => <AskTabButton onPress={props.onPress} />,
        }}
      />
      <Tabs.Screen
        name="learn"
        options={{
          title: "Learn",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="book-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="visit-prep"
        options={{
          title: "Get Ready",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="checkmark-done-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "My Info",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  askButtonWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-start",
  },
  askBubble: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginTop: -18,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  askLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    marginTop: 2,
  },
});
