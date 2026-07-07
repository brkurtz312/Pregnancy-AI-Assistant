import { useContext } from "react";
import { useColorScheme } from "react-native";

import colors from "@/constants/colors";
import { SettingsContext } from "@/contexts/SettingsContext";

/**
 * Returns the design tokens for the current color scheme.
 *
 * When the user has enabled Auto Light/Dark Mode (the default), the palette
 * follows the device system setting via useColorScheme(). When auto mode is
 * off, it uses the user's manually chosen mode stored in SettingsContext.
 */
export function useColors() {
  const systemScheme = useColorScheme();
  const { themeAuto, themeMode } = useContext(SettingsContext);
  const scheme = themeAuto ? (systemScheme ?? "light") : themeMode;
  const palette = scheme === "dark" ? colors.dark : colors.light;
  return { ...palette, radius: colors.radius };
}
